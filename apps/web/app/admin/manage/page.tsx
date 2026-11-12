import { redirect } from 'next/navigation';
import { auth } from '../../../auth';

/** The former Manage hub: staff tools now live on Home. Old links still work. */
export default async function ManageRedirect() {
  const session = await auth();
  redirect(
    session?.user.role === 'pastor'
      ? '/pastor#staff-tools'
      : '/admin#staff-tools',
  );
}
