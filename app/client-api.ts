export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.method && !['GET', 'HEAD'].includes(init.method)) {
    headers.set('X-Diary-Request', '1');
    if (init.body) headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 401 && !input.startsWith('/api/auth/'))
    window.dispatchEvent(new Event('diary-session-expired'));
  return response;
}

