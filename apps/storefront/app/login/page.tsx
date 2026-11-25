import { LoginForm } from '@/components/auth-forms';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath =
    next?.startsWith('/') && !next.startsWith('//') ? next : '/account';
  return (
    <main className="auth-page">
      <p className="eyebrow">Welcome back</p>
      <h1>Sign in to your account.</h1>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
