import { apiFetch } from './client-api';
import type { Memory, MemoryDraft } from './memory-utils';

const connectionMessage = 'A conexão foi interrompida. Seu texto continua aqui. Verifique a internet e tente guardar novamente.';

export async function saveMemory(draft: MemoryDraft): Promise<Memory> {
  // The same ID is sent again if the server saved but the response was lost.
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    let data: { reflection?: Memory; error?: string };
    try {
      response = await apiFetch('/api/reflections', {
        method: 'POST',
        body: JSON.stringify(draft),
        signal: AbortSignal.timeout(20000),
      });
      if ([502, 503, 504].includes(response.status)) throw new Error();
      data = await response.json() as typeof data;
    } catch {
      if (attempt === 0) continue;
      throw new Error(connectionMessage);
    }
    if (!response.ok || !data.reflection)
      throw new Error(data.error || 'Não foi possível guardar sua memória. Seu texto continua aqui para tentar novamente.');
    return data.reflection;
  }
  throw new Error(connectionMessage);
}
