'use client';
// Exported brand assets retain their existing image behavior.
/* oxlint-disable nextjs/no-img-element */
import {
  useEffect,
  useState,
  type SyntheticEvent,
  type ReactNode,
} from 'react';
import { BookHeart, ChevronRight, Loader2, LockKeyhole } from 'lucide-react';
import { apiFetch } from './client-api';
export type User = { id: string; email: string; name: string };
export default function AuthGate({
  children,
}: {
  children: (user: User, logout: () => Promise<void>) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [legacy, setLegacy] = useState(false);
  async function loadSession() {
    const response = await apiFetch('/api/auth/session');
    if (response.ok) {
      const data = (await response.json()) as { user: User };
      setUser(data.user);
    } else if (response.status !== 401)
      throw new Error(
        'Acesso seguro indisponível. Tente novamente mais tarde.',
      );
  }
  useEffect(() => {
    // Preserve the old local identifier for assisted recovery; never submit it as identity.
    queueMicrotask(() => {
      try {
        setLegacy(!!localStorage.getItem('meu-diario-emocional-lead'));
      } catch {
        /* Storage may be disabled. */
      }
    });
    queueMicrotask(() => {
      void loadSession()
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
    const expired = () => {
      setUser(null);
      setChallengeId('');
      setCode('');
      setError('Sua sessão expirou. Entre novamente.');
    };
    window.addEventListener('diary-session-expired', expired);
    return () => window.removeEventListener('diary-session-expired', expired);
  }, []);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(
        challengeId ? '/api/auth/verify' : '/api/auth/request',
        {
          method: 'POST',
          body: JSON.stringify(
            challengeId ? { challengeId, code } : { email, name },
          ),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        challengeId: string;
      };
      if (!response.ok)
        throw new Error(data.error || 'Não foi possível entrar.');
      if (challengeId) {
        await loadSession();
        setCode('');
        setChallengeId('');
      } else {
        setChallengeId(data.challengeId);
        setCode('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      const response = await apiFetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      setUser(null);
      setChallengeId('');
      setCode('');
      setError('');
    } catch {
      window.alert('Não foi possível encerrar a sessão. Tente novamente.');
    }
  }
  if (loading)
    return (
      <output className="registration-loading">
        <Loader2 className="spin" /> Carregando…
      </output>
    );
  if (user) return children(user, logout);
  return (
    <main className="registration-shell">
      <section className="registration-brand-panel">
        <img
          className="registration-logo"
          src="/brand/jeniffer-logo.png"
          alt="Jeniffer Pires"
        />
        <div className="registration-message">
          <div className="eyebrow light">Seu espaço de cuidado começa aqui</div>
          <h1>
            Bem-vinda ao
            <br />
            Diário Emocional.
          </h1>
          <p>
            Registre o que sente, compreenda seus gatilhos e acompanhe seus
            padrões com mais clareza e gentileza.
          </p>
        </div>
        <div className="registration-person">
          <img
            src="/brand/jeniffer-pires.jpeg"
            alt="Jeniffer Pires escrevendo em um diário"
          />
          <div>
            <strong>Jeniffer Pires</strong>
            <span>Terapeuta cristã & mentoria emocional</span>
          </div>
        </div>
      </section>
      <section className="registration-form-panel">
        <form className="registration-form" onSubmit={submit}>
          <div className="registration-icon">
            <BookHeart size={25} />
          </div>
          <div className="eyebrow">Seu acesso pessoal</div>
          <h2>{challengeId ? 'Confira seu e-mail' : 'Entre no seu diário'}</h2>
          <p className="registration-intro">
            {challengeId
              ? `Enviamos um código para ${email}. Ele vale por 10 minutos. Digite-o neste navegador.`
              : 'Use seu e-mail para criar uma conta ou entrar. Neste momento, o acesso ao Diário Emocional não exige pagamento.'}
          </p>
          {!challengeId ? (
            <>
              <label className="field">
                <span>Seu nome (para uma conta nova)</span>
                <input
                  autoComplete="name"
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>E-mail</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  maxLength={180}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label className="field">
              <span>Código de 8 dígitos</span>
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{8}"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          {error && (
            <div className="registration-error" role="alert">
              {error}
            </div>
          )}
          <button className="wine-btn full registration-submit" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <ChevronRight size={17} />
            )}
            {challengeId ? 'Confirmar código' : 'Receber código por e-mail'}
          </button>
          {challengeId && (
            <button
              type="button"
              className="outline-btn"
              disabled={busy}
              onClick={() => {
                setChallengeId('');
                setCode('');
                setError('');
              }}
            >
              Solicitar outro código
            </button>
          )}
          <p className="registration-privacy">
            <LockKeyhole size={13} /> Sua sessão expira em 7 dias. Use Sair em
            dispositivos compartilhados.
          </p>
          {legacy && (
            <p role="note">
              Há um cadastro antigo neste navegador. Os dados antigos serão
              preservados, mas precisam de verificação de propriedade pela
              responsável pelo diário antes de serem associados à conta. O
              cadastro antigo, sozinho, não comprova essa propriedade.
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

