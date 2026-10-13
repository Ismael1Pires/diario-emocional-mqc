import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { reminderSettings } from '@/db/schema';
import { readJson, text, HttpError, json } from '../auth/core';
import { requireDiaryUser } from '../billing/server';
import { guarded } from '../auth/server';

export async function GET(request: NextRequest) {
  return guarded(async () => {
    const user = await requireDiaryUser(request);
    try {
      const [settings] = await getDb()
        .select()
        .from(reminderSettings)
        .where(eq(reminderSettings.userId, user.id))
        .limit(1);
      return json({ settings: settings ?? null });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return json({ error: 'Não foi possível carregar os lembretes.' }, 500);
    }
  });
}

export async function PUT(request: NextRequest) {
  return guarded(async () => {
    const user = await requireDiaryUser(request);
    const visitorId = user.id;
    try {
      const body = await readJson(request);
      const times = body.times;
      if (
        !Array.isArray(times) ||
        times.length < 1 ||
        times.length > 3 ||
        !times.every(
          (value) =>
            typeof value === 'string' &&
            /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
        )
      )
        throw new HttpError(400, 'Escolha de um a três horários válidos.');

      const values = {
        id: visitorId,
        userId: user.id,
        name: text(body.name, 100),
        email: text(body.email, 180),
        phone: text(body.phone, 40),
        times: JSON.stringify(times),
        updatedAt: new Date(),
      };
      const { id: _id, ...updates } = values;
      await getDb().insert(reminderSettings).values(values).onConflictDoUpdate({
        target: reminderSettings.userId,
        set: updates,
      });
      return json({ settings: values });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return json({ error: 'Não foi possível salvar os lembretes.' }, 500);
    }
  });
}
