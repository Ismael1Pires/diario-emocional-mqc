import { guarded } from '../../auth/server';
import { billingConfig } from '../core';
import { getDiaryAccess } from '../diary-access';
import { billingEnv, stripeClient } from '../server';
export const GET = (request: Request) => guarded(() => {
  const config = billingEnv();
  return getDiaryAccess(request, config, stripeClient(), billingConfig(config));
});
