import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authenticate,
  AuthenticationError,
} from '../../src/apple/authenticate';
import { fetchBag } from '../../src/apple/bag';
import { buildPlist } from '../../src/apple/plist';
import { appleRequest } from '../../src/apple/request';
import { prepareSigner } from '../../src/apple/sap/client';

vi.mock('../../src/apple/request', () => ({ appleRequest: vi.fn() }));
vi.mock('../../src/apple/sap/client', () => ({ prepareSigner: vi.fn() }));
vi.mock('../../src/apple/bag', async (original) => ({
  ...(await original<typeof import('../../src/apple/bag')>()),
  fetchBag: vi.fn(),
}));

const endpoints = {
  setupURL: 'https://fpinit.itunes.apple.com/v1/signSapSetup/legacy',
  certificateURL: 'https://s.mzstatic.com/sap/setupCert.plist',
  version: 200,
};
const response = (body: string, status = 200, headers = {}) => ({
  status,
  statusText: 'OK',
  headers,
  rawHeaders: [],
  body,
});

describe('SAP authentication integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchBag).mockResolvedValue({
      authURL:
        'https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate',
      sapEndpoints: endpoints,
    });
  });

  it('signs the exact UTF-8 body on each redirect and retains the pod', async () => {
    const sign = vi.fn().mockResolvedValue('signature');
    vi.mocked(prepareSigner).mockResolvedValue({ sign } as never);
    vi.mocked(appleRequest)
      .mockResolvedValueOnce(
        response('', 302, {
          location:
            'https://p25-buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate',
          pod: '25',
        }),
      )
      .mockResolvedValueOnce(
        response(
          buildPlist({
            accountInfo: { appleId: 'test@example.invalid', address: {} },
            passwordToken: 'token',
            dsPersonId: '123',
          }),
        ),
      );
    const account = await authenticate(
      'test@example.invalid',
      '密码',
      '123456',
      [],
      'aabbccddeeff',
    );
    expect(prepareSigner).toHaveBeenCalledWith('aabbccddeeff', endpoints);
    expect(sign).toHaveBeenCalledTimes(2);
    for (const [index, [request]] of vi
      .mocked(appleRequest)
      .mock.calls.entries()) {
      expect(sign.mock.calls[index][0]).toEqual(
        new TextEncoder().encode(request.body),
      );
      expect(request.headers?.['X-Apple-ActionSignature']).toBe('signature');
      expect(request.body).toContain('密码123456');
    }
    expect(account.pod).toBe('25');
  });

  it('stops immediately when the signed response requires 2FA', async () => {
    vi.mocked(prepareSigner).mockResolvedValue({
      sign: vi.fn().mockResolvedValue('signature'),
    } as never);
    vi.mocked(appleRequest).mockResolvedValue(
      response(
        buildPlist({
          failureType: '',
          customerMessage: 'MZFinance.BadLogin.Configurator_message',
        }),
      ),
    );
    await expect(
      authenticate(
        'test@example.invalid',
        'password',
        undefined,
        [],
        'aabbccddeeff',
      ),
    ).rejects.toMatchObject({
      name: AuthenticationError.name,
      codeRequired: true,
    });
    expect(appleRequest).toHaveBeenCalledTimes(1);
  });

  it('does not send credentials if signer initialization fails', async () => {
    vi.mocked(prepareSigner).mockRejectedValue(new Error('setup failed'));
    await expect(
      authenticate(
        'test@example.invalid',
        'password',
        undefined,
        [],
        'aabbccddeeff',
      ),
    ).rejects.toThrow('setup failed');
    expect(appleRequest).not.toHaveBeenCalled();
  });
});
