/**
 * ops/nginx/audit.icjia.app.conf.example is a REFERENCE copy of the reverse
 * proxy, taken from `sudo nginx -T` on the server (2026-11-24). Nothing reads
 * it and it cannot prove the server still matches — but it must not disagree
 * with the code it documents. These tests fail when a port, an upload cap, a timeout
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
  it("says, at the top, that it is a copy and that nothing reads it", () => {
    const head = template.split("\n").slice(0, 12).join("\n");
    expect(head).toMatch(/REFERENCE COPY of the live config/);
    expect(head).toMatch(/Nothing reads this file/);
    expect(head).toMatch(/taken from `sudo nginx -T`/);
  });

  it("sends /api/ to the API's port and everything else to the web app's", () => {
    expect(api).toContain(`proxy_pass http://127.0.0.1:${portOf("file-audit-api")};`);
    expect(web).toContain(`proxy_pass http://127.0.0.1:${portOf("file-audit-web")};`);
    expect(portOf("file-audit-api")).toBe(DEPLOY.API_PORT);
  });

  it("allows uploads as large as the documented proxy contract", () => {
    const m = /client_max_body_size (\d+)m;/i.exec(api);
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
      expect(b).toMatch(/proxy_set_header X-Forwarded-For\s+\$proxy_add_x_forwarded_for;/);
    }
  });

  it("adds HSTS at server level, on every response including nginx's own errors", () => {
    expect(directives.match(/add_header Strict-Transport-Security /g)).toHaveLength(1);
    expect(directives).toMatch(/add_header Strict-Transport-Security "max-age=\d+[^"]*" always;/);
  });

  it("records the live logging: no access log for this site, an error log kept", () => {
    // The data-retention policy describes what the web server keeps. If the
    // live setting changes, this copy and the policy change together.
    expect(directives).toMatch(/^\s*access_log off;$/m);
    expect(directives).toMatch(/^\s*error_log\s+\S+ error;$/m);
  });

  it("passes uploads straight through and sends each security header once", () => {
    // Without this line nginx writes every upload over 16 KB to a temporary
    // file of its own — which the data-retention policy says never happens.
    expect(api).toContain("proxy_request_buffering off;");
    expect(api).toContain("proxy_hide_header Strict-Transport-Security;");
    for (const b of [api, web]) expect(b).toContain("proxy_hide_header X-Content-Type-Options;");
  });

  it("does not carry the Forge default blocks that 404 robots.txt and favicon.ico", () => {
    expect(directives).not.toMatch(/location = \/(robots\.txt|favicon\.ico)/);
  });
});
