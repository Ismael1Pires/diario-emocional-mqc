import { guarded } from '../../auth/server';
import { createPortal } from '../core';
import { billingEnv, stripeClient } from '../server';
export const POST = (request: Request) => guarded(() => createPortal(request, billingEnv(), stripeClient()));
