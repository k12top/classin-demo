export function isTransientWhiteboardError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:pong timeout|timed? ?out|fetch failed|network ?error|websocket|econnreset|etimedout|eai_again)/i.test(
    message,
  );
}

export async function retryWhiteboardRequest<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  const delays = [350, 1_000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= delays.length || !shouldRetry(error)) throw error;
      await wait(delays[attempt]);
    }
  }
}
