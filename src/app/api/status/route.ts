import { NextRequest, NextResponse } from "next/server";
import { authHeaders, getKieConfig } from "@/lib/kie";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const taskId = request.nextUrl.searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json(
        { success: false, msg: "taskId is required" },
        { status: 400 }
      );
    }

    const { token, taskStatusUrl } = getKieConfig();
    const url = `${taskStatusUrl}?taskId=${encodeURIComponent(taskId)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...authHeaders(token),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          msg: data?.msg || data?.message || "Failed to fetch task status",
          data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      code: data?.code ?? 200,
      msg: data?.msg || "ok",
      data: data?.data ?? data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Status check error";
    return NextResponse.json({ success: false, msg: message }, { status: 500 });
  }
}
