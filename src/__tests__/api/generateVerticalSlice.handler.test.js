/**
 * Phase 1 amendment #3: tri-state CONTEXT_PROVIDERS_ENABLED gating.
 *   'true'  -> enabled
 *   'false' -> disabled
 *   unset   -> enabled only on Vercel / NODE_ENV=production
 * Phase 1 amendment #4: server-only — this handler runs in Node (no window).
 */

import { shouldEnableContextProviders } from "../../../api/project/generate-vertical-slice.js";

describe("shouldEnableContextProviders (tri-state policy)", () => {
  test("'true' enables regardless of environment", () => {
    expect(
      shouldEnableContextProviders({ CONTEXT_PROVIDERS_ENABLED: "true" }),
    ).toBe(true);
    expect(
      shouldEnableContextProviders({ CONTEXT_PROVIDERS_ENABLED: "TRUE" }),
    ).toBe(true);
    expect(
      shouldEnableContextProviders({
        CONTEXT_PROVIDERS_ENABLED: "true",
        NODE_ENV: "development",
      }),
    ).toBe(true);
  });

  test("'false' disables regardless of environment", () => {
    expect(
      shouldEnableContextProviders({ CONTEXT_PROVIDERS_ENABLED: "false" }),
    ).toBe(false);
    expect(
      shouldEnableContextProviders({
        CONTEXT_PROVIDERS_ENABLED: "false",
        VERCEL: "1",
        NODE_ENV: "production",
      }),
    ).toBe(false);
  });

  test("unset enables on Vercel runtime", () => {
    expect(shouldEnableContextProviders({ VERCEL: "1" })).toBe(true);
  });

  test("unset enables when NODE_ENV=production", () => {
    expect(shouldEnableContextProviders({ NODE_ENV: "production" })).toBe(true);
  });

  test("unset disables in local development", () => {
    expect(shouldEnableContextProviders({ NODE_ENV: "development" })).toBe(
      false,
    );
    expect(shouldEnableContextProviders({})).toBe(false);
  });

  test("unrecognised values fall through to environment-based default", () => {
    // 'maybe' is not a recognised tri-state value; falls through to env.
    expect(
      shouldEnableContextProviders({ CONTEXT_PROVIDERS_ENABLED: "maybe" }),
    ).toBe(false);
    expect(
      shouldEnableContextProviders({
        CONTEXT_PROVIDERS_ENABLED: "maybe",
        VERCEL: "1",
      }),
    ).toBe(true);
  });
});
