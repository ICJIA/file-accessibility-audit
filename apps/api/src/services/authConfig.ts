/**
 * Fail-closed startup validation for auth secrets.
 *
 * When login is enabled, the JWT signing secret gates every session. If it
 * is unset or still the in-repo dev default, session cookies are forgeable
 * from the public source tree. This check refuses to start in that state,
 * mirroring validateMailConfig()'s hard-exit posture.
 *
 * Returns a human-readable error string when the config is unsafe, or null
 * when it is safe to proceed. The caller (index.ts) exits the process on a
 * non-null result.
 */
const JWT_DEV_DEFAULT = "dev-secret-do-not-use-in-production";

export function checkAuthConfig(requireLogin: boolean): string | null {
  if (!requireLogin) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === JWT_DEV_DEFAULT) {
    return (
      "JWT_SECRET must be set to a strong, non-default value when login is " +
      "enabled (AUTH.REQUIRE_LOGIN=true). It is currently " +
      (secret ? "the insecure in-repo dev default" : "unset") +
      ", which would let anyone forge session cookies. Set JWT_SECRET in the " +
      "environment (e.g. /etc/environment or the PM2 env) and restart."
    );
  }
  return null;
}
