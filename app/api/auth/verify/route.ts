import { verifyCode } from '../core';
import { authEnv, guarded } from '../server';
export const POST = (request: Request) =>
  guarded(() => verifyCode(request, authEnv()));
