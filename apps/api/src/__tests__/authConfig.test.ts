/**
 * Startup fail-closed check for the session secret.
 *
 * When login is enabled, the API must refuse to start if JWT_SECRET is
 * unset or still the in-repo dev default — otherwise session cookies are
 * forgeable from the public source. Mirrors validateMailConfig()'s
 * hard-exit posture; previously JWT_SECRET was the one secret never
 * validated at boot.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkAuthConfig } from "../services/authConfig.js";

const DEV_DEFAULT = "dev-secret-do-not-use-in-production";

describe("checkAuthConfig", () => {
  const orig = process.env.JWT_SECRET;
  beforeEach(() => {
    delete process.env.JWT_SECRET;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = orig;
  });

  it("returns an error when login is required but JWT_SECRET is unset", () => {
    delete process.env.JWT_SECRET;
    expect(checkAuthConfig(true)).toMatch(/JWT_SECRET/);
  });

  it("returns an error when login is required but JWT_SECRET is the dev default", () => {
    process.env.JWT_SECRET = DEV_DEFAULT;
    expect(checkAuthConfig(true)).toMatch(/JWT_SECRET/);
  });

  it("passes (null) when login is required and a real secret is set", () => {
    process.env.JWT_SECRET = "a-real-long-random-production-secret-value";
    expect(checkAuthConfig(true)).toBeNull();
  });

  it("passes (null) when login is disabled regardless of secret", () => {
    delete process.env.JWT_SECRET;
    expect(checkAuthConfig(false)).toBeNull();
  });
});
