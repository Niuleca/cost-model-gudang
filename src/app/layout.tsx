import './globals.css';
import NumberInputFix from '@/components/NumberInputFix';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Leca', template: '%s · Leca' },
  description: 'Leca — cost model, tender & quotation gudang. Dibuat oleh esapanghegar.',
  authors: [{ name: 'esapanghegar' }],
  metadataBase: new URL('https://niuleca.com'),
  openGraph: { siteName: 'Leca', locale: 'id_ID', images: [{ url: '/og-leca.jpg', width: 1200, height: 630 }] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <meta name="theme-color" content="#ffffff" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Mono:wght@400;500&display=swap"
        />
      </head>
      <body><NumberInputFix />{children}</body>
    </html>
  );
}
