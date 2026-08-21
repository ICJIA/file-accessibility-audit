/**
 * Resolves the network interface the API server binds to.
 *
 * In production the process binds a single loopback address so the port is
 * reachable only from the same host — nginx proxies to 127.0.0.1, and no
 * legitimate caller hits the raw port from off-host (the fleet goes through
 * https://audit.icjia.app). This removes the 2026-08-20 audit finding that the
 * app listened on 0.0.0.0 with only the host firewall in front of it.
 *
 * In development the host is left UNSET (bind all interfaces, Node's default).
 * Forcing IPv4 127.0.0.1 there would break the Nuxt dev proxy, which targets
 * `localhost:5103` — `localhost` resolves to IPv6 ::1 first on some systems,
 * so an IPv4-only bind drops those connections. Dev runs on a laptop where
 * binding all interfaces is harmless.
 *
 * @param isProduction  process.env.NODE_ENV === "production"
 * @param bindHost      the configured production interface (DEPLOY.BIND_HOST)
 * @returns the host to pass to app.listen, or undefined to bind all interfaces
 */
export function resolveBindHost(isProduction: boolean, bindHost: string): string | undefined {
  return isProduction ? bindHost : undefined;
}
