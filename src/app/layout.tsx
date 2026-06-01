import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'embarca — Conciliador Inteligente',
  description: 'Concilia tus pagos contraentrega COD automáticamente. Sin Excel. Sin esperar al lunes.',
  icons: { icon: '/logo.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className={`${inter.className} bg-gray-50 antialiased`}>{children}</body>
    </html>
  );
}
