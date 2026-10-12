import { guarded } from '../../auth/server';
import { handleWebhook } from '../../billing/core';
import { billingEnv, stripeClient } from '../../billing/server';
export const POST = (request: Request) => guarded(() => handleWebhook(request, billingEnv(), stripeClient()));
