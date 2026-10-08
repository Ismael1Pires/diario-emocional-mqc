import { requestCode } from '../core';
import { authEnv, guarded, sendCode } from '../server';
export const POST = (request: Request) =>
  guarded(() => requestCode(request, authEnv(), sendCode));
