import { NextResponse } from "next/server";
import type { ApiErr, ApiOk, ErrorCode } from "@/types/contract";

export function apiOk<T>(data: T, status = 200) {
  const body: ApiOk<T> = { ok: true, data };
  return NextResponse.json(body, { status });
}

export function apiErr(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
  status = 400
) {
  const body: ApiErr = {
    ok: false,
    code,
    message,
    ...(fields ? { fields } : {}),
  };
  return NextResponse.json(body, { status });
}

