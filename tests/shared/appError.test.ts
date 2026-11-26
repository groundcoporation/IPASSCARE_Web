import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { AppError, errorMessages, formatError, normalizeError, normalizeAsyncError, logError } from "../../src/errors/appError.ts";

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
const appSource = new URL("../../../../IPASSCARE/app/src/errors/appError.ts", import.meta.url);
test("app and web share the same contract", { skip: !existsSync(appSource) && process.env.IPASSCARE_REQUIRE_APP_CONTRACT !== '1' }, () => {
  assert.ok(existsSync(appSource), 'Full verification requires the sibling IPASSCARE/app checkout for contract comparison');
  const app = readFileSync(appSource, "utf8").replace(/\r\n/g, "\n");
  const web = readFileSync(new URL("../../src/errors/appError.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const entries = (source: string) => new Map([...source.matchAll(/^  ([A-Z_]+): ("[^\n]*"),$/gm)].map(match => [match[1], match[2]]));
  const appEntries = entries(app);
  const webEntries = entries(web);
  const differingCodes = [...new Set([...appEntries.keys(), ...webEntries.keys()])]
    .filter(code => appEntries.get(code) !== webEntries.get(code));
  assert.deepEqual(differingCodes, [], 'Catalog codes missing or changed; compare both error catalogs');
  assert.ok(app === web, 'Catalog order or shared helper implementation differs; compare both appError.ts files');
});

test('every catalog code uses local text for direct markers and Edge responses', async () => {
  for (const [code, text] of Object.entries(errorMessages)) {
    const raw = { code, message: 'secret raw response' };
    assert.equal(normalizeError(raw).code, code);
    assert.equal(normalizeError({ message: '[' + code + '] secret raw response' }).userMessage, text);
    const edge = await normalizeAsyncError({ context: new Response(JSON.stringify(raw), { status: 500 }) }, 'UNKNOWN_ERROR');
    assert.equal(edge.code, code);
    assert.ok(!formatError(edge).includes('secret raw response'));
  }
});

test('unknown and prototype-like server codes cannot become local catalog messages', () => {
  for (const code of ['UNKNOWN_SERVER_CODE', 'constructor', '__proto__', 'toString']) {
    assert.equal(normalizeError({ code, message: 'secret raw response' }, 'BILL_SEND_FAILED').code, 'BILL_SEND_FAILED');
  }
});
