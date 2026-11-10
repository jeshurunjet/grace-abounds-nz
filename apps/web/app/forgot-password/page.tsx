import Link from 'next/link';
import { RecoveryForm } from '../components/recovery-form';
export default function ForgotPasswordPage() {
  return (
    <RecoveryForm
      mode="forgot"
      footer={<Link href="/login">← Back to sign in</Link>}
    />
  );
}
