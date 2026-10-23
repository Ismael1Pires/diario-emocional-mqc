import { env } from 'cloudflare:workers';
import { NextRequest } from 'next/server';
import { readJson, HttpError, json } from '../auth/core';
import { guarded, requireDiaryUser } from '../auth/server';
import { memoryThemes, type Memory } from '@/app/memory-utils';

export async function GET(request: NextRequest) {
  return guarded(async () => {
    const user = await requireDiaryUser(request);
    const visitor = user.id;
    try {
      const result = await env.DB.prepare(
        'SELECT id, created_at AS createdAt, title, category, content FROM reflections WHERE user_id = ? ORDER BY created_at DESC',
      )
        .bind(visitor)
        .all();
      return json({ reflections: result.results });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return json(
        { error: 'Não foi possível carregar suas memórias. Tente novamente.' },
        500,
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return guarded(async () => {
    const user = await requireDiaryUser(request);
    const visitor = user.id;
    try {
      const body = await readJson(request);
      if (
        typeof body.content !== 'string' ||
        !body.content.trim() ||
        body.content.length > 20000 ||
        typeof body.title !== 'string' ||
        body.title.length > 120 ||
        !memoryThemes.includes(String(body.category)) ||
        (body.id !== undefined && (typeof body.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.id)))
      ) {
        return json(
          {
            error:
              'Escreva sua reflexão (até 20.000 caracteres) e escolha um tema.',
          },
          400,
        );
      }
      const reflection = {
        id: typeof body.id === 'string' ? body.id : crypto.randomUUID(),
        createdAt: Math.floor(Date.now() / 1000),
        title: body.title.trim(),
        category: String(body.category),
        content: body.content.trim(),
      };
      await env.DB.prepare(
        'INSERT INTO reflections (id, visitor_id, user_id, created_at, title, category, content) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
      )
        .bind(
          reflection.id,
          visitor,
          user.id,
          reflection.createdAt,
          reflection.title,
          reflection.category,
          reflection.content,
        )
        .run();
      const saved = await env.DB.prepare(
        'SELECT id, created_at AS createdAt, title, category, content FROM reflections WHERE id = ? AND user_id = ?',
      ).bind(reflection.id, user.id).first<Memory>();
      if (!saved || saved.title !== reflection.title || saved.category !== reflection.category || saved.content !== reflection.content)
        return json({ error: 'Não foi possível confirmar esta memória. Tente novamente com um novo registro.' }, 409);
      return json({ reflection: saved }, 201);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return json(
        {
          error:
            'Não foi possível salvar. Seu texto continua aqui para tentar novamente.',
        },
        500,
      );
    }
  });
}
