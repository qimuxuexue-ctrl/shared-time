export class RequestTimeoutError extends Error {
  constructor() {
    super("请求等待时间过长");
    this.name = "RequestTimeoutError";
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 12_000,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new RequestTimeoutError();
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function isRetryableLoadError(error: unknown) {
  return error instanceof RequestTimeoutError || error instanceof TypeError;
}
