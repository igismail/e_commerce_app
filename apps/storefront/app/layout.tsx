import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
