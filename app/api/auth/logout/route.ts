import { logout } from '../core';
import { authEnv, guarded } from '../server';
export const POST = (request: Request) =>
  guarded(() => logout(request, authEnv()));
