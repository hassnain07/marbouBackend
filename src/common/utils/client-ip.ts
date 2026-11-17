import type { Request } from 'express';

/**
 * Extract the real client IP from a request, honoring TRUSTED_PROXY_HOPS.
 *
 * When TRUSTED_PROXY_HOPS > 0, parse x-forwarded-for from the right (most recent
 * proxy) and take that many hops. Otherwise use req.ip directly (no trust).
 *
 * This prevents IP spoofing when the app is not behind a trusted proxy, and
 * correctly extracts the client IP when it is (e.g. behind nginx or a cloud LB).
 *
 * Example with TRUSTED_PROXY_HOPS=1 and x-forwarded-for: "203.0.113.1, 198.51.100.2"
 * → returns "198.51.100.2" (the IP added by our trusted proxy).
 *
 * Example with TRUSTED_PROXY_HOPS=0 and x-forwarded-for: "203.0.113.1, 198.51.100.2"
 * → returns req.ip (ignores the header; attacker cannot spoof).
 */
export function getClientIp(req: Request, trustedProxyHops = 0): string {
  if (trustedProxyHops <= 0) {
    // No trusted proxies; ignore x-forwarded-for entirely
    return req.ip || 'unknown';
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  if (!forwardedFor) {
    return req.ip || 'unknown';
  }

  const chain = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ips = chain.split(',').map((ip) => ip.trim());

  // Take the Nth IP from the right (most recent proxy = rightmost)
  const index = Math.max(0, ips.length - trustedProxyHops);
  return ips[index] || req.ip || 'unknown';
}
