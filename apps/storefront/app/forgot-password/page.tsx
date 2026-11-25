import { ForgotPasswordForm } from '@/components/auth-forms';

export const metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">Account help</p>
      <h1>Reset your password.</h1>
      <ForgotPasswordForm />
    </main>
  );
}
