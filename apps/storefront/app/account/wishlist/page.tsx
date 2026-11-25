import { AccountWishlist } from '@/components/account-wishlist';

export const metadata = { title: 'Your wishlist' };

export default function WishlistPage() {
  return (
    <main className="content-width page-content">
      <div className="page-intro">
        <p className="eyebrow">Your account</p>
        <h1>Wishlist.</h1>
      </div>
      <AccountWishlist />
    </main>
  );
}
