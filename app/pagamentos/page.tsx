import type { Metadata } from 'next';
import BillingPage from './billing-page';

export const metadata: Metadata = {
  title: 'Pagamentos | Jeniffer Pires',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <BillingPage />;
}
