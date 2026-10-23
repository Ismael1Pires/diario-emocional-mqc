export type AccountProfile = { name: string; avatar: string | null };
export const MAX_AVATAR_LENGTH = 60000;

export function validAvatar(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > MAX_AVATAR_LENGTH) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const bytes = atob(match[2]);
    if (bytes.length < 12) return false;
    if (match[1] === 'jpeg') return bytes.startsWith('\xff\xd8\xff') && bytes.endsWith('\xff\xd9');
    if (match[1] === 'png') return bytes.startsWith('\x89PNG\r\n\x1a\n');
    return bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  } catch { return false; }
}
