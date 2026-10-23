'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookHeart, Download } from 'lucide-react';
import { apiFetch } from './client-api';
import { saveMemory } from './memory-client';
import { filterMemories, memoryThemes as themes, type Memory } from './memory-utils';

const date = (value: number) => new Date(value * 1000).toLocaleString('pt-BR');
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export default function Reflections() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(themes[0]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState('Todas');
  const [retry, setRetry] = useState(0);
  const pendingSave = useRef<{ text: string; id: string } | null>(null);
  const savingNow = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    apiFetch('/api/reflections', { signal: controller.signal })
      .then(async (response) => { const data = await response.json() as { reflections?: Memory[]; error?: string }; if (!response.ok || !data.reflections) throw new Error(data.error || 'Não foi possível carregar suas memórias.'); setMemories(data.reflections); })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar suas memórias. Verifique a conexão e tente novamente.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (savingNow.current || !content.trim()) return;
    savingNow.current = true;
    setSaving(true); setNotice('');
    try {
      const draft = { title, category, content };
      const text = JSON.stringify(draft);
      if (pendingSave.current?.text !== text) pendingSave.current = { text, id: crypto.randomUUID() };
      const saved = await saveMemory({ ...draft, id: pendingSave.current.id });
      setMemories((previous) => [saved, ...previous.filter((memory) => memory.id !== saved.id)]);
      pendingSave.current = null;
      setContent(''); setTitle(''); setFrom(''); setTo(''); setFilter('Todas');
      // A failed initial load must not hide the newly saved memory or older ones.
      setRetry((value) => value + 1);
      setNotice('Memória guardada. Você pode voltar para reler quando quiser.');
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Não foi possível salvar. Tente novamente.'); }
    finally { savingNow.current = false; setSaving(false); }
  }

  const invalidPeriod = !!from && !!to && from > to;
  const visible = invalidPeriod ? [] : filterMemories(memories, filter, from, to);

  function exportPdf() {
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) { setNotice('Permita a abertura da janela para salvar seu PDF.'); return; }
    popup.opener = null;
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Reflexões e memórias — Diário Emocional</title><style>@page{size:A4;margin:18mm}body{font:12pt/1.6 Georgia,serif;color:#24332a}h1{font-size:26pt}article{border-top:1px solid #b89a61;margin-top:24px;padding-top:14px}p{white-space:pre-wrap;overflow-wrap:anywhere}small{font:10pt Arial,sans-serif}button{padding:12px}@media print{button{display:none}}</style></head><body><small>JENIFFER PIRES • DIÁRIO EMOCIONAL</small><h1>Reflexões e memórias</h1><button onclick="window.print()">Salvar como PDF</button>${visible.map((memory) => `<article><small>${escape(date(memory.createdAt))} • ${escape(memory.category)}</small><h2>${escape(memory.title || memory.category)}</h2><p>${escape(memory.content)}</p></article>`).join('')}</body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
    setNotice('Na janela de impressão, escolha Salvar como PDF.');
  }

  return <section className="reflections-space">
    <form className="surface reflection-editor" onSubmit={save} aria-busy={saving}>
      <fieldset className="reflection-fields" disabled={saving}>
      <div className="section-head compact"><div><h2>Como se fosse a primeira vez</h2></div><BookHeart aria-hidden="true" /></div>
      <p className="reflection-prompt">Registre este momento como se fosse a primeira vez. Escreva o que viveu, sentiu, doeu, venceu, aprendeu e agradeça pelo que já conquistou e pelo que ainda vai receber!</p>
      <p className="reflection-prompt">Às vezes esquecemos o quanto já superamos. Voltar a essas memórias nos lembra que fases passam, nós crescemos e Deus continua nos conduzindo.</p>
      <blockquote className="memory-verse">“Quero trazer à memória o que me pode dar esperança.”<cite>Lamentações 3:21.</cite></blockquote>
      <div className="field-grid">
        <label className="field"><span>Título (opcional)</span><input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Uma pequena vitória de hoje…" /></label>
        <label className="field"><span>Tema da memória</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{themes.map((theme) => <option key={theme}>{theme}</option>)}</select></label>
      </div>
      <label className="field reflection-writing"><span>Minha reflexão íntima</span><textarea required maxLength={20000} rows={12} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Hoje eu quero me lembrar de…" /><small>{content.length.toLocaleString('pt-BR')} / 20.000 caracteres</small></label>
      <button className="wine-btn" disabled={saving || !content.trim()}>{saving ? 'Guardando…' : 'Guardar minha memória'}</button>
      {notice && <p role="status">{notice}</p>}
      </fieldset>
    </form>
    <div className="section-head"><div><h2>Memórias para revisitar</h2><p>Releia suas superações e perceba o que se repete.</p></div><button className="outline-btn compact-btn" onClick={exportPdf} disabled={loading || !!error || !visible.length}><Download size={16} /> Exportar PDF</button></div>
    <p>Encontre uma memória pelo tema ou pela data em que foi registrada. Não precisa lembrar o título.</p>
    <div className="field-grid reflection-filters">
      <label className="field"><span>Tema</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{['Todas', ...themes].map((theme) => <option key={theme}>{theme}</option>)}</select></label>
      <label className="field"><span>Data inicial</span><input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="field"><span>Data final</span><input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
      {(filter !== 'Todas' || from || to) && <button className="outline-btn" onClick={() => { setFilter('Todas'); setFrom(''); setTo(''); }}>Limpar filtros</button>}
    </div>
    {invalidPeriod && <p role="alert">A data final deve ser igual ou posterior à data inicial.</p>}
    {loading ? <p role="status">Carregando suas memórias…</p> : error ? <p role="alert">{error} <button className="outline-btn" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></p> : !visible.length ? <p>{memories.length ? 'Nenhuma memória corresponde à busca.' : 'Sua primeira memória começa no espaço acima. Aos poucos, este será um lugar para reconhecer tudo o que você viveu e superou.'}</p> : <div className="timeline">{visible.map((memory) => <article className="surface reflection-memory" key={memory.id}><small>{date(memory.createdAt)} · {memory.category}</small><h3>{memory.title || memory.category}</h3><p>{memory.content}</p></article>)}</div>}
  </section>;
}

