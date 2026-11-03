import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTarget, postgresEnvironment } from '../scripts/hosted-verification-guard.mjs';
const ref = 'abcdefghijklmnopqrst', prod = 'https://zyxwvutsrqponmlkjihg.supabase.co';
const target = { name: 'batool-checkout-acceptance-20261102', disposable: true, projectRef: ref,
  projectUrl: `https://${ref}.supabase.co`, dbHost: `db.${ref}.supabase.co`, dbPort: 5432,
  dbUser: 'postgres', origin: 'http://127.0.0.1:43871', schemaReadyThrough: '010', noProductionData: true };
test('explicit separate disposable target accepted', () => assert.equal(validateTarget(target, prod, ref).endpoint, `${target.projectUrl}/functions/v1/secure-checkout`));
test('production URL rejected even with confirmation', () => assert.throws(() => validateTarget(target, target.projectUrl, ref)));
test('missing production exclusion fails closed', () => assert.throws(() => validateTarget(target, undefined, ref)));
test('confirmation cannot be omitted or different', () => { for (const v of [undefined, '', 'different']) assert.throws(() => validateTarget(target, prod, v)); });
test('non-disposable, copied data and incomplete schema rejected', () => {
  for (const change of [{ disposable: false }, { noProductionData: false }, { schemaReadyThrough: '009' }]) assert.throws(() => validateTarget({ ...target, ...change }, prod, ref));
});
test('URL ref and database ref cannot disagree', () => {
  for (const change of [{ projectUrl: prod }, { dbHost: 'db.zyxwvutsrqponmlkjihg.supabase.co' }, { dbUser: 'postgres.other' }, { dbPort: 6543 }]) assert.throws(() => validateTarget({ ...target, ...change }, prod, ref));
});
test('session pooler requires target-qualified username', () => {
  assert.doesNotThrow(() => validateTarget({ ...target, dbHost: 'aws-0-us-east-1.pooler.supabase.com', dbUser: `postgres.${ref}` }, prod, ref));
  assert.throws(() => validateTarget({ ...target, dbHost: 'aws-0-us-east-1.pooler.supabase.com' }, prod, ref));
});
test('no userinfo, alternate browser origin or arbitrary project accepted', () => {
  for (const change of [{ projectUrl: `https://user@${ref}.supabase.co` }, { origin: 'https://production.example' }, { name: 'batool-production' }]) assert.throws(() => validateTarget({ ...target, ...change }, prod, ref));
});
test('database child cannot inherit production overrides; TLS verified', () => {
  const actual = postgresEnvironment(target, { BATOOL_HOSTED_DB_PASSWORD: 'synthetic-test-only', PGHOSTADDR: 'bad', PGSERVICE: 'production', PGOPTIONS: 'bad', SUPABASE_SERVICE_ROLE_KEY: 'bad' });
  assert.equal(actual.PGHOST, target.dbHost); assert.equal(actual.PGSSLMODE, 'verify-full');
  for (const key of ['PGHOSTADDR', 'PGSERVICE', 'SUPABASE_SERVICE_ROLE_KEY']) assert.equal(actual[key], undefined);
  assert.throws(() => postgresEnvironment(target, {}));
});
