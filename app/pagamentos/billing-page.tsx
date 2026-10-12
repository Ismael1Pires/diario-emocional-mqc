'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AuthGate, { type User } from '../auth-gate';
import { apiFetch } from '../client-api';
import './billing.css';

type Offer = {
  key: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  mode: 'payment' | 'subscription';
};
type BillingStatus = {
  customer: boolean;
  orders: { id: string; offerKey: string; status: string; amount: number | null; currency: string | null }[];
  subscriptions: { id: string; status: string }[];
  testMode: boolean;
};
const money = (amount: number | null, currency: string | null) => {
  if (amount === null || !currency) return 'Valor em confirmação';
  const code = currency.toLowerCase();
  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency,
    ...(['huf', 'twd'].includes(code) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}),
  });
  // ISK/UGX retain two-decimal API amounts; HUF/TWD charges also use cents.
  const decimals = ['isk', 'ugx', 'huf', 'twd'].includes(code)
    ? 2 : (formatter.resolvedOptions().maximumFractionDigits ?? 2);
  return formatter.format(amount / 10 ** decimals);
};
const statusNames: Record<string, string> = {
  paid: 'Pagamento confirmado', pending: 'Aguardando pagamento', unpaid: 'Aguardando pagamento',
  failed: 'Pagamento não concluído', refunded: 'Reembolsado', active: 'Ativa',
  trialing: 'Em período de teste', past_due: 'Pagamento pendente', canceled: 'Cancelada',
  incomplete: 'Aguardando confirmação', incomplete_expired: 'Não concluída', paused: 'Pausada',
  no_payment_required: 'Sem valor a pagar', expired: 'Checkout expirado',
};

function AccountPayments({ user, logout }: { user: User; logout: () => Promise<void> }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [returned, setReturned] = useState(false);
  const attempts = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalogResponse, statusResponse] = await Promise.all([
        apiFetch('/api/billing/catalog'), apiFetch('/api/billing/status'),
      ]);
      if (!catalogResponse.ok || !statusResponse.ok)
        throw new Error('Os pagamentos estão temporariamente indisponíveis. Tente mais tarde.');
      const catalog = await catalogResponse.json() as { offers: Offer[] };
      setOffers(catalog.offers);
      setStatus(await statusResponse.json() as BillingStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os pagamentos.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setReturned(new URLSearchParams(window.location.search).get('checkout') === 'retorno');
      void load();
    });
  }, [load]);

  async function redirect(kind: 'checkout' | 'portal', offerKey?: string) {
    if (busy) return;
    setBusy(offerKey || 'portal');
    setError('');
    try {
      if (offerKey && !attempts.current.has(offerKey)) attempts.current.set(offerKey, crypto.randomUUID());
      const response = await apiFetch(`/api/billing/${kind}`, {
        method: 'POST',
        ...(offerKey ? { body: JSON.stringify({ offerKey, requestId: attempts.current.get(offerKey) }) } : {}),
      });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        if (response.status === 409 && offerKey) attempts.current.delete(offerKey);
        throw new Error(data.error || 'Não foi possível abrir o pagamento.');
      }
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname))
        throw new Error('Não foi possível abrir o pagamento. Tente mais tarde.');
      window.location.assign(url.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o pagamento.');
      setBusy('');
    }
  }

  return (
    <main className="billing-shell">
      <header className="billing-header">
        <Link href="/">← Voltar ao Diário</Link>
        <button type="button" onClick={() => void logout()} disabled={!!busy}>Sair</button>
      </header>
      <section className="billing-intro">
        <p className="billing-eyebrow">Jeniffer Pires</p>
        <h1>Seus pagamentos</h1>
        <p>Olá, {user.name}. Acompanhe suas compras e gerencie suas assinaturas.</p>
        <p className="billing-note">O Diário Emocional continua gratuito.</p>
      </section>
      {status?.testMode && <output className="billing-notice">Ambiente de teste. Estes pagamentos não movimentam dinheiro real.</output>}
      {returned && <output className="billing-notice">Confira a confirmação do pagamento no histórico abaixo. Se ela ainda não aparecer, atualize o status em instantes.</output>}
      {error && <p className="billing-error" role="alert">{error}</p>}
      {loading ? <output>Carregando seus pagamentos…</output> : (
        <>
          <section className="billing-offers" aria-label="Ofertas disponíveis">
            {offers.map((offer) => {
              const periods: Record<string, string> = { day: 'dia', week: 'semana', month: 'mês', year: 'ano' };
              const plurals: Record<string, string> = { day: 'dias', week: 'semanas', month: 'meses', year: 'anos' };
              const period = offer.interval ? periods[offer.interval] || offer.interval : '';
              return (
                <article className="billing-card" key={offer.key}>
                  <h2>{offer.name}</h2>
                  {offer.description && <p>{offer.description}</p>}
                  <p className="billing-price">{money(offer.amount, offer.currency)}
                    {period && <small> / {(offer.intervalCount ?? 1) > 1 ? `${offer.intervalCount} ${plurals[offer.interval!] || period}` : period}</small>}
                  </p>
                  <p>{offer.mode === 'subscription' ? 'Assinatura com renovação automática.' : 'Pagamento único.'}</p>
                  <button type="button" disabled={!!busy} onClick={() => void redirect('checkout', offer.key)}>
                    {busy === offer.key ? 'Abrindo…' : offer.mode === 'subscription' ? 'Assinar' : 'Continuar para pagamento'}
                  </button>
                </article>
              );
            })}
            {!offers.length && !error && <p>Não há ofertas disponíveis para pagamento neste momento.</p>}
          </section>
          {status && <section className="billing-card billing-history">
            <h2>Minha conta</h2>
            {status.orders.length === 0 && status.subscriptions.length === 0 && <p>Você ainda não tem compras ou assinaturas.</p>}
            {status.orders.map((order) => <p key={order.id}>{statusNames[order.status] || 'Em processamento'} · {money(order.amount, order.currency)}</p>)}
            {status.subscriptions.map((subscription) => <p key={subscription.id}>Assinatura · {statusNames[subscription.status] || 'Em processamento'}</p>)}
            {status.customer && <button type="button" disabled={!!busy} onClick={() => void redirect('portal')}>Gerenciar pagamentos e assinaturas</button>}
          </section>}
        </>
      )}
      <button className="billing-refresh" type="button" disabled={loading || !!busy} onClick={() => void load()}>Atualizar status</button>
    </main>
  );
}

export default function BillingPage() {
  return <AuthGate>{(user, logout) => <AccountPayments user={user} logout={logout} />}</AuthGate>;
}
