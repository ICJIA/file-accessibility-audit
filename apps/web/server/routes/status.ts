import { resolveStatus, type ApiStatusPayload } from "../utils/status";
import { renderStatusHtml, pickFormat } from "../utils/statusHtml";

// Public service-status document, served at https://audit.icjia.app/status.
//
// Lives at /status — NOT under /api/ — because production nginx sends /api/*
// straight to Express; this path must reach the Nuxt process so the response
// can report on both tiers (this handler ran => web ok; loopback probe
// answered => api ok).
//
// Intended for internal developers and curious managers, not for search
// engines: robots.txt disallows it AND every response carries X-Robots-Tag,
// because robots.txt is advisory while the header is honoured even when the
// URL is reached directly.
// Filename carries NO method suffix on purpose. As `status.get.ts` this route
// answered GET and 404'd everything else — including HEAD, which several
// uptime monitors (UptimeRobot among them) send by default. A monitor would
// then report the service down while it was perfectly healthy. Nitro matches
// any method for an unsuffixed file, and the guard below narrows that back to
// exactly GET and HEAD.
//
// Node omits the body of a HEAD response automatically, so a HEAD request
// still runs the real probe and returns the true 200/503 — which is the whole
// point: a status code that did not reflect reality would be worse than a 404.
export default defineEventHandler(async (event) => {
  if (event.method !== "GET" && event.method !== "HEAD") {
    setResponseStatus(event, 405);
    setResponseHeader(event, "Allow", "GET, HEAD");
    return { error: "Method not allowed" };
  }

  const { apiInternalUrl } = useRuntimeConfig(event);
  setResponseHeader(event, "X-Robots-Tag", "noindex, nofollow");
  setResponseHeader(event, "Cache-Control", "no-store");

  const result = await resolveStatus(() =>
    // retry: 0 so a dying API fails fast rather than multiplying ofetch's
    // default retries. The timeout is more generous than /healthz's 3s
    // because a cold engine-probe cache makes the API spawn subprocesses
    // (including a veraPDF JVM) before it can answer.
    $fetch<ApiStatusPayload>(`${apiInternalUrl}/api/status`, {
      timeout: 15000,
      retry: 0,
      // Critical: Express answers 503 WITH a full payload when a core engine
      // is broken. Without this, ofetch would throw and the payload naming
      // the broken component would be discarded in favour of a bare
      // "api: down" — losing the exact diagnosis this endpoint exists for.
      ignoreResponseError: true,
    }),
  );

  setResponseStatus(event, result.httpStatus);

  // Representation is negotiated, NOT switched. JSON stays the default for
  // everything that is not unambiguously a browser, because this endpoint is
  // monitored: UptimeRobot and curl send `*/*`, which must keep receiving the
  // JSON body a keyword alert on "degraded" depends on. Only an explicit
  // text/html in Accept flips it, and ?format= overrides both.
  const format = pickFormat(getRequestHeader(event, "accept"), getQuery(event));

  if (format === "html") {
    setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");
    return renderStatusHtml(result.body);
  }

  // Advertise the human view without touching the payload. A field for it
  // would change the machine contract and break the top-level key allow-list
  // in statusPrivacy.test.ts; a header costs the body nothing.
  setResponseHeader(event, "Link", '</status?format=html>; rel="alternate"; type="text/html"');
  return result.body;
});
