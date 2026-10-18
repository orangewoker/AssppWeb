// Never log response bodies: they may contain account metadata or tokens.
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
