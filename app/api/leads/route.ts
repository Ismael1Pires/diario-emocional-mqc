import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { leads } from '@/db/schema';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? '').trim().slice(0, 100);
    const whatsapp = String(body.whatsapp ?? '').replace(/\D/g, '').slice(0, 13);
    const email = String(body.email ?? '').trim().toLowerCase().slice(0, 180);
    const consent = body.consent === true;

    if (name.length < 2) return Response.json({ error: 'Informe seu nome.' }, { status: 400 });
    if (whatsapp.length < 10 || whatsapp.length > 13) return Response.json({ error: 'Informe um WhatsApp válido com DDD.' }, { status: 400 });
    if (email && !EMAIL_PATTERN.test(email)) return Response.json({ error: 'Informe um e-mail válido ou deixe o campo em branco.' }, { status: 400 });
    if (!consent) return Response.json({ error: 'Confirme o aceite para receber os lembretes.' }, { status: 400 });

    const lead = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      name,
      whatsapp,
      email,
      consent,
      source: 'meu-diario-emocional',
    };
    await getDb().insert(leads).values(lead);
    return Response.json({ lead }, { status: 201 });
  } catch (error) {
    console.error('Could not save lead', error);
    return Response.json({ error: 'Não foi possível concluir seu cadastro agora. Tente novamente.' }, { status: 500 });
  }
}
