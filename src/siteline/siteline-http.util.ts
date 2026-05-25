export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isSitelineRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('http 429') || m.includes('too many requests') || m.includes('rate limit');
}

export function isRetryableDbError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
  return (
    msg.includes('failed to cancel request') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('deadlock') ||
    msg.includes('connection') ||
    msg.includes('econnreset')
  );
}
