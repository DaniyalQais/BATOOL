// Shared fail-closed target checks. No credentials or provider bodies are logged.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function validateIdentity(target, productionUrl, confirmation) {
  if (!productionUrl || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(productionUrl)) throw new Error('Production exclusion configuration missing');
  if (!target || target.disposable !== true || target.name !== 'batool-checkout-acceptance-20261102'
    || !/^[a-z0-9]{20}$/.test(target.projectRef ?? '')
    || target.projectUrl !== `https://${target.projectRef}.supabase.co`
    || target.projectUrl === productionUrl || confirmation !== target.projectRef
    || target.origin !== 'http://127.0.0.1:43871') throw new Error('Disposable target confirmation missing or inconsistent');
  const direct = target.dbHost === `db.${target.projectRef}.supabase.co` && target.dbUser === 'postgres';
  const pooler = /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(target.dbHost ?? '')
    && target.dbUser === `postgres.${target.projectRef}` && String(target.dbPort) === '5432';
  if (!(direct || pooler) || String(target.dbPort) !== '5432') throw new Error('Database target is not bound to disposable project');
  return Object.freeze({ ...target, endpoint: `${target.projectUrl}/functions/v1/secure-checkout` });
}

export function validateInspectionTarget(target, productionUrl, confirmation) {
  // Read-only discovery must work before schema/data state has been verified.
  // Identity, production exclusion and database binding are still mandatory.
  return validateIdentity(target, productionUrl, confirmation);
}

export function validateTarget(target, productionUrl, confirmation) {
  const checked = validateIdentity(target, productionUrl, confirmation);
  if (checked.schemaReadyThrough !== '010' || checked.noProductionData !== true) throw new Error('Disposable schema/data verification missing');
  return checked;
}

export async function loadTarget(file, env = process.env, inspectionOnly = false) {
  const local = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  const productionUrl = local.match(/^SUPABASE_URL\s*=\s*["']?(https:\/\/[a-z0-9]{20}\.supabase\.co)["']?\s*$/m)?.[1];
  const target = JSON.parse(await readFile(resolve(file), 'utf8'));
  return (inspectionOnly ? validateInspectionTarget : validateTarget)(target, productionUrl, env.BATOOL_HOSTED_CONFIRM_REF);
}

export function postgresEnvironment(target, env = process.env) {
  if (!env.BATOOL_HOSTED_DB_PASSWORD) throw new Error('Disposable database password missing');
  // Exclude inherited PGOPTIONS/PGSERVICE/PGHOSTADDR and unrelated production credentials.
  const safe = Object.fromEntries(Object.entries(env).filter(([key]) => /^(PATH|Path|SystemRoot|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
  return { ...safe, PGHOST: target.dbHost, PGPORT: '5432', PGUSER: target.dbUser,
    PGDATABASE: 'postgres', PGPASSWORD: env.BATOOL_HOSTED_DB_PASSWORD,
    PGSSLMODE: 'verify-full', PGSSLROOTCERT: env.BATOOL_HOSTED_CA_FILE || 'system', PGCONNECT_TIMEOUT: '15',
    PGOPTIONS: '-c statement_timeout=30000 -c lock_timeout=5000' };
}
