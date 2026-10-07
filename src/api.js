// The MailProbe API, as the tools need it: verify addresses, read the credit balance.

export const DEFAULT_BASE_URL = 'https://mailprobe.dev/api/v1';

// MailProbe answers a verification within about 95 seconds, however slow the mail servers
// are. A backstop: the MCP client has its own timeout and cancels the request first.
const REQUEST_TIMEOUT_MS = 2 * 60_000;

// The API answers 429 `RATE_LIMITED` with a Retry-After header, before it probes or
// charges anything: the request is safe to send again. A tool call must not hang for
// minutes though: beyond these bounds the error goes back to the model, with the delay.
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
 */
export function createClient({ apiKey, baseUrl = DEFAULT_BASE_URL, userAgent, wait = sleep }) {
  async function request(method, pathname, { json, signal } = {}) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': userAgent,
          ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: json === undefined ? undefined : JSON.stringify(json),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await jsonOf(response);
      if (response.ok) return body;
      const refusal = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};
      const limited = response.status === 429;
      const retryAfter = retryAfterSeconds(response);
      if (!limited || attempt >= MAX_RETRIES || retryAfter > MAX_WAIT_SECONDS) {
        throw new ApiError(response.status, refusal, limited ? retryAfter : undefined);
      }
      await wait(retryAfter * 1000, signal);
    }
  }

  return {
    /** Verifies 1 to 20 addresses. Resolves to the body of the API: one entry per address, in input order. */
    verify(emails, { signal } = {}) {
      return request('POST', '/verify', { json: { emails }, signal });
    },

    /** Resolves to the body of the API: `{ credits }`. */
    credits({ signal } = {}) {
      return request('GET', '/credits', { signal });
    },
  };
}
