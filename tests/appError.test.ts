import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { AppError, formatError, normalizeError, normalizeAsyncError, logError } from "../src/errors/appError.ts";

test("never expose raw SQL, personal data, or unknown error messages", () => {
  const result = normalizeError({ message: "secret token user@example.com SQL private_table" }, "BILL_CREATE_FAILED");
  assert.equal(result.code, "BILL_CREATE_FAILED");
  assert.ok(!formatError(result).includes("private_table"));
  assert.ok(!formatError(result).includes("user@example.com"));
});
test("known server marker uses local catalog, not server message", () => {
  const result = normalizeError({ message: "[ATT_TOO_SOON] secret details" });
  assert.equal(result.code, "ATT_TOO_SOON");
  assert.ok(!formatError(result).includes("secret"));
});
test("auth, schema and duplicate errors map consistently", () => {
  assert.equal(normalizeError({ status: 401 }).code, "AUTH_REQUIRED");
  assert.equal(normalizeError({ code: "42501" }).code, "PERMISSION_DENIED");
  assert.equal(normalizeError({ code: "PGRST202" }).code, "SERVER_UPDATE_REQUIRED");
  assert.equal(normalizeError({ code: "23505" }).code, "CONFLICT_ERROR");
});
test("committed-stage errors remain distinct from generic network failures", () => {
  const partial = new AppError("PAYMENT_CONFIRM_PENDING", new Error("Failed to fetch"));
  assert.equal(normalizeError(partial), partial);
  assert.equal(normalizeError(new Error("Failed to fetch"), "BILL_SEND_FAILED").code, "BILL_SEND_FAILED");
});
test("Edge response JSON and non-JSON normalize without leaking body", async () => {
  assert.equal((await normalizeAsyncError({ context: new Response(JSON.stringify({ code: "PGRST202" }), { status: 500 }) }, "BILL_SEND_FAILED")).code, "SERVER_UPDATE_REQUIRED");
  assert.equal((await normalizeAsyncError({ context: new Response("private proxy error", { status: 403 }) }, "BILL_SEND_FAILED")).code, "PERMISSION_DENIED");
});
test("logger excludes cause and invalid transaction identifiers", () => {
  const saved = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    logError(new AppError("BILL_SEND_FAILED", { token: "TOP_SECRET" }), { operation: "billing.send", transactionId: "person@example.com" });
  } finally { console.error = saved; }
  assert.ok(!JSON.stringify(logs).includes("TOP_SECRET"));
  assert.ok(!JSON.stringify(logs).includes("person@example.com"));
});
const appSource = new URL("../../../IPASSCARE/app/src/errors/appError.ts", import.meta.url);
test("app and web share the same contract", { skip: !existsSync(appSource) }, () => {
  assert.equal(readFileSync(appSource, "utf8").replace(/\r\n/g, "\n"), readFileSync(new URL("../src/errors/appError.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n"));
});
