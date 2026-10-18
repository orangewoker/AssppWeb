// Restrict failover to transport failures, not auth, certificate validation,
// malformed responses, or programming errors. Never retry purchases here.
export function isRetryableStoreConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /\berror code (?:6|7|28|35|52|55|56)\b/i.test(message) ||
    /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN)\b/.test(
      message,
    )
  );
}
