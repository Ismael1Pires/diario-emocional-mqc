import { NextRequest } from 'next/server';
import {
  readJson,
  text,
  limit,
  HttpError,
  json,
} from '../auth/core';
import { authEnv, guarded, requireDiaryUser } from '../auth/server';
import { getDb } from '@/db';
import { leads } from '@/db/schema';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  return guarded(async () => {
    const user = await requireDiaryUser(request);
    await limit(authEnv(), 'lead-user', user.id, 3, 86400);
    try {
      const body = await readJson(request);
      const name = text(body.name, 100);
      const whatsapp = text(body.whatsapp, 30).replace(/\D/g, '').slice(0, 13);
      const email = text(body.email, 180).toLowerCase();
      const consent = body.consent === true;

      if (name.length < 2) return json({ error: 'Informe seu nome.' }, 400);
      if (whatsapp.length < 10 || whatsapp.length > 13)
        return json({ error: 'Informe um WhatsApp válido com DDD.' }, 400);
      if (email && !EMAIL_PATTERN.test(email))
        return json(
          { error: 'Informe um e-mail válido ou deixe o campo em branco.' },
          400,
        );
      if (!consent)
        return json(
          { error: 'Confirme o aceite para receber os lembretes.' },
          400,
        );

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
      return json({ lead }, 201);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return json(
        {
          error:
            'Não foi possível concluir seu cadastro agora. Tente novamente.',
        },
        500,
      );
    }
  });
}
