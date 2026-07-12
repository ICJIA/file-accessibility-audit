import { describe, it, expect } from "vitest";
import { buildChildSpawnEnv } from "../services/childSpawnEnv.js";

// ---------------------------------------------------------------------------
// RB2-d [INFO->fix]: neither the OOXML worker (services/ooxmlRunner.ts) nor
// the remediation worker (routes/remediate.ts) should receive the API's own
// secrets in their spawn env — both parse ATTACKER-CONTROLLED bytes (a
// crafted docx/pptx/xlsx, a crafted PDF), so a parser bug that leaks or
// exfiltrates the child's own environment must not have anything sensitive
// to find.
//
// This is a pure unit test of the shared denylist helper. The two real call
// sites are covered separately:
//   - services/ooxmlRunner.ts  -> ooxmlWorker.test.ts ("RB2-d: spawn env")
//   - routes/remediate.ts       -> remediate-spawn-env.test.ts
// ---------------------------------------------------------------------------

const SAMPLE_SOURCE_ENV = {
  // --- this app's known secrets (see audit.config.ts + a grep of
  // process.env.* across apps/api/src) — must be stripped ---
  JWT_SECRET: "jwt-secret-value",
  API_PRIVILEGED_TOKEN: "privileged-token-value",
  SMTP_HOST: "smtp.mailgun.org",
  SMTP_PORT: "587",
  SMTP_USER: "smtp-user-value",
  SMTP_PASS: "smtp-pass-value",
  SMTP_FROM: "admin@icjia.cloud",
  SMTP2GO_API_KEY: "smtp2go-key-value",
  MAILGUN_API_KEY: "mailgun-key-value",
  ADMIN_EMAILS: "admin@illinois.gov",
  // --- generic suffix families: must be stripped even though this app
  // doesn't define these specific names today (defense in depth for
  // future / hosting-injected secrets) ---
  SOME_OTHER_SECRET: "x",
  RANDOM_SERVICE_TOKEN: "x",
  DATABASE_PASSWORD: "x",
  AWS_SECRET_ACCESS_KEY: "x",
  // --- essentials the child needs to actually boot — must survive ---
  PATH: "/usr/bin:/bin",
  HOME: "/home/deploy",
  NODE_ENV: "production",
  NODE_OPTIONS: "--max-old-space-size=512",
  TSX_TSCONFIG_PATH: "/app/tsconfig.json",
  JAVA_HOME: "/opt/homebrew/opt/openjdk@17",
  LANG: "en_US.UTF-8",
  LC_ALL: "en_US.UTF-8",
  TMPDIR: "/tmp",
  TERM: "xterm-256color",
  // --- operational, non-secret config — must survive (not a credential) ---
  DB_PATH: "./data/audit.db",
  ANALYZE_URL_ALLOWED_HOSTS: "icjia.illinois.gov",
};

describe("buildChildSpawnEnv", () => {
  it("strips every one of this app's known secret families", () => {
    const env = buildChildSpawnEnv(SAMPLE_SOURCE_ENV);
    for (const key of [
      "JWT_SECRET",
      "API_PRIVILEGED_TOKEN",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASS",
      "SMTP_FROM",
      "SMTP2GO_API_KEY",
      "MAILGUN_API_KEY",
      "ADMIN_EMAILS",
    ]) {
      expect(env[key]).toBeUndefined();
    }
  });

  it("strips generic *_SECRET/*_TOKEN/*_PASSWORD/*_KEY vars beyond this app's known names", () => {
    const env = buildChildSpawnEnv(SAMPLE_SOURCE_ENV);
    expect(env.SOME_OTHER_SECRET).toBeUndefined();
    expect(env.RANDOM_SERVICE_TOKEN).toBeUndefined();
    expect(env.DATABASE_PASSWORD).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("preserves everything the child needs to boot", () => {
    const env = buildChildSpawnEnv(SAMPLE_SOURCE_ENV);
    expect(env.PATH).toBe("/usr/bin:/bin");
    expect(env.HOME).toBe("/home/deploy");
    expect(env.NODE_ENV).toBe("production");
    expect(env.NODE_OPTIONS).toBe("--max-old-space-size=512");
    expect(env.TSX_TSCONFIG_PATH).toBe("/app/tsconfig.json");
    expect(env.JAVA_HOME).toBe("/opt/homebrew/opt/openjdk@17");
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(env.LC_ALL).toBe("en_US.UTF-8");
    expect(env.TMPDIR).toBe("/tmp");
    expect(env.TERM).toBe("xterm-256color");
  });

  it("preserves operational config that is not a credential (DB_PATH, an allowlist)", () => {
    const env = buildChildSpawnEnv(SAMPLE_SOURCE_ENV);
    expect(env.DB_PATH).toBe("./data/audit.db");
    expect(env.ANALYZE_URL_ALLOWED_HOSTS).toBe("icjia.illinois.gov");
  });

  it("does not mutate the source object", () => {
    const frozen = Object.freeze({ ...SAMPLE_SOURCE_ENV });
    expect(() => buildChildSpawnEnv(frozen as NodeJS.ProcessEnv)).not.toThrow();
    expect(frozen).toEqual(SAMPLE_SOURCE_ENV);
  });

  it("defaults to the real process.env when called with no argument", () => {
    const prev = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "probe-value";
    try {
      const env = buildChildSpawnEnv();
      expect(env.JWT_SECRET).toBeUndefined();
      // A real, always-present var should still come through untouched.
      expect(env.PATH).toBe(process.env.PATH);
    } finally {
      if (prev === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prev;
    }
  });
});
