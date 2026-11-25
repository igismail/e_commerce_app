import { ResetPasswordForm } from '@/components/auth-forms';

export const metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return (
    <main className="auth-page">
      <p className="eyebrow">Account security</p>
      <h1>Choose a new password.</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="form-message" role="alert">
          This reset link is incomplete. Request a new one.
        </p>
      )}
    </main>
  );
}
