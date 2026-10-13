import { guarded } from '../../auth/server';
import { getCatalog } from '../core';
import { billingEnv, stripeClient } from '../server';
export const GET = () => guarded(() => getCatalog(billingEnv(), stripeClient()));
