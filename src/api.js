// The MailProbe API, as the tools need it: verify addresses, read the credit balance.

export const DEFAULT_BASE_URL = 'https://mailprobe.dev/api/v1';

// MCP clients give up on a tool call after a minute, and a call they cancel returns
// nothing while the verdicts already in are charged. A tool call therefore answers within
// this many seconds, a wait for the rate limit included: the API is asked to answer in
// the time that is left (`timeout`), and an address that has no verdict yet at that point
// comes back `unknown` with the reason `timeout`, at no charge. The remote server of
// MailProbe asks the API for the same.
export const ANSWER_WITHIN_SECONDS = 55;
// The shortest `timeout` the API accepts.
const MIN_TIMEOUT_SECONDS = 5;

// A backstop, for an API that does not answer at all.
const REQUEST_TIMEOUT_MS = 2 * 60_000;

// The API answers 429 `RATE_LIMITED` with a Retry-After header, before it probes or
// charges anything: the request is safe to send again. A tool call must not outlast its
// client though: beyond these bounds, or when the wait would leave no time to verify,
// the error goes back to the model, with the delay.
const MAX_RETRIES = 2;
const MAX_WAIT_SECONDS = 30;
// Without the header, the window of the limiter.
const DEFAULT_RETRY_AFTER_SECONDS = 60;

/** A response of the API that is not a success: HTTP status, JSON body, seconds to wait. */
export class ApiError extends Error {
  constructor(status, body, retryAfter) {
    super(`MailProbe answered HTTP ${status}`);
    this.status = status;
    this.body = body;
    this.code = typeof body.code === 'string' ? body.code : undefined;
    this.retryAfter = retryAfter;
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

async function jsonOf(response) {
  try {
    return await response.json();
  } catch {
    // Not JSON: an HTML error page from a proxy, for example.
    return undefined;
  }
}

function retryAfterSeconds(response) {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 *   apiKey: the MailProbe API key
 *   baseUrl: the API root, changed only by the tests
 *   userAgent: `mailprobe-mcp/<version>`
 *   wait, now: the clock, changed only by the tests
 */
export function createClient({ apiKey, baseUrl = DEFAULT_BASE_URL, userAgent, wait = sleep, now = Date.now }) {
  // `json` is the body, or a function that gives it from the seconds the call has left.
  async function request(method, pathname, { json, signal } = {}) {
    const startedAt = now();
    const secondsLeft = () => ANSWER_WITHIN_SECONDS - (now() - startedAt) / 1000;
    for (let attempt = 0; ; attempt++) {
      const payload = typeof json === 'function' ? json(secondsLeft()) : json;
      const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': userAgent,
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await jsonOf(response);
      if (response.ok) return body;
      const refusal = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};
      const limited = response.status === 429;
      const retryAfter = retryAfterSeconds(response);
      const tooLong = retryAfter > MAX_WAIT_SECONDS || retryAfter > secondsLeft() - MIN_TIMEOUT_SECONDS;
      if (!limited || attempt >= MAX_RETRIES || tooLong) {
        throw new ApiError(response.status, refusal, limited ? retryAfter : undefined);
      }
      await wait(retryAfter * 1000, signal);
    }
  }

  return {
    /**
     * Verifies 1 to 20 addresses. Resolves to the body of the API: one entry per address, in
     * input order, `unknown` for an address that has no verdict yet when the time is up.
     */
    verify(emails, { signal } = {}) {
      const json = (seconds) => ({ emails, timeout: Math.max(MIN_TIMEOUT_SECONDS, Math.round(seconds)) });
      return request('POST', '/verify', { json, signal });
    },

    /** Resolves to the body of the API: `{ credits }`. */
    credits({ signal } = {}) {
      return request('GET', '/credits', { signal });
    },
  };
}
