import { NextRequest, NextResponse } from "next/server";
import {
  authHeaders,
  extractTaskId,
  getKieConfig,
  isKieSuccess,
  kieErrorMessage,
} from "@/lib/kie";

export const runtime = "nodejs";

type GenerateBody = {
  imageUrl?: string;
  audioUrl?: string;
  prompt?: string;
};

export async function POST(request: NextRequest) {
  try {
    const { token, createTaskUrl, model } = getKieConfig();
    const body = (await request.json()) as GenerateBody;

    const imageUrl = body.imageUrl?.trim();
    const audioUrl = body.audioUrl?.trim();
    const prompt = body.prompt?.trim();

    if (!imageUrl || !audioUrl || !prompt) {
      return NextResponse.json(
        {
          success: false,
          msg: "imageUrl, audioUrl and prompt are required",
        },
        { status: 400 }
      );
    }

    const payload = {
      model,
      input: {
        image_url: imageUrl,
        audio_url: audioUrl,
        prompt,
        resolution: "480p",
      },
    };

    const response = await fetch(createTaskUrl, {
      method: "POST",
      headers: {
        ...authHeaders(token, "application/json"),
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
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
          msg: kieErrorMessage(data, "Failed to create video task"),
          data,
        },
        { status: status >= 400 && status < 600 ? status : 502 }
      );
    }

    const taskId = extractTaskId(data);

    if (!taskId) {
      return NextResponse.json(
        {
          success: false,
          msg: kieErrorMessage(
            data,
            "Kie API did not return a task ID. Check your API token and credits."
          ),
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
        "Video generation started",
      data: {
        ...(typeof responseData === "object" && responseData ? responseData : {}),
        taskId,
        model,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generate task error";
    return NextResponse.json({ success: false, msg: message }, { status: 500 });
  }
}
