import { describe, expect, it } from 'vitest';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
import '../src/services/wsProxy.js';

describe('SAP Wisp destinations', () => {
  const allowed = (host: string) =>
    wisp.options.hostname_whitelist.some((entry: string | RegExp) =>
      typeof entry === 'string' ? host === entry : entry.test(host),
    );

  it('allows the certificate and setup hosts without opening arbitrary destinations', () => {
    expect(allowed('fpinit.itunes.apple.com')).toBe(true);
    expect(allowed('s.mzstatic.com')).toBe(true);
    expect(allowed('s.mzstatic.com.example.org')).toBe(false);
    expect(allowed('example.org')).toBe(false);
    expect(wisp.options.port_whitelist).toEqual([443]);
    expect(wisp.options.allow_direct_ip).toBe(false);
  });
});
