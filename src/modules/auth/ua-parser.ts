/**
 * Minimal User-Agent parser — extracts deviceName and OS without a heavy dependency.
 * Covers the most common patterns; falls back to 'Unknown'.
 */
export function parseUA(ua: string): { deviceName: string | undefined; os: string | undefined } {
  if (!ua) return { deviceName: undefined, os: undefined };

  let os: string | undefined;
  if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let deviceName: string | undefined;
  const mobile = /mobile|android|iphone/i.test(ua);
  const tablet = /ipad|tablet/i.test(ua);
  if (/postmanruntime/i.test(ua)) deviceName = 'Postman';
  else if (/insomnia/i.test(ua)) deviceName = 'Insomnia';
  else if (tablet) deviceName = 'Tablet';
  else if (mobile) deviceName = 'Mobile';
  else deviceName = 'Desktop';

  return { deviceName, os };
}
