import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Diário Emocional | Jeniffer Pires',
  description: 'Um diário gentil para reconhecer emoções, compreender gatilhos e transformar padrões.',
  icons: {
    icon: [
      { url: '/brand/diary-icon-32.png?v=2', sizes: '32x32', type: 'image/png' },
      { url: '/brand/diary-icon-192.png?v=2', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/brand/diary-icon-180.png?v=2', sizes: '180x180', type: 'image/png' }],
    shortcut: '/brand/diary-icon-32.png?v=2',
  },
  openGraph: {
    title: 'Diário Emocional | Jeniffer Pires',
    description: 'Reconheça emoções. Compreenda gatilhos. Transforme padrões.',
    images: [{ url: '/og.png', width: 1732, height: 908, alt: 'Diário Emocional — Jeniffer Pires' }],
    type: 'website',
    locale: 'pt_BR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Diário Emocional | Jeniffer Pires',
    description: 'Reconheça emoções. Compreenda gatilhos. Transforme padrões.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
