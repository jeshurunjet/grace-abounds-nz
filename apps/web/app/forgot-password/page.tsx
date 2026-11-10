import { redirect } from 'next/navigation';
// Accounts are passwordless (email code, Google or passkey).
export default function ForgotPasswordPage() {
  redirect('/login');
}
