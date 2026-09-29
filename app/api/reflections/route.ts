import { env } from 'cloudflare:workers';
import { NextRequest } from 'next/server';
import { missingVisitorResponse, readVisitorId } from '../visitor';

export async function GET(request: NextRequest) {
  const visitor = readVisitorId(request);
  if (!visitor) return missingVisitorResponse();
  try {
    const result = await env.DB.prepare('SELECT id, created_at AS createdAt, title, category, content FROM reflections WHERE visitor_id = ? ORDER BY created_at DESC').bind(visitor).all();
    return Response.json({ reflections: result.results });
  } catch {
    return Response.json({ error: 'Não foi possível carregar suas memórias. Tente novamente.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const visitor = readVisitorId(request);
  if (!visitor) return missingVisitorResponse();
  try {
    const body = await request.json() as Record<string, unknown>;
    const categories = ['Reflexão livre', 'Celebrações e conquistas', 'Superações', 'Dificuldades', 'Padrões que se repetem'];
    if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > 20000 || typeof body.title !== 'string' || body.title.length > 120 || !categories.includes(String(body.category))) {
      return Response.json({ error: 'Escreva sua reflexão (até 20.000 caracteres) e escolha um tema.' }, { status: 400 });
    }
    const reflection = { id: crypto.randomUUID(), createdAt: Math.floor(Date.now() / 1000), title: body.title.trim(), category: String(body.category), content: body.content.trim() };
    await env.DB.prepare('INSERT INTO reflections (id, visitor_id, created_at, title, category, content) VALUES (?, ?, ?, ?, ?, ?)').bind(reflection.id, visitor, reflection.createdAt, reflection.title, reflection.category, reflection.content).run();
    return Response.json({ reflection }, { status: 201 });
  } catch {
    return Response.json({ error: 'Não foi possível salvar. Seu texto continua aqui para tentar novamente.' }, { status: 500 });
  }
}
