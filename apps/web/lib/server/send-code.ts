import { CODE_LIMITS, consumeAttempt } from './auth-limits';

/**
 * Sends a six-digit sign-in code. Uses Resend when RESEND_API_KEY is set;
 * in development it prints the code to the server console instead.
 * Requests over the limit are silently dropped, so responses never reveal
 * whether an address exists or is being rate limited.
 */
export async function sendSignInCode({
  identifier,
  token,
}: {
  identifier: string;
  token: string;
}) {
  const allowed = await consumeAttempt(
    `code-request:${identifier}`,
    CODE_LIMITS.requests.max,
    CODE_LIMITS.requests.windowMs,
  );
  if (!allowed) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('RESEND_API_KEY is required to send sign-in codes.');
    console.info(`\n[dev] Sign-in code for ${identifier}: ${token}\n`);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: identifier,
      subject: `${token} is your Grace Abounds sign-in code`,
      text: `Your Grace Abounds sign-in code is ${token}.\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<p>Your Grace Abounds sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${token}</p><p>It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok)
    throw new Error(
      `Email provider rejected the sign-in code (${response.status}).`,
    );
}
