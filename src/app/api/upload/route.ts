import { NextRequest, NextResponse } from "next/server";
import {
  authHeaders,
  extractDownloadUrl,
  getKieConfig,
  isKieSuccess,
  kieErrorMessage,
} from "@/lib/kie";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { token, uploadUrl, uploadPath } = getKieConfig();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, msg: "File is required" },
        { status: 400 }
      );
    }

    const fileName = file.name || `upload-${Date.now()}`;
    const upstream = new FormData();
    upstream.append("file", file, fileName);
    upstream.append("fileStream", file, fileName);
    upstream.append("uploadPath", uploadPath);
    upstream.append("fileName", fileName);

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: authHeaders(token),
      body: upstream,
    });

    const data = await response.json().catch(() => null);

    if (!isKieSuccess(data, response.ok)) {
      const status =
        response.ok && data && typeof data === "object" && "code" in data
          ? Number((data as { code?: unknown }).code) || 502
          : response.status || 502;

      return NextResponse.json(
        {
          success: false,
          msg: kieErrorMessage(data, "File upload failed"),
          data,
        },
        { status: status >= 400 && status < 600 ? status : 502 }
      );
    }

    const downloadUrl = extractDownloadUrl(data);

    if (!downloadUrl) {
      return NextResponse.json(
        {
          success: false,
          msg: "Upload succeeded but downloadUrl was not returned",
          data,
        },
        { status: 502 }
      );
    }

    const responseData =
      data && typeof data === "object" && "data" in data
        ? ((data as { data?: Record<string, unknown> }).data ?? {})
        : {};

    return NextResponse.json({
      success: true,
      code: 200,
      msg:
        (data &&
          typeof data === "object" &&
          typeof (data as { msg?: unknown }).msg === "string" &&
          (data as { msg: string }).msg) ||
        "File uploaded successfully",
      data: {
        fileName:
          (typeof responseData === "object" &&
            responseData &&
            typeof responseData.fileName === "string" &&
            responseData.fileName) ||
          fileName,
        filePath:
          typeof responseData === "object" && responseData
            ? responseData.filePath
            : undefined,
        downloadUrl,
        fileSize:
          typeof responseData === "object" && responseData
            ? responseData.fileSize
            : undefined,
        mimeType:
          (typeof responseData === "object" &&
            responseData &&
            typeof responseData.mimeType === "string" &&
            responseData.mimeType) ||
          file.type,
        uploadedAt:
          typeof responseData === "object" && responseData
            ? responseData.uploadedAt
            : undefined,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload error";
    return NextResponse.json({ success: false, msg: message }, { status: 500 });
  }
}
