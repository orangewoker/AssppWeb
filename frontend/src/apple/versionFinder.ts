import { appleRequest } from './request';
import {
  parseStoreResponse,
  storeResponseMessage,
  shouldRetryEmptyStoreResponse,
} from './storeResponse';
import { isRetryableStoreConnectionError } from './storeConnection';
import { buildPlist } from './plist';
import { extractAndMergeCookies } from './cookies';
import {
  RETRYABLE_FAILURE_TYPE,
  legacyVolumeStoreEndpoint,
  redownloadEndpoint,
  volumeStoreEndpoint,
} from './config';

import type { Account, Software } from '../types';
import type { AppleResponse } from './request';

export async function listVersions(
  account: Account,
  app: Software,
): Promise<{ versions: string[]; updatedCookies: typeof account.cookies }> {
  const deviceId = account.deviceIdentifier;

  let endpoint = volumeStoreEndpoint(account.pod, deviceId);
  let requestHost = endpoint.host;
  let requestPath = endpoint.path;
  let triedRedownload = false;
  let triedLegacy = false;
  const nextEndpoint = (forceRedownload = false) => {
    if (triedRedownload) return undefined;
    if (!forceRedownload && !triedLegacy) {
      triedLegacy = true;
      return legacyVolumeStoreEndpoint(deviceId);
    }
    triedRedownload = true;
    return redownloadEndpoint(deviceId);
  };
  let cookies = [...account.cookies];
  let redirectAttempt = 0;

  while (redirectAttempt <= 3) {
    const payload: Record<string, any> = {
      creditDisplay: '',
      guid: deviceId,
      salableAdamId: app.id,
    };

    const plistBody = buildPlist(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-apple-plist',
      'iCloud-DSID': account.directoryServicesIdentifier,
      'X-Dsid': account.directoryServicesIdentifier,
    };

    let response: AppleResponse;
    try {
      response = await appleRequest({
        method: 'POST',
        host: requestHost,
        path: requestPath,
        headers,
        body: plistBody,
        cookies,
      });
    } catch (error) {
      if (triedRedownload || !isRetryableStoreConnectionError(error))
        throw error;
      endpoint = nextEndpoint()!;
      requestHost = endpoint.host;
      requestPath = endpoint.path;
      redirectAttempt = 0;
      continue;
    }

    cookies = extractAndMergeCookies(response.rawHeaders, cookies);

    if (response.status === 302) {
      const location = response.headers['location'];
      if (!location) {
        throw new Error('Failed to retrieve redirect location');
      }
      const url = new URL(location);
      requestHost = url.hostname;
      requestPath = url.pathname + url.search;
      redirectAttempt++;
      continue;
    }

    const dict = parseStoreResponse(response, requestHost);

    const responseMessage = storeResponseMessage(dict);
    if (
      shouldRetryEmptyStoreResponse(dict, response.status) &&
      !triedRedownload
    ) {
      endpoint = nextEndpoint()!;
      requestHost = endpoint.host;
      requestPath = endpoint.path;
      redirectAttempt = 0;
      continue;
    }
    if (!Array.isArray(dict.songList) || dict.songList.length === 0) {
      if (responseMessage && !dict.failureType)
        throw new Error(responseMessage);
    }

    const songList = dict.songList as Record<string, any>[] | undefined;
    if (!Array.isArray(songList) || songList.length === 0) {
      if (dict.failureType) {
        const failureType = String(dict.failureType);

        // volumeStore intermittently returns 5002; retry once via the
        // redownload dispatch endpoint, which serves the same payload.
        if (failureType === RETRYABLE_FAILURE_TYPE && !triedRedownload) {
          endpoint = nextEndpoint(true)!;
          requestHost = endpoint.host;
          requestPath = endpoint.path;
          redirectAttempt = 0;
          continue;
        }

        switch (failureType) {
          case '2034':
            throw new Error('Password token is expired');
          case '9610':
            throw new Error('License required - purchase the app first');
          default: {
            const msg = dict.customerMessage as string | undefined;
            throw new Error(msg ?? 'No items in response');
          }
        }
      }
      throw new Error('No items in response');
    }

    const item = songList[0];
    const metadata = item.metadata as Record<string, any>;
    if (!metadata) {
      throw new Error('Missing version identifiers');
    }

    const identifiers = metadata.softwareVersionExternalIdentifiers as any[];
    if (!identifiers) {
      throw new Error('Missing version identifiers');
    }

    const versions = identifiers.map((id) => String(id)).reverse();
    if (versions.length === 0) {
      throw new Error('No versions found');
    }

    return { versions, updatedCookies: cookies };
  }

  throw new Error('Too many redirects');
}
