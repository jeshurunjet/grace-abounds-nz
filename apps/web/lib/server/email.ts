/**
 * Sends account email through Resend when RESEND_API_KEY is set. In local
 * development without a key, the message is printed to the web server
 * console instead (codes must never be logged in production).
 */
export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('RESEND_API_KEY is required to send account email.');
    console.info(
      `\n[dev email] To: ${message.to}\nSubject: ${message.subject}\n${message.text}\n`,
    );
    return;
  }
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error('EMAIL_FROM is required to send account email.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, ...message }),
  });
  if (!response.ok)
    throw new Error(
      `Email provider rejected the message (${response.status}).`,
    );
}

const codeHtml = (intro: string, code: string, outro: string) =>
  `<p>${intro}</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>${outro}</p>`;

const IGNORE =
  'It expires in 10 minutes. If you didn’t ask for it, you can ignore this email.';

export const emails = {
  signInCode: (to: string, code: string) => ({
    to,
    subject: `${code} is your Grace Abounds sign-in code`,
    text: `Your Grace Abounds sign-in code is ${code}.\n\n${IGNORE}`,
    html: codeHtml('Your Grace Abounds sign-in code is', code, IGNORE),
  }),
  signupCode: (to: string, code: string) => ({
    to,
    subject: `${code} is your Grace Abounds verification code`,
    text: `Use ${code} to verify your email and finish creating your Grace Abounds account.\n\n${IGNORE}`,
    html: codeHtml(
      'Use this code to verify your email and finish creating your Grace Abounds account:',
      code,
      IGNORE,
    ),
  }),
  alreadyRegistered: (to: string) => ({
    to,
    subject: 'You already have a Grace Abounds account',
    text: 'Someone tried to create a Grace Abounds account with this email, but you already have one. Sign in with an email code, or use “Forgot password?” to set a new password.\n\nIf this wasn’t you, you can ignore this email.',
    html: '<p>Someone tried to create a Grace Abounds account with this email, but you already have one.</p><p>Sign in with an email code, or use “Forgot password?” to set a new password.</p><p>If this wasn’t you, you can ignore this email.</p>',
  }),
  resetCode: (to: string, code: string) => ({
    to,
    subject: `${code} is your Grace Abounds password reset code`,
    text: `Use ${code} to choose a new Grace Abounds password. Resetting signs you out on every device.\n\n${IGNORE}`,
    html: codeHtml(
      'Use this code to choose a new Grace Abounds password. Resetting signs you out on every device.',
      code,
      IGNORE,
    ),
  }),
  reauthCode: (to: string, code: string) => ({
    to,
    subject: `${code} is your Grace Abounds security code`,
    text: `Use ${code} to confirm it’s you before changing your account security settings.\n\n${IGNORE}`,
    html: codeHtml(
      'Use this code to confirm it’s you before changing your account security settings:',
      code,
      IGNORE,
    ),
  }),
};
