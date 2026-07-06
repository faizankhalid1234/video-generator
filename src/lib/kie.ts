export function getKieConfig() {
  const token = process.env.KIE_API_TOKEN?.trim();
  const uploadUrl = process.env.KIE_UPLOAD_URL?.trim();
  const createTaskUrl = process.env.KIE_CREATE_TASK_URL?.trim();
  const taskStatusUrl = process.env.KIE_TASK_STATUS_URL?.trim();
  const model = process.env.KIE_MODEL?.trim() || "infinitalk/from-audio";
  const uploadPath = process.env.KIE_UPLOAD_PATH?.trim() || "kieai/uploads";

  if (!token) {
    throw new Error("KIE_API_TOKEN is missing in .env");
  }
  if (!uploadUrl) {
    throw new Error("KIE_UPLOAD_URL is missing in .env");
  }
  if (!createTaskUrl) {
    throw new Error("KIE_CREATE_TASK_URL is missing in .env");
  }

  return {
    token,
    uploadUrl,
    createTaskUrl,
    taskStatusUrl: taskStatusUrl || "https://api.kie.ai/api/v1/jobs/recordInfo",
    model,
    uploadPath,
  };
}

export function authHeaders(token: string, contentType?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

/** Kie often returns HTTP 200 with a business `code` field. */
export function isKieSuccess(data: unknown, httpOk: boolean) {
  if (!httpOk) return false;
  if (!data || typeof data !== "object") return true;

  const code = (data as { code?: unknown }).code;
  if (code === undefined || code === null || code === "") return true;

  return Number(code) === 200;
}

export function kieErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;

  const payload = data as {
    msg?: unknown;
    message?: unknown;
    error?: unknown;
    data?: { msg?: unknown; message?: unknown; failMsg?: unknown };
  };

  const candidates = [
    payload.msg,
    payload.message,
    payload.error,
    payload.data?.failMsg,
    payload.data?.msg,
    payload.data?.message,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return fallback;
}

export function extractTaskId(payload: unknown): string | null {
  if (!payload) return null;

  if (typeof payload === "string") {
    const value = payload.trim();
    return value || null;
  }

  if (typeof payload === "number" && Number.isFinite(payload)) {
    return String(payload);
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const found = extractTaskId(entry);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload !== "object") return null;

  const data = payload as Record<string, unknown>;
  const keys = [
    "taskId",
    "task_id",
    "taskID",
    "recordId",
    "record_id",
    "jobId",
    "job_id",
    "id",
  ];

  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  if ("data" in data) {
    return extractTaskId(data.data);
  }

  return null;
}

export function extractDownloadUrl(payload: unknown): string | null {
  if (!payload) return null;

  if (typeof payload === "string") {
    const value = payload.trim();
    return value.startsWith("http") ? value : null;
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const found = extractDownloadUrl(entry);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload !== "object") return null;

  const data = payload as Record<string, unknown>;
  const keys = [
    "downloadUrl",
    "download_url",
    "fileUrl",
    "file_url",
    "url",
    "filePath",
    "file_path",
  ];

  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.startsWith("http")) return value;
  }

  for (const value of Object.values(data)) {
    const found = extractDownloadUrl(value);
    if (found) return found;
  }

  return null;
}
