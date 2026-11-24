/**
 * ops/nginx/audit.icjia.app.conf.example is a REFERENCE copy of the reverse
 * proxy, reconstructed from what the code assumes. Nothing reads it and it
 * cannot prove anything about the server — but it must not disagree with the
 * code it documents. These tests fail when a port, an upload cap, a timeout
 * or the client-address header in the template drifts from the application.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEPLOY } from "#config";

const root = resolve(__dirname, "../../../..");
const template = readFileSync(resolve(root, "ops/nginx/audit.icjia.app.conf.example"), "utf8");
/** The directives only — comment lines removed. */
const directives = template
  .split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

const block = (opener: string): string => {
  const start = directives.indexOf(opener);
  if (start === -1) throw new Error(`no "${opener}" block in the nginx template`);
  return directives.slice(start, directives.indexOf("\n    }", start));
};
const api = block("location /api/ {");
const web = block("location / {");

const ecosystem = createRequire(import.meta.url)(resolve(root, "ecosystem.config.cjs")) as {
  apps: { name: string; env: { PORT: number; HOST?: string } }[];
};
const portOf = (name: string): number => ecosystem.apps.find((a) => a.name === name)!.env.PORT;

describe("the nginx reference template agrees with the code", () => {
  it("says, at the top, that it is not the live configuration", () => {
    expect(template.split("\n").slice(0, 25).join("\n")).toMatch(/NOT THE LIVE CONFIG/);
    expect(template).toMatch(/diff it against the live file/);
  });

  it("sends /api/ to the API's port and everything else to the web app's", () => {
    expect(api).toContain(`proxy_pass http://127.0.0.1:${portOf("file-audit-api")};`);
    expect(web).toContain(`proxy_pass http://127.0.0.1:${portOf("file-audit-web")};`);
    expect(portOf("file-audit-api")).toBe(DEPLOY.API_PORT);
  });

  it("allows uploads as large as the documented proxy contract", () => {
    const m = /client_max_body_size (\d+)m;/.exec(api);
    expect(m, "no client_max_body_size in the /api/ block").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(DEPLOY.NGINX_CLIENT_MAX_BODY_SIZE_MB);
  });

  it("waits for the API at least as long as the documented proxy contract", () => {
    const m = /proxy_read_timeout (\d+)s;/.exec(api);
    expect(m, "no proxy_read_timeout in the /api/ block").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(DEPLOY.NGINX_PROXY_READ_TIMEOUT_S);
  });

  it("forwards the caller's address the way `trust proxy 1` reads it", () => {
    // Express with trust proxy = 1 takes the LAST X-Forwarded-For entry: the
    // one this proxy appends. Overwriting the header with a client-supplied
    // value, or omitting it, would put every visitor in one rate-limit bucket.
    const appSource = readFileSync(resolve(root, "apps/api/src/app.ts"), "utf8");
    expect(appSource).toContain('app.set("trust proxy", 1)');
    for (const b of [api, web]) {
      expect(b).toContain("proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;");
    }
  });

  it("sends HSTS once: added at server level, the API's own copy hidden", () => {
    expect(directives.match(/add_header Strict-Transport-Security /g)).toHaveLength(1);
    expect(directives).toMatch(/add_header Strict-Transport-Security "max-age=\d+[^"]*" always;/);
    expect(api).toContain("proxy_hide_header Strict-Transport-Security;");
  });

  it("does not carry the Forge default blocks that 404 robots.txt and favicon.ico", () => {
    expect(directives).not.toMatch(/location = \/(robots\.txt|favicon\.ico)/);
  });
});
