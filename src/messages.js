// What a refusal of the MailProbe API means, said to the model: it reads this text, so it
// must tell what to change or what to report to the user. The sentences are those of the
// remote MCP server of MailProbe, so that both servers answer alike.

const PRICING_URL = 'https://mailprobe.dev/pricing/';
export const KEYS_URL = 'https://mailprobe.dev/dashboard/#/developer';

export const NO_KEY =
  'No MailProbe API key. Set the MAILPROBE_API_KEY environment variable in the configuration of this MCP server. ' +
  `Keys are created under Developer in the MailProbe account: ${KEYS_URL}`;

const REFUSED_KEY =
  'MailProbe did not accept the API key. Check MAILPROBE_API_KEY in the configuration of this MCP server. ' +
  `Keys are created under Developer in the MailProbe account: ${KEYS_URL}`;

export const UNAVAILABLE = 'MailProbe could not complete this call. Try again in a moment.';

function retryIn(seconds) {
  return `Retry in ${seconds} second${seconds === 1 ? '' : 's'}.`;
}

/**
 * The text of a tool error for an ApiError. The message of the API is taken as it is
 * whenever there is one: it carries the figures (balance, limit), which are not copied here.
 */
export function apiErrorText(error) {
  const { status, body, code, retryAfter } = error;
  const message = typeof body.error === 'string' ? body.error : null;
  if (status === 401) return REFUSED_KEY;
  if (code === 'NO_CREDITS') {
    return `${message || 'Insufficient credits'}. Nothing was charged. Credits are bought at ${PRICING_URL}`;
  }
  if (code === 'PAID_ONLY_DOMAIN') {
    return `${message || 'A domain of this call can only be verified with purchased credits.'} Nothing was charged.`;
  }
  if (status === 429) return `${message || 'Rate limit exceeded.'} ${retryIn(retryAfter)}`;
  if (status >= 400 && status < 500 && message) return message;
  if (status === 500) return 'MailProbe could not complete the verification. Nothing was charged: try again in a moment.';
  return UNAVAILABLE;
}
