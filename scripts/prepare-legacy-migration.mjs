// Offline proposal only: no network, credentials or database access.
// Input must be kept outside Git; see docs/authentication.md for required evidence.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const file = process.argv[2];
if (!file)
  throw new Error(
    'Usage: node scripts/prepare-legacy-migration.mjs /secure/approved-manifest.json',
  );
const manifest = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(manifest) || !manifest.length || manifest.length > 500)
  throw new Error('Expected 1–500 explicit approvals.');
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const seen = new Set();
const statements = manifest.map((row) => {
  if (
    !/^user:[a-f0-9-]{36}$/.test(row.userId) ||
    !['entries', 'reflections', 'settings'].includes(row.resourceType) ||
    typeof row.resourceId !== 'string' ||
    !row.resourceId ||
    row.resourceId.length > 100 ||
    typeof row.evidenceReference !== 'string' ||
    row.evidenceReference.length < 8 ||
    row.evidenceReference.length > 200 ||
    typeof row.approvedBy !== 'string' ||
    row.approvedBy.length < 3 ||
    row.approvedBy.length > 100 ||
    row.independentOwnershipVerified !== true
  )
    throw new Error(
      'Invalid approval: independent ownership verification is mandatory.',
    );
  const key = `${row.resourceType}:${row.resourceId}`;
  if (seen.has(key)) throw new Error('Duplicate resource.');
  seen.add(key);
  return `INSERT INTO legacy_migration_audit (id,user_id,resource_type,resource_id,evidence_reference,approved_by,approved_at) VALUES (${[randomUUID(), row.userId, row.resourceType, row.resourceId, row.evidenceReference, row.approvedBy].map(quote).join(',')},unixepoch());`;
});
console.log(
  '-- OFFLINE PROPOSAL: requires independent review and an authorized database operator.',
);
console.log(
  '-- Each INSERT atomically records approval and assigns only that explicit resource.',
);
console.log(statements.join('\n'));
