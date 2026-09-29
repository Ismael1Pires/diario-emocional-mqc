import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { reminderSettings } from '@/db/schema';
import { missingVisitorResponse, readVisitorId } from '../visitor';

export async function GET(request: NextRequest) {
  const visitorId = readVisitorId(request);
  if (!visitorId) return missingVisitorResponse();
  try {
    const [settings] = await getDb().select().from(reminderSettings).where(eq(reminderSettings.id, visitorId)).limit(1);
    return Response.json({ settings: settings ?? null });
  } catch (error) {
    console.error('Could not load settings', error);
    return Response.json({ error: 'Não foi possível carregar os lembretes.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const visitorId = readVisitorId(request);
  if (!visitorId) return missingVisitorResponse();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const times = Array.isArray(body.times)
      ? body.times.map(String).filter((value) => /^([01]\\d|2[0-3]):[0-5]\\d$/.test(value)).slice(0, 3)
      : [];
    if (!times.length) return Response.json({ error: 'Escolha ao menos um horário.' }, { status: 400 });

    const values = {
      id: visitorId,
      name: String(body.name ?? '').slice(0, 100),
      email: String(body.email ?? '').slice(0, 180),
      phone: String(body.phone ?? '').slice(0, 40),
      times: JSON.stringify(times),
      updatedAt: new Date(),
    };
    await getDb().insert(reminderSettings).values(values).onConflictDoUpdate({
      target: reminderSettings.id,
      set: values,
    });
    return Response.json({ settings: values });
  } catch (error) {
    console.error('Could not save settings', error);
    return Response.json({ error: 'Não foi possível salvar os lembretes.' }, { status: 500 });
  }
}
