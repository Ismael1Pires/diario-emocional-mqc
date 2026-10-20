'use client';

import {
  BarChart3,
  Bell,
  BookHeart,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Heart,
  History,
  Home,
  Leaf,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Reflections from './reflections';
import MarketingSignup from './marketing-signup';
import AuthGate, { type User } from './auth-gate';
import { apiFetch } from './client-api';
import { disconnectionDetails, emotionGroup, emotionLabel, emotionMeta, validEmotions } from './emotions';

type View = 'home' | 'new' | 'history' | 'patterns' | 'reminders' | 'reflections';

type Entry = {
  id: string;
  occurredAt: string | Date;
  createdAt: string | Date;
  emotion: string;
  intensity: number;
  trigger: string;
  event: string;
  thought: string;
  bodySensation: string;
  reaction: string;
  pattern: string;
  need: string;
  demo?: boolean;
};

type EntryDraft = Omit<Entry, 'id' | 'createdAt' | 'demo'>;

type ReminderForm = {
  name: string;
  email: string;
  phone: string;
  times: string[];
};

type LeadProfile = {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
};



const JENIFFER_WHATSAPP = 'https://wa.me/5551995713828';
const URGENT_WHATSAPP = 'https://wa.me/5551995455011';

const CONTACT_URL = `${JENIFFER_WHATSAPP}?text=${encodeURIComponent('Olá, Jeniffer. Conheci o Diário Emocional e gostaria de falar com você.')}`;
const URGENT_CONTACT_URL = `${URGENT_WHATSAPP}?text=${encodeURIComponent('Olá, já uso o Diário Emocional e sinto que preciso avançar para o próximo nível com a mentoria. Como funciona?')}`;

const patternInsights: Record<string, string> = {
  'Autocobrança': 'Você pode estar tentando garantir valor e segurança através de exigência excessiva.',
  'Agradar para evitar conflito': 'Talvez exista uma necessidade de pertencimento sendo protegida.',
  'Controle': 'Controlar pode ser uma tentativa de reduzir a incerteza e recuperar segurança.',
  'Silêncio / engolir': 'O silêncio pode estar protegendo você do medo de rejeição ou confronto.',
  'Fuga / adiamento': 'Adiar pode ser uma resposta de proteção diante de algo que parece grande demais.',
  'Ruminação': 'Repassar a cena muitas vezes pode ser uma tentativa de encontrar uma certeza que faltou.',
  'Explosão': 'A explosão pode sinalizar limites acumulados que não conseguiram ser expressos antes.',
};

const triggers = ['Relacionamento', 'Família', 'Trabalho', 'Dinheiro', 'Corpo / saúde', 'Cobrança', 'Rejeição', 'Solidão', 'Outro'];
const patterns = ['Autocobrança', 'Agradar para evitar conflito', 'Controle', 'Silêncio / engolir', 'Fuga / adiamento', 'Ruminação', 'Explosão', 'Outro'];

function daysAgo(days: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

const demoEntries: Entry[] = [
  { id: 'demo-1', occurredAt: daysAgo(0, 9), createdAt: daysAgo(0, 9), emotion: 'calma', intensity: 7, trigger: 'Corpo / saúde', event: 'Comecei o dia respeitando meu ritmo.', thought: 'Eu posso fazer uma coisa de cada vez.', bodySensation: 'Respiração tranquila', reaction: 'Fiz uma pausa', pattern: 'Autocobrança', need: 'Descanso e gentileza', demo: true },
  { id: 'demo-2', occurredAt: daysAgo(1, 15), createdAt: daysAgo(1, 15), emotion: 'ansiedade', intensity: 6, trigger: 'Trabalho', event: 'Recebi uma demanda inesperada.', thought: 'Não vou dar conta de tudo.', bodySensation: 'Peito acelerado', reaction: 'Tentei resolver tudo ao mesmo tempo', pattern: 'Controle', need: 'Clareza e apoio', demo: true },
  { id: 'demo-3', occurredAt: daysAgo(2, 20), createdAt: daysAgo(2, 20), emotion: 'alegria', intensity: 8, trigger: 'Relacionamento', event: 'Tive uma conversa afetuosa.', thought: 'Eu sou amada e posso receber.', bodySensation: 'Leveza', reaction: 'Consegui estar presente', pattern: 'Agradar para evitar conflito', need: 'Conexão', demo: true },
  { id: 'demo-4', occurredAt: daysAgo(4, 12), createdAt: daysAgo(4, 12), emotion: 'angústia', intensity: 5, trigger: 'Família', event: 'Uma fala antiga me tocou.', thought: 'Preciso ficar quieta para não piorar.', bodySensation: 'Nó na garganta', reaction: 'Guardei o que senti', pattern: 'Silêncio / engolir', need: 'Ser ouvida', demo: true },
  { id: 'demo-5', occurredAt: daysAgo(5, 18), createdAt: daysAgo(5, 18), emotion: 'calma', intensity: 6, trigger: 'Corpo / saúde', event: 'Caminhei sem pressa.', thought: 'Meu corpo merece cuidado.', bodySensation: 'Ombros relaxados', reaction: 'Continuei respirando', pattern: 'Autocobrança', need: 'Presença', demo: true },
];

const initialDraft: EntryDraft = {
  occurredAt: new Date(),
  emotion: 'calma',
  intensity: 5,
  trigger: '',
  event: '',
  thought: '',
  bodySensation: '',
  reaction: '',
  pattern: '',
  need: '',
};

function emotionalScore(entry: Entry) {
  const valence: Record<string, number> = { alegria: 1, calma: 0.75, raiva: -0.55, angústia: -0.85, ansiedade: -0.75, tristeza: -0.7, medo: -0.75, desconexão: -0.6 };
  return Math.round(Math.max(0, Math.min(100, 50 + (valence[emotionGroup(entry.emotion)] ?? 0) * entry.intensity * 5)));
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Não informado';
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(value: string | Date, long = false) {
  return new Intl.DateTimeFormat('pt-BR', long
    ? { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default function EmotionalJournal() {
  return <AuthGate>{(user, logout) => <Journal key={user.id} user={user} logout={logout} />}</AuthGate>;
}

function Journal({ user, logout }: { user: User; logout: () => Promise<void> }) {
  const profile: LeadProfile = { ...user, whatsapp: '' };
  const [view, setView] = useState<View>('home');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const draftEmotionGroup = emotionGroup(draft.emotion);
  const [message, setMessage] = useState('');
  const [historyFilter, setHistoryFilter] = useState('todas');
  const [reminders, setReminders] = useState<ReminderForm>({ name: user.name, email: user.email, phone: '', times: ['09:00', '14:00', '20:30'] });
  const [savingReminders, setSavingReminders] = useState(false);
  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [entriesResponse, settingsResponse] = await Promise.all([apiFetch('/api/entries'), apiFetch('/api/settings')]);
      if (entriesResponse.ok) {
        const data = await entriesResponse.json() as { entries: Entry[] };
        setEntries(data.entries ?? []);
      }
      if (settingsResponse.ok) {
        const data = await settingsResponse.json() as { settings: null | { name: string; email: string; phone: string; times: string } };
        if (data.settings) {
          setReminders({
            name: data.settings.name ?? '',
            email: data.settings.email ?? '',
            phone: data.settings.phone ?? '',
            times: JSON.parse(data.settings.times || '[]'),
          });
        }
      }
    } catch {
      setMessage('A conexão demorou um pouco. Seus dados serão carregados ao tentar novamente.');
    } finally {
      setLoaded(true);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) void loadData();
  }, [loadData, profile?.id]);

  const createEntry = useCallback(async (payload: EntryDraft) => {
    if (!profile?.id) throw new Error('Faça seu cadastro para continuar.');
    const response = await apiFetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as { entry?: Entry; error?: string };
    if (!response.ok || !data.entry) throw new Error(data.error ?? 'Não foi possível salvar.');
    setEntries((current) => [data.entry as Entry, ...current]);
    return data.entry;
  }, [profile?.id]);

  useEffect(() => {
    const modelContext = (document as Document & {
      modelContext?: {
        registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
      };
    }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const register = modelContext.registerTool({
      name: 'create_emotional_entry',
      title: 'Registrar emoção',
      description: 'Cria um registro no diário emocional com emoção, intensidade, gatilho e contexto.',
      inputSchema: {
        type: 'object',
        properties: {
          emotion: { type: 'string', enum: validEmotions },
          intensity: { type: 'integer', minimum: 1, maximum: 10 },
          trigger: { type: 'string' },
          event: { type: 'string' },
          thought: { type: 'string' },
          pattern: { type: 'string' },
          need: { type: 'string' },
        },
        required: ['emotion', 'intensity', 'trigger', 'event'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input: unknown) => {
        const value = input as Record<string, unknown>;
        if (!validEmotions.includes(String(value.emotion)) || !Number.isInteger(value.intensity) || Number(value.intensity) < 1 || Number(value.intensity) > 10) {
          throw new Error('Emoção ou intensidade inválida.');
        }
        const entry = await createEntry({
          ...initialDraft,
          occurredAt: new Date(),
          emotion: String(value.emotion),
          intensity: Number(value.intensity),
          trigger: String(value.trigger ?? ''),
          event: String(value.event ?? ''),
          thought: String(value.thought ?? ''),
          pattern: String(value.pattern ?? ''),
          need: String(value.need ?? ''),
        });
        setView('home');
        return { id: entry.id, status: 'saved', emotion: entry.emotion, intensity: entry.intensity };
      },
    }, { signal: lifecycle.signal });
    Promise.resolve(register).catch(() => undefined);
    return () => lifecycle.abort();
  }, [createEntry]);

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const check = () => {
      const now = new Date();
      const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
      if (!reminders.times.includes(time)) return;
      const key = `diario-reminder-${now.toISOString().slice(0, 10)}-${time}`;
      if (localStorage.getItem(key)) return;
      new Notification('Uma pausa para você', { body: 'Como está seu mundo aí dentro? Faça seu check-in emocional.' });
      localStorage.setItem(key, 'sent');
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, [reminders.times]);

  const displayEntries = entries.length ? entries : demoEntries;
  const showingDemo = loaded && entries.length === 0;
  const last7 = useMemo(() => displayEntries.filter((entry) => Date.now() - new Date(entry.occurredAt).getTime() <= 7 * 86400000), [displayEntries]);
  const last30 = useMemo(() => displayEntries.filter((entry) => Date.now() - new Date(entry.occurredAt).getTime() <= 30 * 86400000), [displayEntries]);

  const weeklyScore = useMemo(() => {
    if (!last7.length) return 50;
    return Math.round(last7.reduce((sum, entry) => sum + emotionalScore(entry), 0) / last7.length);
  }, [last7]);

  const emotionCounts = useMemo(() => Object.keys(emotionMeta).map((emotion) => ({
    emotion,
    count: last30.filter((entry) => emotionGroup(entry.emotion) === emotion).length,
  })).sort((a, b) => b.count - a.count), [last30]);

  const weekBars = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = daysAgo(6 - index, 12);
    const dayEntries = displayEntries.filter((entry) => sameDay(new Date(entry.occurredAt), date));
    const score = dayEntries.length ? Math.round(dayEntries.reduce((sum, entry) => sum + emotionalScore(entry), 0) / dayEntries.length) : 0;
    return { label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', ''), score, count: dayEntries.length };
  }), [displayEntries]);

  const patternCounts = useMemo(() => {
    const counts = new Map<string, number>();
    last30.forEach((entry) => { if (entry.pattern) counts.set(entry.pattern, (counts.get(entry.pattern) ?? 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [last30]);

  const triggerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    last30.forEach((entry) => { if (entry.trigger) counts.set(entry.trigger, (counts.get(entry.trigger) ?? 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [last30]);

  const temperatureLabel = weeklyScore >= 72 ? 'Mais leve e regulada' : weeklyScore >= 48 ? 'Buscando equilíbrio' : 'Pedindo mais acolhimento';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await createEntry({ ...draft, occurredAt: new Date() });
      setDraft({ ...initialDraft, occurredAt: new Date() });
      setMessage('Seu registro foi guardado com carinho.');
      setView('home');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar agora.');
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: string) {
    if (!window.confirm('Excluir este registro? Essa ação não pode ser desfeita.')) return;
    if (!profile?.id) return;
    const response = await apiFetch(`/api/entries?id=${encodeURIComponent(id)}`, { method: 'DELETE',  });
    if (response.ok) setEntries((current) => current.filter((entry) => entry.id !== id));
    else setMessage('Não foi possível excluir o registro.');
  }

  async function saveReminderSettings(event: FormEvent) {
    event.preventDefault();
    setSavingReminders(true);
    try {
      if (!profile?.id) throw new Error();
      const response = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reminders),
      });
      if (!response.ok) throw new Error();
      setMessage('Horários salvos. Agora ative no navegador ou adicione à agenda.');
    } catch {
      setMessage('Não foi possível salvar os horários agora.');
    } finally {
      setSavingReminders(false);
    }
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') {
      setMessage('Este navegador não oferece alertas. Use a opção da agenda do celular.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('Lembretes ativados', { body: 'Seu espaço de cuidado estará por perto nos horários escolhidos.' });
      setMessage('Alertas ativados neste dispositivo.');
    } else setMessage('Os alertas não foram liberados. Você ainda pode usar sua agenda.');
  }

  function downloadCalendar() {
    const today = new Date();
    const date = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const events = reminders.times.map((time, index) => {
      const cleanTime = time.replace(':', '') + '00';
      return [
        'BEGIN:VEVENT',
        `UID:diario-emocional-${index}@jenifferpires`,
        `DTSTART:${date}T${cleanTime}`,
        'RRULE:FREQ=DAILY',
        'DURATION:PT5M',
        'SUMMARY:Pausa para meu diário emocional',
        'DESCRIPTION:Como está seu mundo aí dentro? Registre sua emoção e reconheça o que ela precisa.',
        'END:VEVENT',
      ].join('\r\n');
    }).join('\r\n');
    const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jeniffer Pires//Diário Emocional//PT-BR', 'CALSCALE:GREGORIAN', events, 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lembretes-diario-emocional.ics';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Arquivo criado. Abra-o para adicionar os lembretes à agenda do celular.');
  }

  function exportEmotionReport() {
    if (!entries.length) {
      setMessage('Faça seu primeiro registro para gerar um relatório pessoal em PDF.');
      return;
    }

    const reportWindow = window.open('', '_blank', 'width=920,height=760');
    if (!reportWindow) {
      setMessage('Permita a abertura de uma nova janela para exportar o relatório em PDF.');
      return;
    }

    reportWindow.opener = null;
    const counts = (field: 'emotion' | 'trigger' | 'pattern') => {
      const result = new Map<string, number>();
      entries.forEach((entry) => {
        const value = field === 'emotion' ? emotionGroup(entry.emotion) : entry[field];
        if (value) result.set(value, (result.get(value) ?? 0) + 1);
      });
      return [...result.entries()].sort((a, b) => b[1] - a[1]);
    };
    const topEmotion = counts('emotion')[0]?.[0];
    const topTrigger = counts('trigger')[0]?.[0];
    const topPattern = counts('pattern')[0]?.[0];
    const generatedAt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const rows = [...entries]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .map((entry) => `
        <article class="entry">
          <div class="entry-head">
            <div><span>${escapeHtml(formatDate(entry.occurredAt, true))}</span><h2>${escapeHtml(emotionLabel(entry.emotion))}</h2></div>
            <strong>${entry.intensity}/10</strong>
          </div>
          <p>${escapeHtml(entry.event)}</p>
          <div class="tags"><span>Gatilho: ${escapeHtml(entry.trigger || 'não identificado')}</span><span>Padrão: ${escapeHtml(entry.pattern || 'não identificado')}</span></div>
          ${entry.thought ? `<p class="reflection"><b>Pensamento:</b> “${escapeHtml(entry.thought)}”</p>` : ''}
          ${entry.bodySensation ? `<p class="reflection"><b>No corpo:</b> ${escapeHtml(entry.bodySensation)}</p>` : ''}
          ${entry.reaction ? `<p class="reflection"><b>Reação:</b> ${escapeHtml(entry.reaction)}</p>` : ''}
          ${entry.need ? `<p class="reflection"><b>Necessidade:</b> ${escapeHtml(entry.need)}</p>` : ''}
        </article>`).join('');

    reportWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — Diário Emocional</title><style>
      @page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#273027;font-family:Arial,sans-serif;font-size:11pt;line-height:1.5}header{padding-bottom:18px;border-bottom:2px solid #b89a61}h1{margin:5px 0 3px;font:700 27pt Georgia,serif;color:#24332a}.brand{color:#8f6b2f;font-size:9pt;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.meta{margin:0;color:#667064;font-size:9pt}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}.summary div{padding:12px;border:1px solid #ded3c0;border-radius:10px;background:#fffdf8}.summary span{display:block;color:#667064;font-size:7.5pt;text-transform:uppercase}.summary strong{display:block;margin-top:4px;color:#24332a;font-size:11pt}.entry{break-inside:avoid;margin:0 0 12px;padding:15px;border:1px solid #ded3c0;border-radius:12px}.entry-head{display:flex;justify-content:space-between;gap:18px}.entry-head span{color:#667064;font-size:8pt;text-transform:capitalize}.entry-head h2{margin:2px 0 0;font:700 17pt Georgia,serif}.entry-head>strong{color:#24332a}.entry>p{margin:9px 0}.tags{display:flex;flex-wrap:wrap;gap:6px}.tags span{padding:4px 7px;border-radius:99px;background:#f1e7d4;color:#24332a;font-size:8pt}.reflection{margin:7px 0 0!important;padding-left:9px;border-left:2px solid #7c8b73;color:#566056}.disclaimer{margin-top:16px;color:#667064;font-size:8pt}.screen-actions{margin:18px 0;text-align:right}.screen-actions button{border:0;border-radius:99px;padding:10px 18px;background:#24332a;color:white;font-weight:700;cursor:pointer}@media print{.screen-actions{display:none}}
    </style></head><body><header><div class="brand">Jeniffer Pires • Método da Cura</div><h1>Diário Emocional</h1><p class="meta">Relatório pessoal de ${escapeHtml(profile?.name || 'usuária')} • Gerado em ${escapeHtml(generatedAt)}</p></header><div class="screen-actions"><button onclick="window.print()">Salvar como PDF</button></div><section class="summary"><div><span>Registros</span><strong>${entries.length}</strong></div><div><span>Emoção mais presente</span><strong>${escapeHtml(topEmotion ? capitalize(topEmotion) : '—')}</strong></div><div><span>Gatilho recorrente</span><strong>${escapeHtml(topTrigger || '—')}</strong></div><div><span>Padrão recorrente</span><strong>${escapeHtml(topPattern || '—')}</strong></div></section><main>${rows}</main><p class="disclaimer">Este relatório é uma ferramenta de auto-observação e não substitui acompanhamento profissional.</p><script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    reportWindow.document.close();
    setMessage('Relatório preparado. Na janela de impressão, escolha “Salvar como PDF”.');
  }

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const nav = [
    { id: 'home' as View, label: 'Meu momento', short: 'Início', icon: Home },
    { id: 'new' as View, label: 'Novo registro', short: 'Registrar', icon: BookHeart },
    { id: 'reflections' as View, label: 'Como se fosse a primeira vez', short: 'Memórias', icon: BookHeart },
    { id: 'history' as View, label: 'Histórico', short: 'Histórico', icon: History },
    { id: 'patterns' as View, label: 'Meus padrões', short: 'Padrões', icon: BarChart3 },
    { id: 'reminders' as View, label: 'Lembretes', short: 'Lembretes', icon: Bell },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" onClick={() => navigate('home')} aria-label="Ir para o início">
          <img className="brand-logo" src="/brand/jeniffer-logo.png" alt="Jeniffer Pires" />
          <span className="brand-sub">Terapeuta cristã & mentoria emocional</span>
        </button>
        <nav className="side-nav" aria-label="Navegação principal">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
        <button className="outline-btn" onClick={() => void logout()}>Sair da conta</button>
        <div className="privacy-note"><LockKeyhole size={14} /><span>Seu espaço privado de auto-observação.</span></div>
        <p className="side-quote">“Nomear o que sentimos é o primeiro gesto de cuidado.”<span>Biblioteca Método da Cura</span></p>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">Seu espaço de acolhimento</div><h1 className="welcome">{view === 'new' ? 'Vamos dar nome ao que aconteceu.' : view === 'history' ? 'Sua história emocional, com gentileza.' : view === 'patterns' ? 'O que se repete também pode mudar.' : view === 'reminders' ? 'Crie pequenas pausas no seu dia.' : 'Como está seu mundo aí dentro?'}</h1></div>
          <div className="topbar-actions">
            <button className="outline-btn compact-btn" onClick={() => void logout()}>Sair</button>
            <a className="contact-btn compact-btn" href={CONTACT_URL} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Falar com Jeniffer</a>
            <img className="avatar-photo" src="/brand/jeniffer-pires.jpeg" alt="Jeniffer Pires" />
          </div>
        </header>

        {message && <div className="toast-message" role="status"><Check size={17} />{message}<button onClick={() => setMessage('')} aria-label="Fechar aviso">×</button></div>}

        <div hidden={view !== 'reflections'}><Reflections /></div>

        {view === 'home' && (
          <>
            <section className="hero-grid">
              <article className="checkin-card">
                <div className="eyebrow light">Check-in de agora</div>
                <h2>Reserve dois minutos para se escutar.</h2>
                <p>Perceba a emoção, reconheça o que a despertou e transforme o que hoje parece confuso em uma leitura mais clara.</p>
                <button className="primary-btn" onClick={() => navigate('new')}>Registrar como me sinto <ChevronRight size={17} /></button>
              </article>
              <article className="temperature-card">
                <div className="eyebrow">Temperatura emocional</div>
                <div className="temperature-value"><strong>{weeklyScore}</strong><span>/ 100 esta semana</span></div>
                <div className="gauge"><span style={{ width: `${weeklyScore}%` }} /></div>
                <strong className="temperature-label">{temperatureLabel}</strong>
                <p className="muted small">É um termômetro de bem-estar, não uma nota. Um dia difícil não define sua semana.</p>
              </article>
            </section>

            <section className="kit-offer" aria-labelledby="kit-offer-title">
              <div className="kit-offer-copy">
                <div className="kit-offer-label"><Download size={15} aria-hidden="true" /> Oferta por tempo limitado</div>
                <h2 id="kit-offer-title">Kit Raízes &amp; Identidade</h2>
                <p>5 ferramentas para aprofundar reflexões, organizar descobertas e dar continuidade ao cuidado emocional.</p>
                <span className="kit-offer-format">61 páginas · PDFs preenchíveis · digital ou impresso</span>
              </div>
              <div className="kit-offer-action">
                <p className="kit-offer-price">De <del>R$ 97,90</del> por <strong>R$ 27,90</strong><span>pagamento único</span></p>
                <a className="kit-offer-button" href="https://jornada.jenifferpires.life/" target="_blank" rel="noopener noreferrer">Conhecer e baixar as 5 ferramentas <ChevronRight size={17} aria-hidden="true" /></a>
              </div>
            </section>

            <section className="surface therapist-card" aria-label="Contato com Jeniffer Pires">
              <img className="therapist-photo" src="/brand/jeniffer-pires.jpeg" alt="Jeniffer Pires escrevendo em um diário" />
              <div className="therapist-copy">
                <div className="eyebrow">Acolhimento profissional</div>
                <h2>Você não precisa atravessar tudo sozinha.</h2>
                <p>Quando sentir que precisa de uma escuta e um acompanhamento mais profundo, conheça a mentoria profissional da Jeniffer. O primeiro contato é para entender como funciona, os formatos e os valores.</p>
                <small className="contact-caution">Em situação de risco imediato, procure o serviço de emergência da sua região.</small>
              </div>
              <a className="contact-btn" href={CONTACT_URL} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Entrar em contato</a>
            </section>

            {showingDemo && <div className="demo-note"><Sparkles size={16} /><div><strong>Prévia do seu dashboard</strong><span>Estes são exemplos para você visualizar. Ao fazer o primeiro registro, o diário passa a mostrar somente os seus dados.</span></div></div>}

            <section className="dashboard-grid">
              <article className="surface chart-card">
                <div className="section-head compact"><div><h2>Ritmo da semana</h2><p>Seu nível de bem-estar dia a dia.</p></div><span className="period-pill">7 dias</span></div>
                <div className="week-chart" aria-label="Gráfico de bem-estar nos últimos sete dias">
                  {weekBars.map((day) => <div className="day-column" key={day.label}><div className="bar-track"><div className="bar-fill" style={{ height: `${day.count ? Math.max(12, day.score) : 6}%` }} title={day.count ? `${day.score} de 100` : 'Sem registro'} /></div><strong>{day.label}</strong><span>{day.count ? day.score : '—'}</span></div>)}
                </div>
              </article>
              <article className="surface insight-card">
                <div className="insight-icon"><Leaf size={22} /></div>
                <div className="eyebrow">Leitura gentil</div>
                <h2>{emotionCounts[0]?.count ? `${capitalize(emotionCounts[0].emotion)} foi a emoção mais presente.` : 'Seu diário começa no primeiro registro.'}</h2>
                <p>{emotionCounts[0]?.count ? `Ela apareceu ${emotionCounts[0].count} vez(es) nos últimos 30 dias. Observe em quais contextos ela costuma chegar.` : 'Você não precisa entender tudo de uma vez. Só precisa começar pelo que sente agora.'}</p>
                <button className="text-link" onClick={() => navigate('patterns')}>Compreender meus padrões <ChevronRight size={15} /></button>
              </article>
            </section>

            <div className="section-head"><div><h2>Seu diário nos últimos 30 dias</h2><p>As emoções que mais pediram espaço por aqui.</p></div><button className="text-link" onClick={() => navigate('patterns')}>Ver análise completa</button></div>
            <section className="emotion-grid">
              {emotionCounts.slice(0, 4).map(({ emotion, count }) => {
                const meta = emotionMeta[emotion];
                return <article className="emotion-card" key={emotion}><div className="emotion-symbol" style={{ background: meta.soft, color: meta.color }}>{meta.emoji}</div><strong>{capitalize(emotion)}</strong><span>{count} {count === 1 ? 'registro' : 'registros'}</span></article>;
              })}
            </section>
          </>
        )}

        {view === 'new' && (
          <form className="journal-form" onSubmit={handleSubmit}>
            <section className="surface form-section">
              <div className="step-label"><span>1</span> O que você está sentindo?</div>
              <div className="emotion-picker">
                {Object.entries(emotionMeta).map(([emotion, meta]) => (
                  <button type="button" key={emotion} className={`emotion-choice ${draftEmotionGroup === emotion ? 'selected' : ''}`} onClick={() => setDraft({ ...draft, emotion: draftEmotionGroup === emotion ? draft.emotion : emotion })} aria-pressed={draftEmotionGroup === emotion}>
                    <span style={{ background: meta.soft }}>{meta.emoji}</span><strong>{capitalize(emotion)}</strong><small>{meta.phrase}</small>
                  </button>
                ))}
              </div>
              {draftEmotionGroup === 'desconexão' && (
                <fieldset className="emotion-details">
                  <legend>Aprofundando a desconexão</legend>
                  <p>Como ela aparece para você? Se quiser, escolha o detalhe que mais se aproxima do que sente.</p>
                  <div className="emotion-detail-picker">
                    {disconnectionDetails.map((detail) => (
                      <button type="button" key={detail.emotion} className={`emotion-choice ${draft.emotion === detail.emotion ? 'selected' : ''}`} aria-pressed={draft.emotion === detail.emotion} onClick={() => setDraft({ ...draft, emotion: draft.emotion === detail.emotion ? 'desconexão' : detail.emotion })}>
                        <strong>{detail.label}</strong><small>{detail.description}</small>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="text-link" aria-pressed={draft.emotion === 'desconexão'} onClick={() => setDraft({ ...draft, emotion: 'desconexão' })}>Prefiro não especificar</button>
                </fieldset>
              )}
              <div className="intensity-row">
                <div><label htmlFor="intensity">Qual a intensidade?</label><span>1 é suave • 10 é muito intensa</span></div>
                <strong>{draft.intensity}</strong>
              </div>
              <input id="intensity" className="range" type="range" min="1" max="10" value={draft.intensity} onChange={(event) => setDraft({ ...draft, intensity: Number(event.target.value) })} />
            </section>

            <section className="surface form-section">
              <div className="step-label"><span>2</span> Vamos desenhar o que aconteceu</div>
              <div className="field-grid">
                <label className="field"><span>O que aconteceu?</span><textarea required rows={4} value={draft.event} onChange={(event) => setDraft({ ...draft, event: event.target.value })} placeholder={draftEmotionGroup === 'desconexão' ? 'Quando percebeu essa desconexão? De quem, do quê ou de si você se sentiu distante?' : 'Conte a cena com suas palavras, sem precisar organizar tudo…'} /></label>
                <label className="field"><span>Qual foi o gatilho principal?</span><select required value={draft.trigger} onChange={(event) => setDraft({ ...draft, trigger: event.target.value })}><option value="">Selecione</option>{triggers.map((trigger) => <option key={trigger}>{trigger}</option>)}</select></label>
                <label className="field"><span>Que pensamento veio na hora?</span><textarea rows={3} value={draft.thought} onChange={(event) => setDraft({ ...draft, thought: event.target.value })} placeholder={draftEmotionGroup === 'desconexão' ? 'Que pensamentos vieram? Também pode contar se foi difícil perceber algum.' : 'Ex.: eu não vou dar conta, ninguém me escuta…'} /></label>
                <label className="field"><span>Onde isso apareceu no corpo?</span><input value={draft.bodySensation} onChange={(event) => setDraft({ ...draft, bodySensation: event.target.value })} placeholder={draftEmotionGroup === 'desconexão' ? 'Como estava seu corpo? Foi possível notar alguma sensação?' : 'Peito apertado, calor, nó na garganta…'} /></label>
                <label className="field"><span>Como você reagiu?</span><textarea rows={3} value={draft.reaction} onChange={(event) => setDraft({ ...draft, reaction: event.target.value })} placeholder={draftEmotionGroup === 'desconexão' ? 'Você se afastou, ficou no automático ou percebeu outra reação?' : 'O que você fez, disse ou evitou?'} /></label>
              </div>
            </section>

            <section className="surface form-section">
              <div className="step-label"><span>3</span> Transforme a cena em compreensão</div>
              <div className="field-grid two">
                <label className="field"><span>Que padrão você reconhece?</span><select value={draft.pattern} onChange={(event) => setDraft({ ...draft, pattern: event.target.value })}><option value="">Ainda não sei</option>{patterns.map((pattern) => <option key={pattern}>{pattern}</option>)}</select></label>
                <label className="field"><span>Do que você precisava naquele momento?</span><textarea rows={3} value={draft.need} onChange={(event) => setDraft({ ...draft, need: event.target.value })} placeholder={draftEmotionGroup === 'desconexão' ? 'Descanso, espaço, companhia, algo que faça sentido para você…' : 'Acolhimento, segurança, limite, clareza…'} /></label>
              </div>
              <div className="form-footer"><p><Heart size={16} /> Você não precisa se julgar para se compreender.</p><button className="wine-btn" disabled={saving}>{saving ? <><Loader2 className="spin" size={17} /> Salvando…</> : <>Guardar meu registro <ChevronRight size={17} /></>}</button></div>
            </section>
          </form>
        )}

        {view === 'history' && (
          <section className="history-section">
            <div className="history-toolbar">
              <div className="segmented" role="group" aria-label="Filtrar histórico">{['todas', ...Object.keys(emotionMeta)].map((emotion) => <button key={emotion} className={historyFilter === emotion ? 'active' : ''} onClick={() => setHistoryFilter(emotion)}>{emotion === 'todas' ? 'Todas' : capitalize(emotion)}</button>)}</div>
              <div className="history-actions">
                <button className="outline-btn compact-btn" onClick={exportEmotionReport}><Download size={16} /> Exportar PDF</button>
                <button className="wine-btn compact-btn" onClick={() => navigate('new')}><Plus size={16} /> Novo registro</button>
              </div>
            </div>
            {showingDemo && <div className="demo-note"><Sparkles size={16} /><div><strong>Histórico de exemplo</strong><span>Faça seu primeiro registro para substituir estes exemplos.</span></div></div>}
            <div className="timeline">
              {displayEntries.filter((entry) => historyFilter === 'todas' || emotionGroup(entry.emotion) === historyFilter).map((entry) => {
                const meta = emotionMeta[emotionGroup(entry.emotion)] ?? emotionMeta.calma;
                return <article className="surface history-card" key={entry.id}>
                  <div className="history-dot" style={{ background: meta.soft }}>{meta.emoji}</div>
                  <div className="history-main"><div className="history-top"><div><span>{formatDate(entry.occurredAt, true)}</span><h2>{emotionLabel(entry.emotion)} <small>intensidade {entry.intensity}/10</small></h2></div>{!entry.demo && <button className="delete-btn" onClick={() => void removeEntry(entry.id)} aria-label="Excluir registro"><Trash2 size={16} /></button>}</div>
                  <p className="event-copy">{entry.event}</p>
                  <div className="history-tags"><span>Gatilho: {entry.trigger || 'não identificado'}</span>{entry.pattern && <span>Padrão: {entry.pattern}</span>}</div>
                  {(entry.thought || entry.need) && <div className="history-reflection">{entry.thought && <p><strong>Pensamento:</strong> “{entry.thought}”</p>}{entry.need && <p><strong>Necessidade:</strong> {entry.need}</p>}</div>}</div>
                </article>;
              })}
            </div>
          </section>
        )}

        {view === 'patterns' && (
          <>
            {showingDemo && <div className="demo-note"><Sparkles size={16} /><div><strong>Análise de exemplo</strong><span>Ela mostra como seus próprios padrões serão organizados depois dos primeiros registros.</span></div></div>}
            <section className="stats-strip">
              <article><span>Registros no mês</span><strong>{last30.length}</strong><small>momentos de autoconsciência</small></article>
              <article><span>Gatilho mais frequente</span><strong className="word-stat">{triggerCounts[0]?.[0] ?? '—'}</strong><small>{triggerCounts[0] ? `${triggerCounts[0][1]} ocorrência(s)` : 'ainda sem dados'}</small></article>
              <article><span>Emoção mais presente</span><strong className="word-stat">{emotionCounts[0]?.count ? capitalize(emotionCounts[0].emotion) : '—'}</strong><small>{emotionCounts[0]?.count ? `${emotionCounts[0].count} ocorrência(s)` : 'ainda sem dados'}</small></article>
            </section>

            <section className="pattern-layout">
              <article className="surface pattern-list-card">
                <div className="section-head compact"><div><h2>Padrões que apareceram</h2><p>Frequência nos últimos 30 dias.</p></div><button className="outline-btn compact-btn" onClick={exportEmotionReport}><Download size={16} /> Exportar PDF</button></div>
                <div className="pattern-bars">
                  {(patternCounts.length ? patternCounts : [['Ainda não identificado', 0] as [string, number]]).map(([pattern, count], index) => <div className="pattern-row" key={pattern}><div><strong>{pattern}</strong><span>{count} {count === 1 ? 'vez' : 'vezes'}</span></div><div className="pattern-track"><span style={{ width: `${Math.max(count ? 22 : 0, patternCounts[0]?.[1] ? count / patternCounts[0][1] * 100 : 0)}%` }} /></div>{index === 0 && count > 0 && <small>mais recorrente</small>}</div>)}
                </div>
              </article>
              <article className="surface compassionate-card"><div className="insight-icon"><Sparkles size={22} /></div><div className="eyebrow">Compreensão, não rótulo</div><h2>{patternCounts[0]?.[0] ?? 'Seus padrões vão ganhar nome aqui.'}</h2><p>{patternCounts[0] ? patternInsights[patternCounts[0][0]] ?? 'Este padrão pode ter sido uma forma de proteção. Observe quando ele aparece e qual necessidade existe por trás dele.' : 'Registre algumas situações e a ferramenta vai organizar as repetições para você enxergá-las com mais clareza.'}</p><div className="reflection-prompt"><strong>Uma pergunta para levar:</strong><span>“O que essa reação tentou proteger em mim?”</span></div></article>
            </section>

            <section className="surface emotion-analysis">
              <div className="section-head compact"><div><h2>Distribuição emocional</h2><p>Presença de cada emoção no mês.</p></div></div>
              <div className="distribution-list">{emotionCounts.map(({ emotion, count }) => { const meta = emotionMeta[emotion]; const max = Math.max(1, emotionCounts[0]?.count ?? 1); return <div className="distribution-row" key={emotion}><span className="mini-emoji" style={{background: meta.soft}}>{meta.emoji}</span><strong>{capitalize(emotion)}</strong><div><span style={{width: `${count / max * 100}%`, background: meta.color}} /></div><small>{count}</small></div>; })}</div>
            </section>
          </>
        )}

        {view === 'reminders' && <MarketingSignup />}
        {view === 'reminders' && (
          <section className="reminder-layout">
            <article className="surface reminder-intro">
              <div className="reminder-hero-icon"><Bell size={30} /></div>
              <div className="eyebrow">Cuidado que cabe na rotina</div>
              <h2>Três pausas curtas valem mais que esperar o dia perfeito.</h2>
              <p>Organize suas pausas com alertas neste navegador e lembretes recorrentes na agenda do celular.</p>
              <div className="how-list"><div><span>1</span><p><strong>Escolha seus horários</strong>Manhã, tarde e noite — ou o ritmo que fizer sentido.</p></div><div><span>2</span><p><strong>Ative neste dispositivo</strong>O navegador avisa quando a ferramenta estiver aberta.</p></div><div><span>3</span><p><strong>Leve para o celular</strong>A agenda envia os alertas mesmo com a página fechada.</p></div></div>
            </article>
            <form className="surface reminder-form" onSubmit={saveReminderSettings}>
              <div className="step-label"><span><Clock3 size={15} /></span> Meus horários de pausa</div>
              <div className="time-grid">{reminders.times.map((time, index) => <label key={index}><span>{index === 0 ? 'Manhã' : index === 1 ? 'Tarde' : 'Noite'}</span><input type="time" value={time} onChange={(event) => setReminders({ ...reminders, times: reminders.times.map((item, timeIndex) => timeIndex === index ? event.target.value : item) })} /></label>)}</div>
              <div className="divider" />
              <div className="field-grid">
                <label className="field"><span>Seu nome (opcional)</span><input value={reminders.name} onChange={(event) => setReminders({ ...reminders, name: event.target.value })} placeholder="Como você quer ser chamada?" /></label>
                <label className="field"><span>E-mail (para uma integração futura)</span><input type="email" value={reminders.email} onChange={(event) => setReminders({ ...reminders, email: event.target.value })} placeholder="voce@email.com" /></label>
                <label className="field"><span>Celular / WhatsApp (integração futura)</span><input value={reminders.phone} onChange={(event) => setReminders({ ...reminders, phone: event.target.value })} placeholder="(00) 00000-0000" /></label>
              </div>
              <p className="privacy-copy"><LockKeyhole size={14} /> O contato fica salvo no seu espaço; nenhum e-mail ou WhatsApp é enviado nesta versão.</p>
              <button className="wine-btn full" disabled={savingReminders}>{savingReminders ? <Loader2 className="spin" size={17} /> : <Check size={17} />} Salvar horários</button>
              <button type="button" className="outline-btn full" onClick={() => void enableNotifications()}><Bell size={17} /> Ativar alertas neste navegador</button>
              <button type="button" className="outline-btn full" onClick={downloadCalendar}><Download size={17} /> Adicionar à agenda do celular</button>
              <div className="calendar-tip"><CalendarDays size={17} /><span>Ao abrir o arquivo, escolha sua agenda preferida e confirme os três eventos diários.</span></div>
            </form>
          </section>
        )}

        <footer className="app-footer"><div className="footer-brands"><div className="footer-logo footer-logo-mqc" role="img" aria-label="MqC — Método Que Cura" /><div className="footer-logo footer-logo-mql" role="img" aria-label="MqL — Mulheres Que Lideram" /></div><div className="footer-caption"><span>Diário Emocional • Jeniffer Pires</span><span>Ferramenta de auto-observação. Não substitui acompanhamento profissional.</span></div></footer>
      </main>

      <a className="urgent-help" href={URGENT_CONTACT_URL} target="_blank" rel="noreferrer" title="Conheça a mentoria da Jeniffer. O retorno pelo WhatsApp pode não ser imediato." aria-label="Quero avançar para o próximo nível com a mentoria da Jeniffer pelo WhatsApp.">
        <TriangleAlert size={21} />
        <span><small>Mentoria com a Jeniffer</small><strong>Quero avançar para o próximo nível.</strong></span>
      </a>

      <nav className="bottom-nav" aria-label="Navegação no celular">
        {nav.map(({ id, short, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={18} /><span>{short}</span></button>)}
      </nav>
    </div>
  );
}


