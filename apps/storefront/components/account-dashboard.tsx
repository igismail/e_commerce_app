'use client';

import Link from 'next/link';
import { AccountOrders } from './account-orders';
import { AccountProfile } from './account-profile';
import { AddressBook } from './address-book';
import { useAuth } from './providers';

export function AccountDashboard() {
  const { session, ready } = useAuth();
  if (!ready) return <p aria-live="polite">Checking your account…</p>;
  if (!session) {
    return (
      <div className="state-card">
        <p>Sign in to see your orders and manage your details.</p>
        <Link className="button button-dark" href="/login">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <section aria-labelledby="orders-heading">
        <div className="section-heading">
          <h2 id="orders-heading">Order history</h2>
        </div>
        <AccountOrders />
      </section>
      <section aria-labelledby="profile-heading" className="account-section">
        <div className="section-heading">
          <h2 id="profile-heading">Personal details</h2>
        </div>
        <AccountProfile />
      </section>
      <section aria-labelledby="addresses-heading" className="account-section">
        <div className="section-heading">
          <h2 id="addresses-heading">Saved addresses</h2>
        </div>
        <AddressBook />
      </section>
      <section aria-labelledby="wishlist-heading" className="account-section">
        <div className="section-heading">
          <h2 id="wishlist-heading">Wishlist</h2>
        </div>
        <p>Keep track of items you want to come back to.</p>
        <Link className="button button-outline" href="/account/wishlist">
          View wishlist
        </Link>
      </section>
    </>
  );
}
