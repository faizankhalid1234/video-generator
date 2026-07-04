export function getKieConfig() {
  const token = process.env.KIE_API_TOKEN;
  const uploadUrl = process.env.KIE_UPLOAD_URL;
  const createTaskUrl = process.env.KIE_CREATE_TASK_URL;
  const taskStatusUrl = process.env.KIE_TASK_STATUS_URL;
  const model = process.env.KIE_MODEL || "infinitalk/from-audio";
  const uploadPath = process.env.KIE_UPLOAD_PATH || "kieai/uploads";

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
