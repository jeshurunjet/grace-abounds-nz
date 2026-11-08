import Link from 'next/link';
import { RecoveryForm } from '../components/recovery-form';
export default function ResetPasswordPage() { return <RecoveryForm mode="reset" footer={<Link href="/login">Return to sign in</Link>} />; }
