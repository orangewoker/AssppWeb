import { beforeEach, expect, it, vi } from 'vitest';
import { lookupLatestVersion } from '../../src/apple/latestVersion';
import { appleRequest } from '../../src/apple/request';
import type { Account, Software } from '../../src/types';

vi.mock('../../src/apple/request', () => ({ appleRequest: vi.fn() }));
const account = { store: '143465-1', cookies: [{ name: 'secret', value: 'secret' }] } as Account;
const app = { id: 1422471180, bundleID: 'dazz.camera.vintagecamera' } as Software;
const response = (offers: unknown[], bundleId = app.bundleID) => ({
  status: 200, statusText: '', headers: {}, rawHeaders: [],
  body: JSON.stringify({ results: { [app.id]: { bundleId, offers } } }),
});
beforeEach(() => vi.resetAllMocks());

it('selects the iOS offer in the account region without transmitting credentials', async () => {
  vi.mocked(appleRequest).mockResolvedValue(response([
    { assets: [{ flavor: 'tvosSoftware' }], version: { externalId: 1 } },
    { assets: [{ flavor: 'iosSoftware' }], version: { externalId: 891972984 } },
  ]));
  expect(await lookupLatestVersion(account, app)).toBe('891972984');
  const request = vi.mocked(appleRequest).mock.calls[0][0];
  expect(request.cookies).toBeUndefined();
  expect(request.headers).toBeUndefined();
  expect(request.path).toContain('cc=cn');
});

it('does not accept a different bundle or non-iOS offers', async () => {
  vi.mocked(appleRequest).mockResolvedValue(response([{ assets: [{ flavor: 'iosSoftware' }] }], 'other.app'));
  await expect(lookupLatestVersion(account, app)).rejects.toThrow('different bundle');
  vi.mocked(appleRequest).mockResolvedValue(response([
    { assets: [{ flavor: 'tvosSoftware' }], version: { externalId: 1 } },
  ]));
  await expect(lookupLatestVersion(account, app)).rejects.toThrow('not found');
});
