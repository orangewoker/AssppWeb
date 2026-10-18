import { describe, expect, it } from 'vitest';
import { parseStoreResponse } from '../../src/apple/storeResponse';
import type { AppleResponse } from '../../src/apple/request';

describe('store response diagnostics', () => {
  it.each([
    [403, '', 'empty'],
    [404, '<html><body>private-account-token</body></html>', 'HTML'],
    [200, '{"token":"private-account-token"}', 'JSON'],
    [200, 'bplist00private-account-token', 'binary-plist'],
  ])(
    'reports status %s without exposing response data',
    (status, body, kind) => {
      const response = {
        status,
        body,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      } as AppleResponse;
      try {
        parseStoreResponse(response, 'downloaddispatch.itunes.apple.com');
        expect.unreachable();
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain(`HTTP ${status}`);
        expect(message).toContain(`format=${kind}`);
        expect(message).not.toContain('private-account-token');
      }
    },
  );
  it('retains valid dictionaries', () => {
    expect(
      parseStoreResponse(
        {
          status: 200,
          headers: {},
          body: '<plist><dict><key>failureType</key><string>2034</string></dict></plist>',
        } as AppleResponse,
        'p7-buy.itunes.apple.com',
      ),
    ).toEqual({ failureType: '2034' });
  });
});
