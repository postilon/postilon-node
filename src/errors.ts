/**
 * An error answered by the Postilon API: `{"error": {"code", "message"}}` with an HTTP status.
 * See https://postilon.com/docs/errors for the codes. Network failures are not wrapped: they
 * reject with the error `fetch` threw.
 */
export class PostilonError extends Error {
  override readonly name = "PostilonError";
  /** HTTP status, such as 403. */
  readonly status: number;
  /** Error code, such as `domain_not_verified`; `http_error` when the body was not a Postilon error. */
  readonly code: string;
  /**
   * For `429 rate_limit_exceeded`: when the rate limit window resets, in Unix seconds
   * (the `X-RateLimit-Reset` header). Retry after this time.
   */
  readonly rateLimitReset?: number;

  constructor(status: number, code: string, message: string, rateLimitReset?: number) {
    super(message);
    this.status = status;
    this.code = code;
    if (rateLimitReset !== undefined) this.rateLimitReset = rateLimitReset;
  }
}

/** Builds the error for a non-2xx response from its status, headers and body text. */
export function errorFromResponse(status: number, headers: { get(name: string): string | null }, bodyText: string): PostilonError {
  let code = "http_error";
  let message = `HTTP ${status}`;
  try {
    const err = (JSON.parse(bodyText) as { error?: { code?: unknown; message?: unknown } }).error;
    if (err && typeof err.code === "string") {
      code = err.code;
      if (typeof err.message === "string" && err.message) message = err.message;
    }
  } catch {
    // Not JSON (a proxy's error page, say): keep the generic code and message.
  }
  let reset: number | undefined;
  if (status === 429 && code === "rate_limit_exceeded") {
    const n = Number(headers.get("X-RateLimit-Reset"));
    if (Number.isFinite(n) && n > 0) reset = n;
  }
  return new PostilonError(status, code, message, reset);
}
