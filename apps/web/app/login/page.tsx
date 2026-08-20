import type { Metadata } from 'next';
import { AuthForm } from '../components/forms';
export const metadata: Metadata = { title: 'Login' };
export default function Login() {
  return <AuthForm mode="login" />;
}
