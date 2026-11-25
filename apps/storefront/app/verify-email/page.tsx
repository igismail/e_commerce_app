import { VerifyEmail } from '@/components/auth-forms';

export const metadata = { title: 'Verify your email' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return (
    <main className="auth-page">
      <p className="eyebrow">One last step</p>
      <h1>Verify your email address.</h1>
      {token ? (
        <VerifyEmail token={token} />
      ) : (
        <p className="form-message" role="alert">
          This verification link is incomplete. Request a new one from the sign-in page.
        </p>
      )}
    </main>
  );
}
