import { RegisterForm } from '@/components/auth-forms';

export const metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <p className="eyebrow">A better everyday starts here</p>
      <h1>Create your Commerce account.</h1>
      <RegisterForm />
    </main>
  );
}
