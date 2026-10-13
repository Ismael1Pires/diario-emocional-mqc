// Server-only authentication primitives. No dependency on a browser or global env.
export interface AuthEnv {
  DB: D1Database;
  AUTH_ORIGIN: string;
  AUTH_SECRET: string;
  RESEND_API_KEY: string;
  AUTH_EMAIL_FROM: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const SESSION_COOKIE = '__Host-mqc-session';
export const LOGIN_COOKIE = '__Host-mqc-login';
export const SESSION_SECONDS = 7 * 86400;
const now = () => Math.floor(Date.now() / 1000);
export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
export const hash = async (value: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
export async function keyedHash(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  );
}
export function cookie(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
}
export function readCookie(request: Request, name: string) {
  const values = (request.headers.get('cookie') || '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}
export function configured(env: AuthEnv) {
  if (
    !env.AUTH_SECRET ||
    env.AUTH_SECRET.length < 32 ||
    !env.AUTH_ORIGIN ||
    new URL(env.AUTH_ORIGIN).origin !== env.AUTH_ORIGIN ||
    !env.AUTH_ORIGIN.startsWith('https://')
  )
    throw new HttpError(503, 'Acesso seguro temporariamente indisponível.');
}
export function protectMutation(request: Request, env: AuthEnv) {
  configured(env);
  if (
    request.headers.get('origin') !== env.AUTH_ORIGIN ||
    new URL(request.url).origin !== env.AUTH_ORIGIN ||
    request.headers.get('x-diary-request') !== '1' ||
    (request.headers.get('sec-fetch-site') &&
      request.headers.get('sec-fetch-site') !== 'same-origin')
  )
    throw new HttpError(403, 'Origem da solicitação inválida.');
}
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    throw new HttpError(415, 'Envie JSON.');
  // Enforce the actual bytes, including chunked requests; never buffer unbounded bodies.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Dados inválidos.');
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 100000) {
      await reader.cancel();
      throw new HttpError(413, 'Dados muito extensos.');
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  try {
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Dados inválidos.');
  }
}
export function text(value: unknown, max: number, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max)
    throw new HttpError(400, 'Texto inválido ou muito extenso.');
  return value.trim();
}
export async function limit(
  env: AuthEnv,
  scope: string,
  value: string,
  maximum: number,
  seconds: number,
) {
  const key = await keyedHash(env.AUTH_SECRET, `${scope}:${value}`);
  const window = Math.floor(now() / seconds) * seconds;
  const row = await env.DB.prepare(
    'INSERT INTO auth_limits (key, window, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window = excluded.window THEN count + 1 ELSE 1 END, window = excluded.window RETURNING count',
  )
    .bind(key, window)
    .first<{ count: number }>();
  if (!row || row.count > maximum)
    throw new HttpError(
      429,
      'Muitas tentativas. Aguarde antes de tentar novamente.',
    );
}
export async function requireUser(request: Request, env: AuthEnv) {
  configured(env);
  if (!['GET', 'HEAD'].includes(request.method)) protectMutation(request, env);
  const token = readCookie(request, SESSION_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(401, 'Entre com seu e-mail para continuar.');
  const user = await env.DB.prepare(
    'SELECT u.id, u.email, u.name FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  )
    .bind(await hash(token), now())
    .first<{ id: string; email: string; name: string }>();
  if (!user) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
  return user;
}
export function json(value: unknown, status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set('Cache-Control', 'no-store');
  h.set('Vary', 'Cookie');
  h.set('X-Content-Type-Options', 'nosniff');
  return Response.json(value, { status, headers: h });
}
export function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : 'Não foi possível concluir agora. Tente novamente.',
    },
    error instanceof HttpError ? error.status : 500,
  );
}
export async function requestCode(
  request: Request,
  env: AuthEnv,
  send: (email: string, code: string) => Promise<void>,
) {
  protectMutation(request, env);
  await limit(
    env,
    'request-ip',
    request.headers.get('cf-connecting-ip') || 'local',
    20,
    3600,
  );
  const body = await readJson(request);
  const email = text(body.email, 180).toLowerCase();
  const name = text(body.name, 100, 'Você') || 'Você';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new HttpError(400, 'Informe um e-mail válido.');
  await limit(env, 'request-email-minute', email, 1, 60);
  await limit(env, 'request-email-hour', email, 5, 3600);
  await limit(env, 'request-global', 'all', 90, 86400);
  const id = crypto.randomUUID();
  const browser = randomToken();
  // Rejection sampling avoids modulo bias in the 8-digit code.
  let n: number;
  do {
    n = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (n >= 4200000000);
  const code = String(n % 100000000).padStart(8, '0');
  await env.DB.prepare(
    'INSERT INTO auth_challenges (id,email,name,code_hash,browser_hash,expires_at) VALUES (?,?,?,?,?,?)',
  )
    .bind(
      id,
      email,
      name,
      await keyedHash(env.AUTH_SECRET, `${id}:${code}`),
      await hash(browser),
      now() + 600,
    )
    .run();
  try {
    await send(email, code);
  } catch {
    await env.DB.prepare('DELETE FROM auth_challenges WHERE id = ?')
      .bind(id)
      .run();
    throw new HttpError(
      503,
      'Não foi possível enviar o código. Tente mais tarde.',
    );
  }
  return json(
    { challengeId: id, message: 'Enviamos um código válido por 10 minutos.' },
    200,
    { 'Set-Cookie': cookie(LOGIN_COOKIE, browser, 600) },
  );
}
export async function verifyCode(request: Request, env: AuthEnv) {
  protectMutation(request, env);
  await limit(
    env,
    'verify-ip',
    request.headers.get('cf-connecting-ip') || 'local',
    40,
    3600,
  );
  const body = await readJson(request);
  const id = text(body.challengeId, 36);
  const code = text(body.code, 8);
  const browser = readCookie(request, LOGIN_COOKIE);
  if (
    !/^[a-f0-9-]{36}$/.test(id) ||
    !/^\d{8}$/.test(code) ||
    !/^[a-f0-9]{64}$/.test(browser)
  )
    throw new HttpError(400, 'Código inválido ou expirado.');
  const row = await env.DB.prepare(
    'UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ? AND browser_hash = ? AND expires_at > ? AND consumed = 0 AND attempts < 5 RETURNING email, name',
  )
    .bind(id, await hash(browser), now())
    .first<{ email: string; name: string }>();
  if (!row) throw new HttpError(400, 'Código inválido ou expirado.');
  const consumed = await env.DB.prepare(
    'UPDATE auth_challenges SET consumed = 1 WHERE id = ? AND browser_hash = ? AND code_hash = ? AND consumed = 0 AND expires_at > ? RETURNING id',
  )
    .bind(
      id,
      await hash(browser),
      await keyedHash(env.AUTH_SECRET, `${id}:${code}`),
      now(),
    )
    .first();
  if (!consumed) throw new HttpError(400, 'Código inválido ou expirado.');
  const token = randomToken();
  const tokenHash = await hash(token);
  const oldToken = readCookie(request, SESSION_COOKIE);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO auth_users (id,email,name,created_at) VALUES (?,?,?,?) ON CONFLICT(email) DO NOTHING',
    ).bind(`user:${crypto.randomUUID()}`, row.email, row.name, now()),
    env.DB.prepare(
      'INSERT INTO auth_sessions (token_hash,user_id,expires_at) SELECT ?, id, ? FROM auth_users WHERE email = ?',
    ).bind(tokenHash, now() + SESSION_SECONDS, row.email),
    env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(
      await hash(oldToken),
    ),
  ]);
  const headers = new Headers();
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, token, SESSION_SECONDS));
  headers.append('Set-Cookie', cookie(LOGIN_COOKIE, '', 0));
  return json({ authenticated: true }, 200, headers);
}
export async function logout(request: Request, env: AuthEnv) {
  protectMutation(request, env);
  await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?')
    .bind(await hash(readCookie(request, SESSION_COOKIE)))
    .run();
  const headers = new Headers();
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
  headers.append('Set-Cookie', cookie(LOGIN_COOKIE, '', 0));
  return json({ loggedOut: true }, 200, headers);
}
