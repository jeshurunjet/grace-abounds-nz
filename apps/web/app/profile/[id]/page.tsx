import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { getRoleNavigation } from '../../lib/role-navigation';
import { ProfileView } from './profile-view';

/**
 * Own profile, keyed by the canonical user id. Staff views of other
 * members belong to the limited directory (Phase 4); until then any other
 * id redirects to the signed-in person's own profile.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  const { id } = await params;
  if (id !== session.user.id) redirect(`/profile/${session.user.id}`);
  return <ProfileView workspace={getRoleNavigation(session.user.role)} />;
}
