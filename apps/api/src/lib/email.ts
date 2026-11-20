/*
 * Optional update emails from the API (Phase 5A), through the same email
 * provider settings the website already uses for security codes
 * (RESEND_API_KEY, EMAIL_FROM); no new provider or sender address. Each
 * message carries an idempotency key so a retried send is accepted once by
 * the provider. Without a key in local development, the message is printed
 * to the API log instead (subject and recipient only; the text is generic).
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable per message: the provider accepts a repeated key once. */
  idempotencyKey: string;
};
/** Sends one message; resolves to the provider's message id. */
export type SendEmail = (message: EmailMessage) => Promise<string>;

export function emailSender(
  env: NodeJS.ProcessEnv = process.env,
  send: typeof fetch = fetch,
): SendEmail {
  return async (message) => {
    const apiKey = env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      if (env.NODE_ENV === 'production')
        throw new Error('RESEND_API_KEY is required to send email.');
      console.info(
        `[dev email] To: ${message.to} Subject: ${message.subject} (not sent: no email provider key)`,
      );
      return 'dev-log';
    }
    const from = env.EMAIL_FROM?.trim();
    if (!from) throw new Error('EMAIL_FROM is required to send email.');
    const { idempotencyKey, ...content } = message;
    const response = await send('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from, ...content }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(
        `Email provider refused the message (${response.status}).`,
      );
    const body = (await response.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    return typeof body?.id === 'string' ? body.id : '';
  };
}
