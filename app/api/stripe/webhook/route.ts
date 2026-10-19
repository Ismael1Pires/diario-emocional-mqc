import { json } from '../../auth/core';

// The retired endpoint acknowledges retries without importing Stripe or changing any records.
export const POST = () => json({ received: true, ignored: true });
