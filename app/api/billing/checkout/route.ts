import { guarded } from '../../auth/server';
import { createCheckout } from '../core';
import { billingEnv, stripeClient } from '../server';
export const POST = (request: Request) => guarded(() => createCheckout(request, billingEnv(), stripeClient()));
