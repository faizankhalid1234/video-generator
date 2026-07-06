"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

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

const DEFAULT_PROMPT = `Create a realistic AI avatar video.

Input:
- One front-facing portrait image of a person.
- One audio file containing speech.

Requirements:
- Keep the person's identity and facial features unchanged.
- Synchronize lip movements accurately with the audio.
- Preserve natural eye blinking and subtle facial expressions.
- Do not alter clothing or background.
- Export as an MP4 video in the highest available quality.`;

const FLOW_STEPS = [
  { id: 1, label: "Image", description: "Upload portrait" },
  { id: 2, label: "Audio", description: "Add voice track" },
  { id: 3, label: "Prompt", description: "Avatar settings" },
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
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
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
    setPrompt(DEFAULT_PROMPT);
    resetResult();
  }

  function handleAudioSelect(file: File | null) {
    setAudioFile(file);
    setPrompt(DEFAULT_PROMPT);
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
        const apiMsg =
          generateData.msg ||
          generateData.data?.msg ||
          "Failed to start video generation";
        const isCreditsError =
          generateResponse.status === 402 ||
          String(apiMsg).toLowerCase().includes("credit");

        throw new Error(
          isCreditsError
            ? "Kie AI credits are insufficient. Please top up your balance at kie.ai, then try again."
            : apiMsg
        );
      }

      const id =
        (generateData.data?.taskId as string | undefined) ||
        (generateData.data?.task_id as string | undefined) ||
        (generateData.data?.recordId as string | undefined) ||
        (generateData.data?.record_id as string | undefined) ||
        (generateData.taskId as string | undefined);

      if (!id) {
        throw new Error(
          generateData.msg ||
            "Kie API did not return a task ID. Check your API token and credits."
        );
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
      <div className="orb orb-1 animate-float left-[-4rem] top-10 h-56 w-56" />
      <div className="orb orb-2 animate-float-slow right-[-3rem] top-24 h-64 w-64" />
      <div className="orb orb-3 bottom-10 left-1/3 h-52 w-52" />

      <header className="bg-header relative z-10 border-b backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-400 shadow-lg shadow-violet-500/30">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-ink text-sm font-bold tracking-tight">Kie Video Studio</p>
              <p className="text-muted text-xs font-medium">AI talking video generator</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="badge-online hidden items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              System online
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="mb-10 max-w-3xl">
          <p className="chip mb-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-violet-400 to-cyan-400" />
            Powered by Kie AI
          </p>
          <h1 className="text-ink text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Create cinematic
            <span className="mt-1 block bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              talking videos
            </span>
          </h1>
          <p className="text-soft mt-5 max-w-2xl text-sm leading-relaxed sm:text-base">
            Upload a portrait, add your voice track, describe the scene, and generate a polished
            talking video in minutes. Beautiful results, simple workflow.
          </p>
        </section>

        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {FLOW_STEPS.map((item) => {
            const done = flowStep > item.id;
            const active = flowStep === item.id;

            return (
              <div
                key={item.id}
                className={`step-card surface rounded-2xl p-4 ${
                  done ? "done" : active ? "active" : ""
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      done
                        ? "step-icon-done"
                        : active
                          ? "step-icon-active"
                          : "step-icon-idle"
                    }`}
                  >
                    {done ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <StepIcon step={item.id} />
                    )}
                  </div>
                  <span className="text-muted text-[11px] font-bold uppercase tracking-[0.16em]">
                    Step {item.id}
                  </span>
                </div>
                <p className="text-ink text-sm font-bold">{item.label}</p>
                <p className="text-muted mt-1 text-xs">{item.description}</p>
              </div>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <form onSubmit={handleSubmit} className="surface surface-glow rounded-[1.75rem] p-5 sm:p-8">
            <div className="mb-7 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-ink text-lg font-bold">Project setup</h2>
                <p className="text-muted mt-1 text-sm">Complete each step in order.</p>
              </div>
              <span className="chip rounded-full px-3.5 py-1 text-xs font-semibold">
                {flowStep}/4 ready
              </span>
            </div>

            <section>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-bold text-white shadow-md shadow-violet-500/30">
                  1
                </span>
                <h3 className="text-ink text-sm font-bold">Select image</h3>
              </div>

              <label
                className={`dropzone group flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center ${
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
                    className="mb-3 h-40 w-full rounded-2xl object-cover shadow-md"
                  />
                ) : (
                  <div className="step-icon-active mb-3 flex h-14 w-14 items-center justify-center rounded-2xl">
                    <StepIcon step={1} />
                  </div>
                )}
                <p className="text-ink text-sm font-bold">
                  {imageFile ? "Image selected — click to change" : "Click to upload image"}
                </p>
                <p className="text-muted mt-1 text-xs">JPG, PNG, WebP · Max 10MB</p>
                {imageFile && (
                  <p className="text-accent mt-2 text-xs font-medium">
                    {imageFile.name} · {formatBytes(imageFile.size)}
                  </p>
                )}
              </label>
            </section>

            {imageFile && (
              <section className="mt-8 animate-fade-up">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-xs font-bold text-white shadow-md shadow-cyan-500/20">
                    2
                  </span>
                  <h3 className="text-ink text-sm font-bold">Select audio</h3>
                </div>

                <label
                  className={`dropzone group flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center ${
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
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-500">
                    <StepIcon step={2} />
                  </div>
                  <p className="text-ink text-sm font-bold">
                    {audioFile ? "Audio selected — click to change" : "Click to upload audio"}
                  </p>
                  <p className="text-muted mt-1 text-xs">MP3, WAV, AAC, OGG · Max 10MB</p>
                  {audioFile && (
                    <>
                      <p className="text-accent-2 mt-2 text-xs font-medium">
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
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-xs font-bold text-white shadow-md shadow-indigo-500/25">
                    3
                  </span>
                  <h3 className="text-ink text-sm font-bold">Write prompt</h3>
                </div>

                <textarea
                  value={prompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  rows={12}
                  disabled={isLoading}
                  className="field w-full resize-y rounded-2xl px-4 py-3.5 text-sm leading-relaxed outline-none ring-violet-500/30 focus:ring-2 disabled:opacity-60"
                />
              </section>
            )}

            {canGenerate && (
              <div className="mt-8 animate-fade-up">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-xs font-bold text-white shadow-md shadow-emerald-500/20">
                    4
                  </span>
                  <h3 className="text-ink text-sm font-bold">Generate video</h3>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold text-white transition"
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
            <div className="surface surface-glow rounded-[1.75rem] p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-ink text-lg font-bold">Generation status</h2>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                    apiStep === "success"
                      ? "badge-success"
                      : apiStep === "error"
                        ? "badge-error"
                        : apiStep === "processing"
                          ? "badge-processing"
                          : "badge-idle"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>

              {message || taskId ? (
                <div
                  className={`rounded-2xl border p-4 text-sm ${
                    apiStep === "error"
                      ? "status-error"
                      : apiStep === "success"
                        ? "status-success"
                        : "status-processing"
                  }`}
                >
                  {apiStep === "processing" && (
                    <div className="text-accent mb-3 flex items-center gap-2 font-semibold">
                      <span className="pulse-ring h-2.5 w-2.5 rounded-full bg-violet-400" />
                      Waiting for video result
                    </div>
                  )}
                  {message && <p className="font-medium leading-relaxed">{message}</p>}
                  {taskId && (
                    <p className="text-muted mt-3 break-all text-xs">
                      Task ID:{" "}
                      <span className="text-accent font-mono font-semibold">{taskId}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="panel rounded-2xl border border-dashed px-4 py-10 text-center">
                  <p className="text-muted text-sm">
                    Your generation progress and video preview will appear here.
                  </p>
                </div>
              )}
            </div>

            <div className="surface overflow-hidden rounded-[1.75rem]">
              {videoUrl ? (
                <>
                  <video src={videoUrl} controls className="aspect-video w-full bg-black" />
                  <div className="footer-line flex items-center justify-between gap-3 border-t px-4 py-3">
                    <p className="text-muted truncate text-xs">{videoUrl}</p>
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
                    >
                      Open
                    </a>
                  </div>
                </>
              ) : (
                <div className="preview-empty flex aspect-video flex-col items-center justify-center px-6 text-center">
                  <div className="icon-box text-accent mb-3 flex h-14 w-14 items-center justify-center rounded-2xl">
                    <StepIcon step={4} />
                  </div>
                  <p className="text-ink text-sm font-bold">Video preview</p>
                  <p className="text-muted mt-1 text-xs">
                    The finished video will play here once generation completes.
                  </p>
                </div>
              )}
            </div>

            {statusRaw && (
              <details className="surface rounded-[1.75rem] p-4">
                <summary className="text-soft cursor-pointer text-xs font-semibold">
                  API status response
                </summary>
                <pre className="text-muted mt-3 overflow-x-auto text-[11px] leading-relaxed">
                  {statusRaw}
                </pre>
              </details>
            )}
          </aside>
        </div>

        <footer className="footer-line text-muted mt-12 border-t pt-6 text-center text-xs">
          Selecting files does not call any API. All uploads and generation start only when you click
          Generate Video.
        </footer>
      </main>
    </div>
  );
}
