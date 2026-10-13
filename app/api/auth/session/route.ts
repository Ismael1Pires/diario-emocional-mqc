import { json, requireUser } from '../core';
import { authEnv, guarded } from '../server';
export const GET = (request: Request) =>
  guarded(async () => json({ user: await requireUser(request, authEnv()) }));
