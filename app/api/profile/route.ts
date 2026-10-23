import { env } from 'cloudflare:workers';
import { NextRequest } from 'next/server';
import { readJson, text, HttpError, json } from '../auth/core';
import { guarded, requireDiaryUser } from '../auth/server';
import { validAvatar } from '@/app/profile-data';

// Additive and idempotent initialization also supports existing installations
// whose deployment does not automatically run D1 migrations.
async function ensureProfiles() {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS user_profiles (user_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_users(id), avatar TEXT, updated_at INTEGER NOT NULL)').run();
}

export async function GET(request: NextRequest) {
  return guarded(async () => {
    const user = await requireDiaryUser(request);
    await ensureProfiles();
    const row = await env.DB.prepare('SELECT avatar FROM user_profiles WHERE user_id = ?').bind(user.id).first<{ avatar: string | null }>();
    return json({ profile: { name: user.name, avatar: row?.avatar ?? null } });
  });
}

export async function PUT(request: NextRequest) {
  return guarded(async () => {
    const user = await requireDiaryUser(request);
    const body = await readJson(request);
    const name = text(body.name, 100);
    if (!name) throw new HttpError(400, 'Escreva seu nome.');
    if (!validAvatar(body.avatar)) throw new HttpError(400, 'Escolha uma foto JPG, PNG ou WebP válida.');
    await ensureProfiles();
    await env.DB.batch([
      env.DB.prepare('UPDATE auth_users SET name = ? WHERE id = ?').bind(name, user.id),
      env.DB.prepare('INSERT INTO user_profiles (user_id, avatar, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET avatar = excluded.avatar, updated_at = excluded.updated_at').bind(user.id, body.avatar, Math.floor(Date.now() / 1000)),
    ]);
    return json({ profile: { name, avatar: body.avatar } });
  });
}
