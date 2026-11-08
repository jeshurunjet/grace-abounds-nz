import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { profileById } from '../../lib/profiles';
import { getRoleNavigation } from '../../lib/role-navigation';
import { ProfileView } from './profile-view';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  const { id } = await params;
  const ownProfile = profileById(session.user.profileId);
  if (!ownProfile) redirect('/');
  const requestedProfile = profileById(id);
  if (
    !requestedProfile ||
    (!['admin', 'pastor'].includes(session.user.role) &&
      requestedProfile.id !== ownProfile.id)
  )
    redirect(`/profile/${ownProfile.id}`);
  return (
    <ProfileView
      profile={requestedProfile}
      workspace={getRoleNavigation(session.user.role)}
      canEdit={requestedProfile.id === ownProfile.id}
    />
  );
}
