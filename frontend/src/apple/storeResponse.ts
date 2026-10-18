import { parsePlist } from './plist';
import type { AppleResponse } from './request';

// Never log response bodies: they may contain account metadata or tokens.
export function parseStoreResponse(
  response: AppleResponse,
  host: string,
): Record<string, any> {
  try {
    const value = parsePlist(response.body);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Not a dictionary');
    return value;
  } catch {
    // Only expose fixed classifications, never body snippets, headers or URLs
    // containing account identifiers. This also works on mobile without devtools.
    const body = response.body.trim();
    const kind = !body
      ? 'empty'
      : /^(?:<!doctype html|<html)\b/i.test(body)
        ? 'HTML'
        : /^[{[]/.test(body)
          ? 'JSON'
          : body.startsWith('bplist')
            ? 'binary-plist'
            : 'other';
    const mime = (response.headers['content-type'] || '').split(';')[0].trim();
    const type = /^(?:text|application)\/[a-z0-9.+-]{1,64}$/i.test(mime)
      ? mime
      : 'unknown';
    throw new Error(
      `Apple download response: ${host}; HTTP ${response.status}; type=${type}; format=${kind}. Expected XML plist.`,
    );
  }
}
export function storeResponseMessage(
  dict: Record<string, any>,
): string | undefined {
  const message = dict.dialog?.explanation || dict.customerMessage;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

export function shouldRetryEmptyStoreResponse(
  dict: Record<string, any>,
  status: number,
): boolean {
  return (
    status >= 200 &&
    status < 300 &&
    !dict.failureType &&
    !storeResponseMessage(dict) &&
    !dict.action &&
    (dict.songList === undefined ||
      (Array.isArray(dict.songList) && dict.songList.length === 0))
  );
}
