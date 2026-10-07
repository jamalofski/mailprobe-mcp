// The tools of the server: what the model reads, and what a call does.
//
// MailProbe also runs a remote MCP server, at https://mailprobe.dev/mcp. The instructions
// and the tool definitions below are its own, word for word: an assistant finds the same
// tools whichever server its client reaches. `npm run check-tools` compares them.
import { ApiError } from './api.js';
import { NO_KEY, UNAVAILABLE, apiErrorText } from './messages.js';

export const INSTRUCTIONS =
  'MailProbe checks whether email addresses exist and can receive mail, in real time and without sending anything. ' +
  'Call verify_emails with 1 to 20 addresses and act on `status`: valid is safe to send, invalid must not be used, ' +
  'risky and unknown call for a human decision. Each address actually probed costs one credit of the account; ' +
  'get_credits returns the balance.';

// The bound of POST /api/v1/verify. The API has the last word: beyond it, it refuses.
export const MAX_EMAILS = 20;

export const TOOLS = [
  {
    name: 'verify_emails',
    title: 'Verify Email Addresses',
    description:
      'Checks whether email addresses exist and can receive mail, in real time and without sending anything. ' +
      'Returns one result per address, in input order. Act on `status`: `valid` is safe to send, `invalid` must not ' +
      'be used, `risky` is accepted but uncertain (catch-all domain, role or disposable address, provider that blocks ' +
      'probing) and `unknown` could not be determined. `score` is a 0-100 confidence value, `reason` explains a ' +
      'verdict that is not plainly deliverable and `did_you_mean` suggests a fix for a likely typo. ' +
      'One credit per address actually probed: duplicates and malformed addresses are free. ' +
      `At most ${MAX_EMAILS} addresses per call: split a longer list into several calls.`,
    inputSchema: {
      type: 'object',
      properties: {
        emails: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: MAX_EMAILS,
          description: `Email addresses to verify, 1 to ${MAX_EMAILS}.`,
        },
      },
      required: ['emails'],
      additionalProperties: false,
    },
    // Read-only: the tool questions mail servers and changes no data. `title` is repeated
    // in the annotations for the clients from before 2025-06-18, which only read that one.
    annotations: { title: 'Verify Email Addresses', readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'get_credits',
    title: 'Get Credit Balance',
    description:
      'Returns the number of verification credits left on the MailProbe account that owns the API key. ' +
      'Reading the balance uses no credit.',
    inputSchema: { type: 'object', additionalProperties: false },
    annotations: { title: 'Get Credit Balance', readOnlyHint: true, openWorldHint: false },
  },
];

const toolResult = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
// A tool error is a result, not a protocol error: it is the form the model reads, so the
// only one it can act on.
const toolError = (text) => ({ content: [{ type: 'text', text }], isError: true });

async function verifyEmails(args, api, signal) {
  const { emails } = args;
  if (!Array.isArray(emails) || emails.length === 0) {
    return toolError(`Provide "emails": an array of 1 to ${MAX_EMAILS} email addresses.`);
  }
  if (emails.length > MAX_EMAILS) {
    return toolError(`Too many addresses: ${emails.length} received, ${MAX_EMAILS} at most per call. Split the list into several calls.`);
  }
  if (!emails.every((email) => typeof email === 'string')) {
    return toolError('Every entry of "emails" must be a string.');
  }
  const results = await api.verify(emails, { signal });
  return Array.isArray(results) ? toolResult({ results }) : toolError(UNAVAILABLE);
}

async function getCredits(args, api, signal) {
  const balance = await api.credits({ signal });
  return balance && typeof balance.credits === 'number' ? toolResult({ credits: balance.credits }) : toolError(UNAVAILABLE);
}

const RUN = new Map([['verify_emails', verifyEmails], ['get_credits', getCredits]]);

/**
 *   api: the MailProbe client (api.js)
 *   hasKey: whether an API key is configured
 * Returns the tool definitions and the function that runs a call.
 */
export function createTools({ api, hasKey }) {
  async function callTool(name, args, { signal }) {
    if (!hasKey) return toolError(NO_KEY);
    try {
      return await RUN.get(name)(args, api, signal);
    } catch (error) {
      if (error instanceof ApiError) return toolError(apiErrorText(error));
      if (error.name === 'TimeoutError') return toolError('MailProbe did not answer in time. Try again in a moment.');
      if (error instanceof TypeError && error.message === 'fetch failed') {
        return toolError('Could not reach MailProbe. Check the network connection and try again.');
      }
      // A call cancelled by the client ends here too: the protocol layer sends nothing back.
      throw error;
    }
  }

  return { tools: TOOLS, callTool };
}
