import { NextRequest, NextResponse } from "next/server";
import { authHeaders, getKieConfig } from "@/lib/kie";

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

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          msg: data?.msg || data?.message || "File upload failed",
          data,
        },
        { status: response.status }
      );
    }

    const downloadUrl =
      data?.data?.downloadUrl ||
      data?.downloadUrl ||
      data?.data?.data?.downloadUrl;

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

    return NextResponse.json({
      success: true,
      code: data?.code ?? 200,
      msg: data?.msg || "File uploaded successfully",
      data: {
        fileName: data?.data?.fileName || fileName,
        filePath: data?.data?.filePath,
        downloadUrl,
        fileSize: data?.data?.fileSize,
        mimeType: data?.data?.mimeType || file.type,
        uploadedAt: data?.data?.uploadedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload error";
    return NextResponse.json({ success: false, msg: message }, { status: 500 });
  }
}
