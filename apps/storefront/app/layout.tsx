import type { Metadata } from 'next';
import { AppProviders } from '@/components/providers';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'Commerce — Considered goods for everyday life',
    template: '%s | Commerce',
  },
  description:
    'A thoughtful collection of everyday apparel, home goods, and accessories.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <AppProviders>
          <SiteHeader />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
