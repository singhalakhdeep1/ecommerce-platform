import type { Metadata, Viewport } from 'next';
import Header from '@/components/Header';
import { StoreProvider } from '@/components/StoreProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShopLine',
  description: 'Storefront and admin for the e-commerce platform API',
  manifest: '/manifest.json',
};

export const viewport: Viewport = { themeColor: '#4f46e5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <footer className="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-400">ShopLine demo store</footer>
        </StoreProvider>
      </body>
    </html>
  );
}
