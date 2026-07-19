import { resolveHealthz, type ApiHealthPayload } from "../utils/health";

// Single uptime-monitor URL covering both tiers (see server/utils/health.ts).
// Lives at /healthz — NOT under /api/ — because production nginx sends /api/*
// straight to Express; this path must reach the Nuxt process so that one probe
// proves the web tier (this handler ran) and the API tier (loopback check).
export default defineEventHandler(async (event) => {
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
