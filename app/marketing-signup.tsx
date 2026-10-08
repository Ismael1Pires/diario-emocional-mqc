'use client';
import { useState, type SyntheticEvent } from 'react';
import { apiFetch } from './client-api';
export default function MarketingSignup() {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({ name, whatsapp, email, consent }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setMessage('Cadastro recebido com carinho.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível cadastrar agora.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="surface reminder-form" onSubmit={submit}>
      <h2>Conteúdos e lembretes da Jeniffer</h2>
      <p>Cadastro opcional, independente do acesso ao diário.</p>
      <label className="field">
        <span>Nome</span>
        <input
          required
          maxLength={100}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        <span>WhatsApp com DDD</span>
        <input
          required
          maxLength={20}
          type="tel"
          autoComplete="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
      </label>
      <label className="field">
        <span>E-mail (opcional)</span>
        <input
          type="email"
          maxLength={180}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="consent-field">
        <input
          required
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          Aceito receber lembretes e conteúdos da Jeniffer pelo WhatsApp e, se
          informado, por e-mail.
        </span>
      </label>
      <button className="wine-btn" disabled={busy}>
        Receber conteúdos
      </button>
      {message && <output>{message}</output>}
    </form>
  );
}
