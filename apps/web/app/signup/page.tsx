import type { Metadata } from 'next';
import { AuthForm } from '../components/forms';
export const metadata: Metadata = { title: 'Sign Up' };
export default function Signup() {
  return (
    <AuthForm
      mode="signup"
      googleEnabled={Boolean(
        process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
      )}
    />
  );
}
