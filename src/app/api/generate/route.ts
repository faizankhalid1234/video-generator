import { NextRequest, NextResponse } from "next/server";
import { authHeaders, getKieConfig } from "@/lib/kie";

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

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          msg: data?.msg || data?.message || "Failed to create video task",
          data,
        },
        { status: response.status }
      );
    }

    const taskId = data?.data?.taskId || data?.taskId;

    return NextResponse.json({
      success: true,
      code: data?.code ?? 200,
      msg: data?.msg || "Video generation started",
      data: {
        taskId,
        model,
        ...data?.data,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generate task error";
    return NextResponse.json({ success: false, msg: message }, { status: 500 });
  }
}
