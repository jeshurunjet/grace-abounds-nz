import type { Metadata } from 'next';
import { AuthForm } from '../components/forms';
export const metadata: Metadata = { title: 'Login' };
export default function Login() {
  return (
    <AuthForm
      mode="login"
      googleEnabled={Boolean(
        process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
      )}
    />
  );
}
