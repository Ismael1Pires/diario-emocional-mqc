import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('work/tests', { recursive: true });
await build({
  entryPoints: ['tests/security.test.ts', 'tests/billing.test.ts'],
  outdir: 'work/tests',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  plugins: [
    {
      name: 'worker-test-env',
      setup(build) {
        build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: new URL('../tests/env.ts', import.meta.url).pathname,
        }));
      },
    },
  ],
});
const result = spawnSync(
  process.execPath,
  ['--test', 'work/tests/security.test.mjs', 'work/tests/billing.test.mjs'],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
