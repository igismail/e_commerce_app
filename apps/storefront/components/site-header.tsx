'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from './providers';
import { useAuth } from './providers';

export function SiteHeader() {
  const { itemCount, isLoading } = useCart();
  const { session, logout, restoreError } = useAuth();
  const [logoutError, setLogoutError] = useState('');

  async function signOut() {
    setLogoutError('');
    try {
      await logout();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : 'Could not sign out.',
      );
    }
  }

  return (
    <header className="site-header">
      <Link aria-label="Commerce home" className="brand" href="/">
        commerce<span>.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/products">Shop</Link>
        <Link href="/#about">Our approach</Link>
        {session ? (
          <>
            <Link href="/account">Account</Link>
            <button className="header-button" onClick={signOut} type="button">
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
        <Link aria-label={`Shopping bag, ${itemCount} items`} href="/cart">
          Bag ({isLoading ? '…' : itemCount})
        </Link>
      </nav>
      {logoutError ? (
        <span className="auth-notice" role="alert">
          {logoutError}
        </span>
      ) : restoreError ? (
        <span className="auth-notice" role="status">
          {restoreError}
        </span>
      ) : null}
    </header>
  );
}
