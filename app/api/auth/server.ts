import { env } from 'cloudflare:workers';
import { failure, type AuthEnv } from './core';
export const authEnv = () => env as unknown as AuthEnv;
export async function guarded(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    return failure(error);
  }
}
export async function sendCode(email: string, code: string) {
  const config = authEnv();
  if (!config.RESEND_API_KEY || !config.AUTH_EMAIL_FROM)
    throw new Error('Email unavailable');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.AUTH_EMAIL_FROM,
      to: [email],
      subject: 'Seu código de acesso — Meu Diário Emocional',
      text: `Seu código é ${code}. Ele expira em 10 minutos e só funciona no navegador que o solicitou. Não compartilhe este código. Se você não solicitou, ignore este e-mail.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Email unavailable');
}
