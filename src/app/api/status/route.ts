import { NextRequest, NextResponse } from "next/server";
import {
  authHeaders,
  getKieConfig,
  isKieSuccess,
  kieErrorMessage,
} from "@/lib/kie";

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

    if (!isKieSuccess(data, response.ok)) {
      const status =
        response.ok && data && typeof data === "object" && "code" in data
          ? Number((data as { code?: unknown }).code) || 502
          : response.status || 502;

      return NextResponse.json(
        {
          success: false,
          msg: kieErrorMessage(data, "Failed to fetch task status"),
          data,
        },
        { status: status >= 400 && status < 600 ? status : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      code: 200,
      msg:
        (data &&
          typeof data === "object" &&
          typeof (data as { msg?: unknown }).msg === "string" &&
          (data as { msg: string }).msg) ||
        "ok",
      data:
        data && typeof data === "object" && "data" in data
          ? (data as { data: unknown }).data
          : data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Status check error";
    return NextResponse.json({ success: false, msg: message }, { status: 500 });
  }
}
