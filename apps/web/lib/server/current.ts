import { auth } from '../../auth';
import { HttpError } from './http';
import { currentSessionRow, isRecent } from './sessions';

/** The signed-in user and their valid session record, or a 401. */
export async function requireSignedIn() {
  const session = await auth();
  const row = await currentSessionRow(session?.sessionId, session?.user?.id);
  if (!session?.user?.id || !row)
    throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return { userId: session.user.id, row };
}

/** As above, and the session must have authenticated within the last 10 minutes. */
export async function requireRecentAuth() {
  const current = await requireSignedIn();
  if (!isRecent(current.row))
    throw new HttpError(
      403,
      'REAUTH_REQUIRED',
      'For your security, confirm it’s you first.',
    );
  return current;
}
