export type Offer = {
  key: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  mode: 'payment' | 'subscription';
};

export const DIARY_OFFER_KEY = 'diario-emocional';

export function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null || !currency) return 'Valor em confirmação';
  const code = currency.toLowerCase();
  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency,
    ...(['huf', 'twd'].includes(code) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}),
  });
  // ISK/UGX retain two-decimal API amounts; HUF/TWD charges also use cents.
  const decimals = ['isk', 'ugx', 'huf', 'twd'].includes(code)
    ? 2 : (formatter.resolvedOptions().maximumFractionDigits ?? 2);
  return formatter.format(amount / 10 ** decimals);
}

export function offerPeriod(offer: Offer) {
  if (!offer.interval) return '';
  const periods: Record<string, string> = { day: 'dia', week: 'semana', month: 'mês', year: 'ano' };
  const plurals: Record<string, string> = { day: 'dias', week: 'semanas', month: 'meses', year: 'anos' };
  const count = offer.intervalCount ?? 1;
  return count > 1 ? `${count} ${plurals[offer.interval] || offer.interval}` : periods[offer.interval] || offer.interval;
}
