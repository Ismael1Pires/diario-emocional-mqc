'use client';

import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { Camera, Check, Loader2, UserRound } from 'lucide-react';
import { apiFetch } from './client-api';
import { MAX_AVATAR_LENGTH, type AccountProfile } from './profile-data';

async function preparePhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha uma foto JPG, PNG ou WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Escolha uma foto de até 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context || !image.naturalWidth || !image.naturalHeight) throw new Error();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = '#fffdf9';
    context.fillRect(0, 0, 256, 256);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    const photo = canvas.toDataURL('image/jpeg', .82);
    if (photo.length > MAX_AVATAR_LENGTH) throw new Error('Não foi possível preparar esta foto. Escolha outra imagem.');
    return photo;
  } finally { URL.revokeObjectURL(url); }
}

export default function UserProfile({ initialName, onChange }: { initialName: string; onChange: (profile: AccountProfile) => void }) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void apiFetch('/api/profile', { signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { profile?: AccountProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error();
      if (controller.signal.aborted) return;
      setName(data.profile.name); setAvatar(data.profile.avatar); setLoaded(true); onChange(data.profile);
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar seu perfil. Tente novamente.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [onChange, retry]);

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProcessing(true); setError(''); setNotice('');
    try { setAvatar(await preparePhoto(file)); }
    catch (reason) { setError(reason instanceof Error && reason.message ? reason.message : 'Não foi possível abrir esta foto. Escolha outra imagem.'); }
    finally { setProcessing(false); if (photoInput.current) photoInput.current.value = ''; }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || processing || !loaded) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify({ name, avatar }) });
      const data = await response.json() as { profile?: AccountProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || 'Não foi possível salvar seu perfil.');
      setName(data.profile.name); onChange(data.profile); setNotice('Seu perfil foi atualizado.');
    } catch (reason) { setError(reason instanceof TypeError ? 'A conexão foi interrompida. Tente salvar novamente.' : reason instanceof Error ? reason.message : 'Não foi possível salvar seu perfil.'); }
    finally { setSaving(false); }
  }

  return <section className="profile-space" aria-labelledby="profile-title">
    <div className="section-head"><div><h2 id="profile-title">Seu perfil</h2><p>Deixe seu espaço com o seu nome e a sua foto.</p></div></div>
    <form className="surface profile-form" onSubmit={save} aria-busy={loading || saving || processing}>
      {loading && <p role="status">Carregando seu perfil…</p>}
      <fieldset disabled={loading || !loaded || saving || processing}>
        <div className="profile-photo-editor">
          <div className="profile-photo-preview">{avatar ? <img src={avatar} alt="Prévia da sua foto de perfil" /> : <UserRound size={48} aria-hidden="true" />}</div>
          <div><label className="outline-btn profile-upload"><Camera size={17} /> {processing ? 'Preparando foto…' : 'Escolher foto'}<input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectPhoto(event)} aria-label="Enviar sua foto de perfil" /></label>
          <p className="muted small">JPG, PNG ou WebP · até 10 MB</p>
          {avatar && <button type="button" className="text-link" onClick={() => { setAvatar(null); setNotice(''); }}>Remover foto</button>}</div>
        </div>
        <label className="field"><span>Seu nome</span><input required maxLength={100} autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); setNotice(''); }} placeholder="Como você quer ser chamada?" /></label>
        <p className="muted small">Sua foto aparece no canto superior direito do seu diário. Clique em salvar para confirmar as mudanças.</p>
        <button className="wine-btn" disabled={!name.trim()}>{saving ? <Loader2 className="spin" size={17} /> : <Check size={17} />} {saving ? 'Salvando…' : 'Salvar meu perfil'}</button>
      </fieldset>
      {error && <p role="alert">{error} {!loaded && !loading && <button type="button" className="outline-btn" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>}</p>}
      {notice && <p role="status">{notice}</p>}
    </form>
  </section>;
}
