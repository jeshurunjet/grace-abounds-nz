import { SignJWT } from 'jose';

const encoder = new TextEncoder();

function assertionKey() {
  const secret = process.env.API_ASSERTION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('API_ASSERTION_SECRET must be set (32+ characters).');
  return encoder.encode(secret);
}

/**
 * A 60-second, audience-scoped statement of who is calling the API. The API
 * still reloads the session, role and status itself; this only proves identity.
 */
export function signIdentityAssertion(
  identity: { userId: string; sessionId: string; sessionVersion: number },
  requestId: string,
) {
  return new SignJWT({
    rid: requestId,
    sid: identity.sessionId,
    sv: identity.sessionVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.userId)
    .setIssuer('grace-web')
    .setAudience('grace-api')
    .setIssuedAt()
    .setExpirationTime('60s')
    .setJti(crypto.randomUUID())
    .sign(assertionKey());
}
