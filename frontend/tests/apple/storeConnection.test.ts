import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDownloadInfo } from '../../src/apple/download';
import { listVersions } from '../../src/apple/versionFinder';
import { getVersionMetadata } from '../../src/apple/versionLookup';
import { appleRequest } from '../../src/apple/request';
import { buildPlist, parsePlist } from '../../src/apple/plist';
import { isRetryableStoreConnectionError } from '../../src/apple/storeConnection';
import type { Account, Software } from '../../src/types';

vi.mock('../../src/apple/request', () => ({ appleRequest: vi.fn() }));
const account = {
  pod: '7',
  deviceIdentifier: 'aabbccddeeff',
  cookies: [],
  directoryServicesIdentifier: '123',
  email: 'test@example.invalid',
} as unknown as Account;
const app = { id: 123 } as Software;
const ok = {
  status: 200,
  statusText: 'OK',
  headers: {},
  rawHeaders: [],
  body: buildPlist({
    songList: [
      {
        URL: 'https://example.apple.com/app.ipa',
        sinfs: [{ id: 0, sinf: 'AAAA' }],
        metadata: {
          bundleShortVersionString: '1.0',
          bundleVersion: '1',
          releaseDate: '2026-10-18T00:00:00Z',
          softwareVersionExternalIdentifiers: ['111', '222'],
        },
      },
    ],
  }),
};
const cases = [
  ['download', () => getDownloadInfo(account, app, '111'), true],
  ['versions', () => listVersions(account, app), false],
  ['metadata', () => getVersionMetadata(account, app, '111'), true],
] as const;

describe('store connection failover', () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(cases)(
    '%s retries an empty successful plist once',
    async (_name, run) => {
      vi.mocked(appleRequest)
        .mockResolvedValueOnce({ ...ok, body: buildPlist({ songList: [] }) })
        .mockResolvedValueOnce(ok);
      await run();
      expect(appleRequest).toHaveBeenCalledTimes(2);
      expect([
        'downloaddispatch.itunes.apple.com',
        'buy.itunes.apple.com',
      ]).toContain(vi.mocked(appleRequest).mock.calls[1][0].host);
    },
  );
  it.each(cases)('%s stops after two empty responses', async (_name, run) => {
    vi.mocked(appleRequest).mockResolvedValue({ ...ok, body: buildPlist({}) });
    await expect(run()).rejects.toThrow();
    expect(appleRequest).toHaveBeenCalledTimes(2);
  });
  it.each(cases)(
    '%s preserves Apple explanations without retry',
    async (_name, run) => {
      vi.mocked(appleRequest).mockResolvedValue({
        ...ok,
        body: buildPlist({
          dialog: { explanation: 'Please review your account.' },
        }),
      });
      await expect(run()).rejects.toThrow('Please review your account.');
      expect(appleRequest).toHaveBeenCalledTimes(1);
    },
  );
  it.each(cases)(
    '%s does not retry explicit auth failures',
    async (_name, run) => {
      vi.mocked(appleRequest).mockResolvedValue({
        ...ok,
        body: buildPlist({ failureType: '2034' }),
      });
      await expect(run()).rejects.toThrow();
      expect(appleRequest).toHaveBeenCalledTimes(1);
    },
  );
  it.each(cases)(
    '%s switches once after TLS failure',
    async (_name, run, version) => {
      vi.mocked(appleRequest)
        .mockRejectedValueOnce(
          new Error('Request failed with error code 35: SSL connect error'),
        )
        .mockResolvedValueOnce(ok);
      await run();
      expect(appleRequest).toHaveBeenCalledTimes(2);
      const [first, second] = vi
        .mocked(appleRequest)
        .mock.calls.map(([request]) => request);
      expect(first.host).toBe('p7-buy.itunes.apple.com');
      expect([
        'downloaddispatch.itunes.apple.com',
        'buy.itunes.apple.com',
      ]).toContain(second.host);
      expect(second.cookies).toEqual(account.cookies);
      expect(second.headers?.['X-Dsid']).toBe('123');
      const payload = parsePlist(second.body!);
      expect(payload.externalVersionId).toBeUndefined();
      if (version) expect(payload.appExtVrsId).toBe('111');
    },
  );
  it.each(cases)('%s stops if backup also fails', async (_name, run) => {
    vi.mocked(appleRequest).mockRejectedValue(new Error('error code 35'));
    await expect(run()).rejects.toThrow('error code 35');
    expect(appleRequest).toHaveBeenCalledTimes(2);
  });
  it.each(cases)('%s preserves non-transport failures', async (_name, run) => {
    vi.mocked(appleRequest).mockRejectedValue(
      new Error('error code 60: certificate verification failed'),
    );
    await expect(run()).rejects.toThrow('error code 60');
    expect(appleRequest).toHaveBeenCalledTimes(1);
  });
  it.each(cases)(
    '%s retains the existing 5002 fallback',
    async (_name, run) => {
      vi.mocked(appleRequest)
        .mockResolvedValueOnce({
          ...ok,
          body: buildPlist({ failureType: '5002' }),
        })
        .mockResolvedValueOnce(ok);
      await run();
      expect(appleRequest).toHaveBeenCalledTimes(2);
    },
  );
  it('does not classify authentication or parsing errors as connection failures', () => {
    for (const error of [
      '2034',
      '9610',
      'Invalid plist',
      'error code 350',
      'error code 60',
    ]) {
      expect(isRetryableStoreConnectionError(new Error(error))).toBe(false);
    }
    expect(isRetryableStoreConnectionError(new Error('ECONNRESET'))).toBe(true);
  });
});
