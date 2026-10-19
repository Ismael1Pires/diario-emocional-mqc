import { json } from '../auth/core';

// Payments are paused. Retained billing records are never changed by these routes.
export const paymentsDisabled = () => json({ error: 'Os pagamentos estão desativados. Acesse o diário pela página inicial.' }, 410);
