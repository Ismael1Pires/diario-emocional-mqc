import { and, desc, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { emotionalEntries } from '@/db/schema';
import { missingVisitorResponse, readVisitorId } from '../visitor';

const validEmotions = ['alegria', 'calma', 'raiva', 'angústia', 'ansiedade', 'tristeza', 'medo'];

export async function GET(request: NextRequest) {
  const visitorId = readVisitorId(request);
  if (!visitorId) return missingVisitorResponse();
  try {
    const entries = await getDb().select().from(emotionalEntries).where(eq(emotionalEntries.visitorId, visitorId)).orderBy(desc(emotionalEntries.occurredAt)).limit(250);
    return Response.json({ entries });
  } catch (error) {
    console.error('Could not load entries', error);
    return Response.json({ error: 'Não foi possível carregar seus registros.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const visitorId = readVisitorId(request);
  if (!visitorId) return missingVisitorResponse();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const emotion = String(body.emotion ?? '').toLowerCase();
    const intensity = Number(body.intensity);
    if (!validEmotions.includes(emotion) || !Number.isInteger(intensity) || intensity < 1 || intensity > 10) {
      return Response.json({ error: 'Emoção ou intensidade inválida.' }, { status: 400 });
    }

    const entry = {
      id: crypto.randomUUID(),
      visitorId,
      occurredAt: body.occurredAt ? new Date(String(body.occurredAt)) : new Date(),
      createdAt: new Date(),
      emotion,
      intensity,
      trigger: String(body.trigger ?? '').slice(0, 120),
      event: String(body.event ?? '').slice(0, 1600),
      thought: String(body.thought ?? '').slice(0, 1000),
      bodySensation: String(body.bodySensation ?? '').slice(0, 700),
      reaction: String(body.reaction ?? '').slice(0, 1000),
      pattern: String(body.pattern ?? '').slice(0, 120),
      need: String(body.need ?? '').slice(0, 1000),
    };
    await getDb().insert(emotionalEntries).values(entry);
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('Could not save entry', error);
    return Response.json({ error: 'Não foi possível salvar agora. Tente novamente.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const visitorId = readVisitorId(request);
  if (!visitorId) return missingVisitorResponse();
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'Registro não informado.' }, { status: 400 });
  try {
    await getDb().delete(emotionalEntries).where(and(eq(emotionalEntries.id, id), eq(emotionalEntries.visitorId, visitorId)));
    return Response.json({ deleted: id });
  } catch (error) {
    console.error('Could not delete entry', error);
    return Response.json({ error: 'Não foi possível excluir o registro.' }, { status: 500 });
  }
}
