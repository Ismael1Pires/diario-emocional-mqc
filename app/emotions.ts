export const emotionMeta: Record<string, { emoji: string; color: string; soft: string; phrase: string }> = {
  alegria: { emoji: '☀️', color: '#b58a26', soft: '#f6e9bb', phrase: 'leve e expansiva' },
  calma: { emoji: '🍃', color: '#66806b', soft: '#dfe9df', phrase: 'presente e serena' },
  raiva: { emoji: '🔥', color: '#a95343', soft: '#f1d7cf', phrase: 'acesa e protetora' },
  angústia: { emoji: '🌧️', color: '#75627e', soft: '#e6deea', phrase: 'apertada por dentro' },
  ansiedade: { emoji: '〰️', color: '#ad6875', soft: '#f3dfe3', phrase: 'acelerada e alerta' },
  tristeza: { emoji: '🌙', color: '#55738a', soft: '#dce7ee', phrase: 'recolhida e sensível' },
  medo: { emoji: '🫧', color: '#7c6f54', soft: '#ebe5d6', phrase: 'insegura e cautelosa' },
  desconexão: { emoji: '🌫️', color: '#687681', soft: '#e2e7eb', phrase: 'distante e sem envolvimento' },
};

export const disconnectionDetails = [
  { emotion: 'desconexão:indiferença', label: 'Indiferença', description: 'As coisas parecem não fazer diferença para mim.' },
  { emotion: 'desconexão:apatia', label: 'Apatia', description: 'Sinto pouca vontade de agir ou me envolver.' },
  { emotion: 'desconexão:distanciamento', label: 'Distanciamento', description: 'Sinto distância das pessoas, das situações ou de mim.' },
  { emotion: 'desconexão:desinteresse', label: 'Desinteresse', description: 'O que costuma me interessar parece não despertar minha atenção.' },
];

// Keep the optional detail in the existing emotion field, preserving older entries.
export const validEmotions = [...Object.keys(emotionMeta), ...disconnectionDetails.map((detail) => detail.emotion)];

export function emotionGroup(emotion: string) {
  return disconnectionDetails.some((detail) => detail.emotion === emotion) ? 'desconexão' : emotion;
}

export function emotionLabel(emotion: string) {
  const detail = disconnectionDetails.find((item) => item.emotion === emotion);
  if (detail) return `Desconexão · ${detail.label}`;
  return emotion ? emotion.charAt(0).toUpperCase() + emotion.slice(1) : 'Não informado';
}
