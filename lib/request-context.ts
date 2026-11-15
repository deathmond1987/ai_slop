import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const REQUEST_ID_HEADER = "x-request-id";
const ALTERNATE_REQUEST_ID_HEADER = "request-id";
const MAX_REQUEST_ID_LENGTH = 256;

const storage = new AsyncLocalStorage<string>();

function normalizeRequestId(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_REQUEST_ID_LENGTH) return undefined;
  if (!/^[A-Za-z0-9._~-]{1,256}$/.test(trimmed)) return undefined;

  return trimmed;
}

export function createRequestId(): string {
  return randomUUID();
}

export function requestIdFromHeaders(headers: Headers): string {
  return (
    normalizeRequestId(headers.get(REQUEST_ID_HEADER)) ??
    normalizeRequestId(headers.get(ALTERNATE_REQUEST_ID_HEADER)) ??
    createRequestId()
  );
}

export function requestIdFromRequest(request: { headers: Headers }): string {
  return requestIdFromHeaders(request.headers);
}

export function getCurrentRequestId(): string | undefined {
  return storage.getStore();
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run(requestId, fn);
}

export function runWithRequest<T>(request: { headers: Headers }, fn: () => T): T {
  return runWithRequestId(requestIdFromRequest(request), fn);
}

export function withRequestIdHeader(
  headers?: HeadersInit | null,
  requestId?: string | null
): Headers {
  const out = new Headers(headers ?? undefined);
  const id = requestId ?? getCurrentRequestId();
  if (id) out.set(REQUEST_ID_HEADER, id);
  return out;
}

function responseRequestId(): string {
  return getCurrentRequestId() ?? createRequestId();
}

export function jsonSuccess(body: Record<string, unknown>, init?: ResponseInit): NextResponse {
  const requestId = responseRequestId();

  return NextResponse.json(
    { requestId, ...body },
    {
      ...init,
      status: init?.status ?? 200,
      headers: withRequestIdHeader(init?.headers, requestId),
    }
  );
}

export function jsonError(
  message: string,
  status = 500,
  code?: string,
  init?: ResponseInit
): NextResponse {
  const requestId = responseRequestId();

  return NextResponse.json(
    {
      ok: false,
      requestId,
      error: {
        requestId,
        code,
        message,
      },
    },
    {
      ...init,
      status,
      headers: withRequestIdHeader(init?.headers, requestId),
    }
  );
}
