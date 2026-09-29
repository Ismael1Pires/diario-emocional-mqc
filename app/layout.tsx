import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Diário Emocional | Jeniffer Pires',
  description: 'Um diário gentil para reconhecer emoções, compreender gatilhos e transformar padrões.',
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
