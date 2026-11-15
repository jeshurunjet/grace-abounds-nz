import { redirect } from 'next/navigation';
import { auth } from '../../../auth';

/**
 * The former full-page Activities editor. Activities are now created and
 * edited from the Home calendar (Phase 3A: one calendar, one editor); old
 * links open the role's Home at the calendar.
 */
export default async function ActivitiesRedirect() {
  const session = await auth();
  redirect(
    session?.user.role === 'pastor' ? '/pastor#calendar' : '/admin#calendar',
  );
}
