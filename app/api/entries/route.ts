import { and, desc, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { emotionalEntries } from '@/db/schema';
import { validEmotions } from '@/app/emotions';
import { requireUser, readJson, text, HttpError, json } from '../auth/core';
import { authEnv, guarded } from '../auth/server';

export async function GET(request: NextRequest) {
  return guarded(async () => {
    const user = await requireUser(request, authEnv());
    try {
      const entries = await getDb()
        .select()
        .from(emotionalEntries)
        .where(eq(emotionalEntries.userId, user.id))
        .orderBy(desc(emotionalEntries.occurredAt))
        .limit(250);
      return json({ entries });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return json({ error: 'Não foi possível carregar seus registros.' }, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return guarded(async () => {
    const user = await requireUser(request, authEnv());
    const visitorId = user.id;
    try {
      const body = await readJson(request);
      const emotion = text(body.emotion, 60).toLowerCase();
      const intensity = body.intensity as number;
      if (
        !validEmotions.includes(emotion) ||
        !Number.isInteger(intensity) ||
        intensity < 1 ||
        intensity > 10
      ) {
        return json({ error: 'Emoção ou intensidade inválida.' }, 400);
      }

      const occurredAt =
        body.occurredAt === undefined
          ? new Date()
          : new Date(text(body.occurredAt, 40));
      if (
        !Number.isFinite(occurredAt.getTime()) ||
        occurredAt.getUTCFullYear() < 1900 ||
        occurredAt.getTime() > Date.now() + 86400000
      )
        throw new HttpError(400, 'Data inválida.');
      const entry = {
        id: crypto.randomUUID(),
        visitorId,
        userId: user.id,
        occurredAt: occurredAt,
        createdAt: new Date(),
        emotion,
        intensity,
        trigger: text(body.trigger, 120),
        event: text(body.event, 1600),
        thought: text(body.thought, 1000),
        bodySensation: text(body.bodySensation, 700),
        reaction: text(body.reaction, 1000),
        pattern: text(body.pattern, 120),
        need: text(body.need, 1000),
      };
      await getDb().insert(emotionalEntries).values(entry);
      return json({ entry }, 201);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return json(
        { error: 'Não foi possível salvar agora. Tente novamente.' },
        500,
      );
    }
  });
}

export async function DELETE(request: NextRequest) {
  return guarded(async () => {
    const user = await requireUser(request, authEnv());
    const id = request.nextUrl.searchParams.get('id');
    if (!id || !/^[a-f0-9-]{36}$/.test(id))
      return json({ error: 'Registro não informado.' }, 400);
    try {
      await getDb()
        .delete(emotionalEntries)
        .where(
          and(
            eq(emotionalEntries.id, id),
            eq(emotionalEntries.userId, user.id),
          ),
        );
      return json({ deleted: id });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return json({ error: 'Não foi possível excluir o registro.' }, 500);
    }
  });
}
