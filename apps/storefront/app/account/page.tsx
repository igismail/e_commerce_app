import { AccountDashboard } from '@/components/account-dashboard';

export const metadata = { title: 'Your account' };

export default function AccountPage() {
  return (
    <main className="content-width page-content">
      <div className="page-intro">
        <p className="eyebrow">Your account</p>
        <h1>Orders and details.</h1>
      </div>
      <AccountDashboard />
    </main>
  );
}
