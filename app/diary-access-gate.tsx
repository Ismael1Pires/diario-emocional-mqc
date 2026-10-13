'use client';
/* oxlint-disable nextjs/no-img-element */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BookHeart, Check, Loader2, LockKeyhole } from 'lucide-react';
import { type User } from './auth-gate';
import { apiFetch } from './client-api';
import { DIARY_OFFER_KEY, formatMoney, offerPeriod, type Offer } from './billing-display';
import './diary-access.css';

type DiaryAccess = { allowed: boolean; testMode: boolean; reason?: string };

export default function DiaryAccessGate({ user, logout, children }: {
  user: User;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [access, setAccess] = useState<DiaryAccess | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadVersion = useRef(0);

  const loadAccess = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setAccess(null);
    setOffer(null);
    setError('');
    try {
      const response = await apiFetch('/api/billing/access');
      if (!response.ok) throw new Error('Não foi possível verificar seu acesso. Tente novamente em instantes.');
      const result = await response.json() as DiaryAccess;
      if (version !== loadVersion.current) return;
      if (typeof result.allowed !== 'boolean' || typeof result.testMode !== 'boolean')
        throw new Error('Não foi possível verificar seu acesso. Tente novamente em instantes.');
      setAccess(result);
      if (!result.allowed) {
        setOffer(null);
        const catalogResponse = await apiFetch('/api/billing/catalog');
        if (!catalogResponse.ok)
          throw new Error('O pagamento está temporariamente indisponível. Tente novamente em instantes.');
        const catalog = await catalogResponse.json() as { offers: Offer[] };
        if (version !== loadVersion.current) return;
        setOffer(catalog.offers.find((item) => item.key === DIARY_OFFER_KEY) ?? null);
      }
    } catch (e) {
      if (version === loadVersion.current)
        setError(e instanceof Error ? e.message : 'Não foi possível verificar seu acesso.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void loadAccess(); });
    const paymentRequired = () => {
      setAccess(null);
      void loadAccess();
    };
    window.addEventListener('diary-payment-required', paymentRequired);
    return () => window.removeEventListener('diary-payment-required', paymentRequired);
  }, [loadAccess]);

  if (loading) return <output className="registration-loading"><Loader2 className="spin" /> Verificando seu acesso…</output>;
  if (access?.allowed) return children;

  return (
    <main className="registration-shell diary-access-shell">
      <section className="registration-brand-panel">
        <img className="registration-logo" src="/brand/jeniffer-logo.png" alt="Jeniffer Pires" />
        <div className="registration-message">
          <div className="eyebrow light">Seu espaço de cuidado</div>
          <h1>Seu Diário<br />Emocional.</h1>
          <p>Um espaço pessoal para acolher o que sente, reconhecer seus gatilhos e observar seus padrões com gentileza.</p>
        </div>
        <div className="registration-person">
          <img src="/brand/jeniffer-pires.jpeg" alt="Jeniffer Pires escrevendo em um diário" />
          <div><strong>Jeniffer Pires</strong><span>Terapeuta cristã & mentoria emocional</span></div>
        </div>
      </section>
      <section className="registration-form-panel">
        <div className="registration-form diary-access-card">
          <div className="registration-icon"><BookHeart size={25} /></div>
          <div className="eyebrow">Olá, {user.name}</div>
          <h2>Libere seu diário</h2>
          <p className="registration-intro">O Diário Emocional é um produto pago. Seu acesso é liberado nesta conta após a confirmação do pagamento.</p>
          <ul className="diary-access-benefits">
            <li><Check size={17} /> Registros emocionais e histórico pessoal</li>
            <li><Check size={17} /> Visualização de emoções, gatilhos e padrões</li>
            <li><Check size={17} /> Reflexões e lembretes para sua rotina</li>
          </ul>
          {access?.testMode && <output className="diary-access-notice">Ambiente de teste. Os pagamentos de teste não movimentam dinheiro real.</output>}
          {offer && <div className="diary-access-price">
            <strong>{formatMoney(offer.amount, offer.currency)}{offer.interval && <small> / {offerPeriod(offer)}</small>}</strong>
            <span>{offer.mode === 'subscription' ? 'Assinatura com renovação automática.' : 'Pagamento único.'}</span>
          </div>}
          {error && <p className="registration-error" role="alert">{error}</p>}
          {!offer && !error && <p className="registration-error" role="alert">O pagamento está temporariamente indisponível. Tente novamente em instantes.</p>}
          {offer && <Link className="wine-btn full diary-access-link" href="/pagamentos"><LockKeyhole size={17} /> Liberar meu acesso</Link>}
          <button type="button" className="outline-btn full" onClick={() => void loadAccess()}>Já paguei · Verificar acesso</button>
          <p className="registration-intro diary-access-email">Use {user.email} para acompanhar seu pagamento e acessar o diário.</p>
          <button type="button" className="diary-access-logout" onClick={() => void logout()}>Sair da conta</button>
        </div>
      </section>
    </main>
  );
}
