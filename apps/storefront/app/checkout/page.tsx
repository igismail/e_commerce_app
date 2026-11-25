'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckoutForm } from '@/components/checkout-form';
import { useAuth } from '@/components/providers';

export default function CheckoutPage() {
  const { session, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) {
      router.replace('/login?next=%2Fcheckout');
    }
  }, [ready, router, session]);

  if (!ready || !session) {
    return (
      <main className="content-width page-content">
        <p aria-live="polite">Preparing secure checkout…</p>
        <p>
          <Link className="text-link" href="/login">
            Sign in to continue
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="content-width page-content">
      <div className="page-intro">
        <p className="eyebrow">Almost yours</p>
        <h1>Secure checkout</h1>
      </div>
      <CheckoutForm />
    </main>
  );
}
