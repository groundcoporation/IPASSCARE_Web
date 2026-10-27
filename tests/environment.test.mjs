import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolveEnvironment, PRODUCTION_PROJECT_REF } from "../config/environment.cjs";

const testRef = "abcdefghijklmnopqrst";
const key = (ref, role = "anon") => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ ref, role })).toString("base64url")}.test-signature`;
const input = (environment = "preview", ref = testRef) => ({
  environment, projectRef: ref, supabaseUrl: `https://${ref}.supabase.co`, supabaseAnonKey: key(ref),
});
test("accepts explicit preview and production project bindings", () => {
  assert.equal(resolveEnvironment(input(), "preview").environment, "preview");
  assert.equal(resolveEnvironment(input("production", PRODUCTION_PROJECT_REF), "production").projectRef, PRODUCTION_PROJECT_REF);
});
test("rejects incomplete settings, mismatched modes and production from non-production", () => {
  for (const value of [{}, { ...input(), environment: undefined }, { ...input(), supabaseAnonKey: "" },
    input("preview", PRODUCTION_PROJECT_REF), input("development", PRODUCTION_PROJECT_REF), input("production")]) {
    assert.throws(() => resolveEnvironment(value), /CONFIG_INVALID/);
  }
  assert.throws(() => resolveEnvironment(input(), "production"), /CONFIG_INVALID/);
});
test("rejects wrong hosts, mismatched JWTs and secret keys without leaking values", () => {
  for (const patch of [
    { supabaseUrl: `https://${testRef}.supabase.co.evil.example` },
    { supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` },
    { supabaseAnonKey: key(PRODUCTION_PROJECT_REF) },
    { supabaseAnonKey: key(testRef, "service_role") },
    { supabaseAnonKey: "sb_secret_sensitive-test-value" },
  ]) {
    const value = { ...input(), ...patch };
    assert.throws(() => resolveEnvironment(value), error =>
      error.message.includes("CONFIG_INVALID") && !error.message.includes(value.supabaseAnonKey)
        && !error.message.includes(value.supabaseUrl));
  }
});
test("supports public publishable keys", () => {
  assert.equal(resolveEnvironment({ ...input(), supabaseAnonKey: "sb_publishable_example_public_test_key" }).environment, "preview");
});

test("local Docker is explicit, fixed to loopback, and development-only", () => {
  const local = {environment:'development',projectRef:'local',supabaseUrl:'http://127.0.0.1:45431',supabaseAnonKey:key('local')};
  assert.equal(resolveEnvironment(local,'development').databaseTarget,'local');
  for (const patch of [{environment:'preview'},{environment:'production'},
    {supabaseUrl:'http://192.168.0.2:45431'},{supabaseUrl:'http://127.0.0.1:54321'},
    {supabaseUrl:`https://${PRODUCTION_PROJECT_REF}.supabase.co`},
    {supabaseAnonKey:key(PRODUCTION_PROJECT_REF)},{supabaseAnonKey:key('local','service_role')}])
    assert.throws(() => resolveEnvironment({...local,...patch}), /CONFIG_INVALID/);
  assert.throws(() => resolveEnvironment(local,'production'), /CONFIG_INVALID/);
});

const appContract = new URL("../../../IPASSCARE/app/config/environment.cjs", import.meta.url);
test("app and web use the same environment validation", { skip: !existsSync(appContract) }, () => {
  const normalize = value => value.replace(/\r\n/g, "\n");
  assert.equal(normalize(readFileSync(appContract, "utf8")), normalize(readFileSync(new URL("../config/environment.cjs", import.meta.url), "utf8")));
});
