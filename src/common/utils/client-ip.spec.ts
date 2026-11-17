import { getClientIp } from './client-ip';
import type { Request } from 'express';

// Helper to create minimal request mocks without full Express types.
function mockReq(ip: string | undefined, xff?: string | string[]): Request {
  return { ip, headers: xff !== undefined ? { 'x-forwarded-for': xff } : {} } as unknown as Request;
}

describe('getClientIp', () => {
  it('returns req.ip when TRUSTED_PROXY_HOPS=0', () => {
    const req = mockReq('192.168.1.100', '203.0.113.1, 198.51.100.2');
    expect(getClientIp(req, 0)).toBe('192.168.1.100');
  });

  it('ignores x-forwarded-for when TRUSTED_PROXY_HOPS=0 (spoofing protection)', () => {
    const req = mockReq('192.168.1.100', '1.2.3.4');
    expect(getClientIp(req, 0)).toBe('192.168.1.100');
  });

  it('extracts 1 hop from the right when TRUSTED_PROXY_HOPS=1', () => {
    const req = mockReq('127.0.0.1', '203.0.113.1, 198.51.100.2');
    expect(getClientIp(req, 1)).toBe('198.51.100.2');
  });

  it('extracts 2 hops from the right when TRUSTED_PROXY_HOPS=2', () => {
    const req = mockReq('127.0.0.1', '203.0.113.1, 198.51.100.2, 10.0.0.1');
    expect(getClientIp(req, 2)).toBe('198.51.100.2');
  });

  it('handles single IP in x-forwarded-for', () => {
    const req = mockReq('127.0.0.1', '203.0.113.1');
    expect(getClientIp(req, 1)).toBe('203.0.113.1');
  });

  it('falls back to req.ip when x-forwarded-for is missing but hops > 0', () => {
    const req = mockReq('192.168.1.100');
    expect(getClientIp(req, 1)).toBe('192.168.1.100');
  });

  it('returns "unknown" when both req.ip and x-forwarded-for are missing', () => {
    const req = mockReq(undefined);
    expect(getClientIp(req, 0)).toBe('unknown');
  });

  it('handles array-form x-forwarded-for header', () => {
    const req = mockReq('127.0.0.1', ['203.0.113.1, 198.51.100.2']);
    expect(getClientIp(req, 1)).toBe('198.51.100.2');
  });

  it('trims whitespace from IPs', () => {
    const req = mockReq('127.0.0.1', '  203.0.113.1  ,  198.51.100.2  ');
    expect(getClientIp(req, 1)).toBe('198.51.100.2');
  });

  /**
   * A6: Spoofed x-forwarded-for cannot bypass an ipAllowList when TRUSTED_PROXY_HOPS=0.
   * The attacker sets X-Forwarded-For to a trusted IP, but we ignore the header
   * and use req.ip instead (the actual socket address).
   */
  it('A6: spoofed x-forwarded-for cannot bypass IP allow-list when TRUSTED_PROXY_HOPS=0', () => {
    const allowedIp = '10.0.0.1';
    const attackerActualIp = '45.33.32.156'; // Not in allow-list

    const req = mockReq(attackerActualIp, allowedIp); // attacker spoofs trusted IP

    // With TRUSTED_PROXY_HOPS=0, getClientIp returns req.ip (the real socket IP)
    const extractedIp = getClientIp(req, 0);
    expect(extractedIp).toBe(attackerActualIp); // Returns real IP, not the spoofed one

    // The IP allow-list check would then block this request
    const ipAllowList = [allowedIp];
    expect(ipAllowList.includes(extractedIp)).toBe(false);
  });
});
