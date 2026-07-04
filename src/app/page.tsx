"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type UploadResult = {
  downloadUrl: string;
  fileName: string;
};

type ApiStep =
  | "idle"
  | "uploading-image"
  | "uploading-audio"
  | "creating-task"
  | "processing"
  | "success"
  | "error";

const POLL_INTERVAL_MS = 10_000;

const FLOW_STEPS = [
  { id: 1, label: "Image", description: "Upload portrait" },
  { id: 2, label: "Audio", description: "Add voice track" },
  { id: 3, label: "Prompt", description: "Describe scene" },
  { id: 4, label: "Generate", description: "Create video" },
] as const;

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function extractVideoUrl(payload: unknown): string | null {
  if (!payload) return null;

  if (typeof payload === "string") {
    if (payload.startsWith("http")) return payload;
    try {
      return extractVideoUrl(JSON.parse(payload));
    } catch {
      return null;
    }
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const found = extractVideoUrl(entry);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;

  for (const key of [
    "resultJson",
    "resultUrls",
    "resultUrl",
    "videoUrl",
    "video_url",
    "output",
    "result",
    "url",
  ]) {
    const found = extractVideoUrl(data[key]);
    if (found) return found;
  }

  return null;
}

function StepIcon({ step }: { step: number }) {
  const className = "h-5 w-5";
  if (step === 1) {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (step === 2) {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    );
  }
  if (step === 3) {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

export default function HomePage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [apiStep, setApiStep] = useState<ApiStep>("idle");
  const [message, setMessage] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [statusRaw, setStatusRaw] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const imagePreview = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  const audioPreview = useMemo(() => {
    if (!audioFile) return null;
    return URL.createObjectURL(audioFile);
  }, [audioFile]);

  const flowStep = !imageFile
    ? 1
    : !audioFile
      ? 2
      : !prompt.trim()
        ? 3
        : 4;

  const canGenerate = Boolean(imageFile && audioFile && prompt.trim());

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    return () => {
      if (audioPreview) URL.revokeObjectURL(audioPreview);
    };
  }, [audioPreview]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function resetResult() {
    if (pollRef.current) clearInterval(pollRef.current);
    setApiStep("idle");
    setMessage("");
    setTaskId(null);
    setVideoUrl(null);
    setStatusRaw("");
  }

  function handleImageSelect(file: File | null) {
    setImageFile(file);
    setAudioFile(null);
    setPrompt("");
    resetResult();
  }

  function handleAudioSelect(file: File | null) {
    setAudioFile(file);
    setPrompt("");
    resetResult();
  }

  function handlePromptChange(value: string) {
    setPrompt(value);
    resetResult();
  }

  async function uploadFile(file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.msg || "Upload failed");
    }

    return {
      downloadUrl: data.data.downloadUrl as string,
      fileName: data.data.fileName as string,
    };
  }

  async function pollTask(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);

    const check = async () => {
      try {
        const response = await fetch(`/api/status?taskId=${encodeURIComponent(id)}`);
        const data = await response.json();
        setStatusRaw(JSON.stringify(data, null, 2));

        if (!response.ok || !data.success) {
          return;
        }

        const state =
          data?.data?.state ||
          data?.data?.status ||
          data?.data?.taskStatus ||
          "";

        const stateText = String(state).toLowerCase();
        const video = extractVideoUrl(data?.data);

        if (video) {
          setVideoUrl(video);
          setApiStep("success");
          setMessage("Your video is ready. Preview and download it below.");
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }

        if (
          stateText.includes("fail") ||
          stateText.includes("error") ||
          stateText === "failed"
        ) {
          setApiStep("error");
          setMessage(data?.data?.failMsg || data?.msg || "Video generation failed");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Keep polling on transient network errors.
      }
    };

    await check();
    pollRef.current = setInterval(check, POLL_INTERVAL_MS);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!imageFile || !audioFile || !prompt.trim()) {
      setApiStep("error");
      setMessage("Please complete the image, audio, and prompt steps first.");
      return;
    }

    setVideoUrl(null);
    setTaskId(null);
    setStatusRaw("");
    setMessage("");

    try {
      setApiStep("uploading-image");
      setMessage("Step 1 of 3: Uploading image...");
      const imageUpload = await uploadFile(imageFile);

      setApiStep("uploading-audio");
      setMessage("Step 2 of 3: Uploading audio...");
      const audioUpload = await uploadFile(audioFile);

      setApiStep("creating-task");
      setMessage("Step 3 of 3: Starting video generation...");

      const generateResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageUpload.downloadUrl,
          audioUrl: audioUpload.downloadUrl,
          prompt: prompt.trim(),
        }),
      });

      const generateData = await generateResponse.json();
      if (!generateResponse.ok || !generateData.success) {
        throw new Error(generateData.msg || "Failed to start video generation");
      }

      const id = generateData.data?.taskId as string | undefined;
      if (!id) {
        throw new Error("Task ID was not returned. Please try again.");
      }

      setTaskId(id);
      setApiStep("processing");
      setMessage("Video is being generated. Please wait...");
      await pollTask(id);
    } catch (error) {
      setApiStep("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  const isLoading =
    apiStep === "uploading-image" ||
    apiStep === "uploading-audio" ||
    apiStep === "creating-task" ||
    apiStep === "processing";

  const statusLabel =
    apiStep === "idle"
      ? "Waiting for input"
      : apiStep === "uploading-image"
        ? "Uploading image"
        : apiStep === "uploading-audio"
          ? "Uploading audio"
          : apiStep === "creating-task"
            ? "Creating task"
            : apiStep === "processing"
              ? "Generating video"
              : apiStep === "success"
                ? "Completed"
                : "Failed";

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg" />

      <header className="relative z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/25">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900">Kie Video Studio</p>
              <p className="text-xs text-slate-500">AI talking video generator</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            System online
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="mb-10 max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
            Powered by Kie AI
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Create cinematic talking videos
            <span className="block bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-600 bg-clip-text text-transparent">
              in a few simple steps
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Upload a portrait image, attach an audio track, describe the scene, and generate a
            professional talking video. Files are uploaded only when you click Generate.
          </p>
        </section>

        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {FLOW_STEPS.map((item) => {
            const done = flowStep > item.id;
            const active = flowStep === item.id;

            return (
              <div
                key={item.id}
                className={`surface rounded-2xl p-4 transition ${
                  done
                    ? "border-emerald-200 bg-emerald-50"
                    : active
                      ? "border-violet-200 bg-violet-50"
                      : "opacity-80"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      done
                        ? "bg-emerald-100 text-emerald-700"
                        : active
                          ? "bg-violet-100 text-violet-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {done ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <StepIcon step={item.id} />
                    )}
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Step {item.id}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500">{item.description}</p>
              </div>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <form onSubmit={handleSubmit} className="surface rounded-3xl p-5 sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Project setup</h2>
                <p className="mt-1 text-sm text-slate-500">Complete each step in order.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                {flowStep}/4 ready
              </span>
            </div>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                  1
                </span>
                <h3 className="text-sm font-semibold text-slate-900">Select image</h3>
              </div>

              <label
                className={`dropzone group flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-5 text-center ${
                  imageFile ? "has-file" : ""
                }`}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={isLoading}
                  onChange={(e) => handleImageSelect(e.target.files?.[0] || null)}
                />
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreview}
                    alt="Selected image preview"
                    className="mb-3 h-40 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                    <StepIcon step={1} />
                  </div>
                )}
                <p className="text-sm font-semibold text-slate-900">
                  {imageFile ? "Image selected — click to change" : "Click to upload image"}
                </p>
                <p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP · Max 10MB</p>
                {imageFile && (
                  <p className="mt-2 text-xs text-cyan-700">
                    {imageFile.name} · {formatBytes(imageFile.size)}
                  </p>
                )}
              </label>
            </section>

            {imageFile && (
              <section className="mt-8 animate-fade-up">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700">
                    2
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">Select audio</h3>
                </div>

                <label
                  className={`dropzone group flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-5 text-center ${
                    audioFile ? "has-file" : ""
                  }`}
                >
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/x-wav,audio/aac,audio/mp4,audio/ogg,.mp3,.wav,.aac,.ogg,.m4a"
                    className="hidden"
                    disabled={isLoading}
                    onChange={(e) => handleAudioSelect(e.target.files?.[0] || null)}
                  />
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                    <StepIcon step={2} />
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {audioFile ? "Audio selected — click to change" : "Click to upload audio"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">MP3, WAV, AAC, OGG · Max 10MB</p>
                  {audioFile && (
                    <>
                      <p className="mt-2 text-xs text-cyan-700">
                        {audioFile.name} · {formatBytes(audioFile.size)}
                      </p>
                      {audioPreview && (
                        <audio
                          controls
                          src={audioPreview}
                          className="mt-3 w-full max-w-md"
                          onClick={(e) => e.preventDefault()}
                        />
                      )}
                    </>
                  )}
                </label>
              </section>
            )}

            {imageFile && audioFile && (
              <section className="mt-8 animate-fade-up">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-700">
                    3
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">Write prompt</h3>
                </div>

                <textarea
                  value={prompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  rows={4}
                  disabled={isLoading}
                  placeholder="Example: A young woman with long dark hair speaking on a podcast, natural expressions, cinematic lighting..."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-violet-500/30 placeholder:text-slate-400 focus:ring-2 disabled:opacity-60"
                />
              </section>
            )}

            {canGenerate && (
              <div className="mt-8 animate-fade-up">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                    4
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">Generate video</h3>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold text-white transition"
                >
                  {isLoading ? (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      {apiStep === "uploading-image" && "Uploading image..."}
                      {apiStep === "uploading-audio" && "Uploading audio..."}
                      {apiStep === "creating-task" && "Starting generation..."}
                      {apiStep === "processing" && "Generating video..."}
                    </>
                  ) : (
                    "Generate Video"
                  )}
                </button>
              </div>
            )}
          </form>

          <aside className="space-y-6">
            <div className="surface rounded-3xl p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Generation status</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                    apiStep === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : apiStep === "error"
                        ? "bg-rose-50 text-rose-700"
                        : apiStep === "processing"
                          ? "bg-violet-50 text-violet-700"
                          : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>

              {message || taskId ? (
                <div
                  className={`rounded-2xl border p-4 text-sm ${
                    apiStep === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : apiStep === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {apiStep === "processing" && (
                    <div className="mb-3 flex items-center gap-2 text-violet-700">
                      <span className="pulse-ring h-2.5 w-2.5 rounded-full bg-violet-500" />
                      Waiting for video result
                    </div>
                  )}
                  {message && <p className="font-medium leading-relaxed">{message}</p>}
                  {taskId && (
                    <p className="mt-3 break-all text-xs text-slate-600">
                      Task ID:{" "}
                      <span className="font-mono text-violet-700">{taskId}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm text-slate-500">
                    Your generation progress and video preview will appear here.
                  </p>
                </div>
              )}
            </div>

            <div className="surface overflow-hidden rounded-3xl">
              {videoUrl ? (
                <>
                  <video src={videoUrl} controls className="aspect-video w-full bg-slate-900" />
                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
                    <p className="truncate text-xs text-slate-600">{videoUrl}</p>
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
                    >
                      Open
                    </a>
                  </div>
                </>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center bg-slate-50 px-6 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                    <StepIcon step={4} />
                  </div>
                  <p className="text-sm font-medium text-slate-700">Video preview</p>
                  <p className="mt-1 text-xs text-slate-500">
                    The finished video will play here once generation completes.
                  </p>
                </div>
              )}
            </div>

            {statusRaw && (
              <details className="surface rounded-3xl p-4">
                <summary className="cursor-pointer text-xs font-medium text-slate-600">
                  API status response
                </summary>
                <pre className="mt-3 overflow-x-auto text-[11px] leading-relaxed text-slate-500">
                  {statusRaw}
                </pre>
              </details>
            )}
          </aside>
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
          Selecting files does not call any API. All uploads and generation start only when you click
          Generate Video.
        </footer>
      </main>
    </div>
  );
}
