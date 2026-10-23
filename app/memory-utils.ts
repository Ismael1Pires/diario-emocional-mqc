export const memoryThemes = ['Reflexão livre', 'Celebrações e conquistas', 'Superações', 'Dificuldades', 'Padrões que se repetem'];
export type Memory = { id: string; createdAt: number; title: string; category: string; content: string };
export type MemoryDraft = Pick<Memory, 'id' | 'title' | 'category' | 'content'>;

// Use the same local calendar day shown on each memory, including near midnight.
export function memoryDay(timestamp: number) {
  const day = new Date(timestamp * 1000);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

export function filterMemories(memories: Memory[], theme: string, from: string, to: string) {
  return memories.filter((memory) => {
    const day = memoryDay(memory.createdAt);
    return (theme === 'Todas' || memory.category === theme) && (!from || day >= from) && (!to || day <= to);
  });
}
