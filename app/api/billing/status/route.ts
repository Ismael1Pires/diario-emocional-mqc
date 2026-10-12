import { guarded } from '../../auth/server';
import { getStatus } from '../core';
import { billingEnv } from '../server';
export const GET = (request: Request) => guarded(() => getStatus(request, billingEnv()));
