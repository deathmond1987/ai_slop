import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(new URL("./ts-extension-resolver.mjs", import.meta.url).href, import.meta.url);

const {
  getCurrentRequestId,
  jsonError,
  jsonSuccess,
  requestIdFromHeaders,
  runWithRequestId,
} = await import("../lib/request-context.ts");

test("requestIdFromHeaders prefers x-request-id", () => {
  const requestId = requestIdFromHeaders(
    new Headers({ "x-request-id": "trace-1", "request-id": "ignored" }),
  );

  assert.equal(requestId, "trace-1");
});

test("requestIdFromHeaders uses the alternate request-id header", () => {
  const requestId = requestIdFromHeaders(new Headers({ "request-id": "trace-2" }));

  assert.equal(requestId, "trace-2");
});

test("requestIdFromHeaders generates a request id when missing or invalid", () => {
  const missing = requestIdFromHeaders(new Headers());
  const invalid = requestIdFromHeaders(new Headers({ "x-request-id": "not accepted!" }));

  assert.match(missing, /^[a-z0-9-]{20,}$/i);
  assert.notEqual(missing, "");
  assert.match(invalid, /^[a-z0-9-]{20,}$/i);
});

test("runWithRequestId exposes the active request id to getCurrentRequestId", () => {
  assert.equal(getCurrentRequestId(), undefined);

  runWithRequestId("trace-3", () => {
    assert.equal(getCurrentRequestId(), "trace-3");
  });

  assert.equal(getCurrentRequestId(), undefined);
});

test("jsonError returns requestId in the body and header", async () => {
  const response = runWithRequestId("trace-4", () =>
    jsonError("bad json", 400, "invalid_json"),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("x-request-id"), "trace-4");
  assert.equal(body.requestId, "trace-4");
  assert.equal(body.error.requestId, "trace-4");
  assert.equal(body.error.code, "invalid_json");
  assert.equal(body.error.message, "bad json");
});

test("jsonSuccess returns requestId in the body and header", async () => {
  const response = runWithRequestId("trace-5", () => jsonSuccess({ ok: true }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "trace-5");
  assert.equal(body.requestId, "trace-5");
  assert.equal(body.ok, true);
});
