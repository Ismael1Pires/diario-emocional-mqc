import { env } from 'cloudflare:workers';
import { NextRequest } from 'next/server';
import { readJson, HttpError, json } from '../auth/core';
import { guarded, requireDiaryUser } from '../auth/server';

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
      const categories = [
        'Reflexão livre',
        'Celebrações e conquistas',
        'Superações',
        'Dificuldades',
        'Padrões que se repetem',
      ];
      if (
        typeof body.content !== 'string' ||
        !body.content.trim() ||
        body.content.length > 20000 ||
        typeof body.title !== 'string' ||
        body.title.length > 120 ||
        !categories.includes(String(body.category))
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
        id: crypto.randomUUID(),
        createdAt: Math.floor(Date.now() / 1000),
        title: body.title.trim(),
        category: String(body.category),
        content: body.content.trim(),
      };
      await env.DB.prepare(
        'INSERT INTO reflections (id, visitor_id, user_id, created_at, title, category, content) VALUES (?, ?, ?, ?, ?, ?, ?)',
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
      return json({ reflection }, 201);
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
