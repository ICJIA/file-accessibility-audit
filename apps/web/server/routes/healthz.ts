import { resolveHealthz, type ApiHealthPayload } from "../utils/health";

// Single uptime-monitor URL covering both tiers (see server/utils/health.ts).
// Lives at /healthz — NOT under /api/ — because production nginx sends /api/*
// straight to Express; this path must reach the Nuxt process so that one probe
// proves the web tier (this handler ran) and the API tier (loopback check).
// Filename carries NO method suffix on purpose — see the same note in
// status.ts. As `healthz.get.ts` this route 404'd HEAD requests, which several
// uptime monitors send by default, making a healthy service look down.
export default defineEventHandler(async (event) => {
  if (event.method !== "GET" && event.method !== "HEAD") {
    setResponseStatus(event, 405);
    setResponseHeader(event, "Allow", "GET, HEAD");
    return { error: "Method not allowed" };
  }

  const { apiInternalUrl } = useRuntimeConfig(event);
  setResponseHeader(event, "X-Robots-Tag", "noindex, nofollow");
  setResponseHeader(event, "Cache-Control", "no-store");
  const result = await resolveHealthz(() =>
    // retry: 0 so a dying API fails fast instead of ofetch's default retries;
    // 3s timeout keeps the response well inside the monitor's own timeout.
    $fetch<ApiHealthPayload>(`${apiInternalUrl}/api/health`, {
      timeout: 3000,
      retry: 0,
    }),
  );
  setResponseStatus(event, result.httpStatus);
  return result.body;
});
