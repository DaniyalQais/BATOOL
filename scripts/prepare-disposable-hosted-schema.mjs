// Offline artifact preparation only. This never connects to a database.
// First initialization of an EMPTY disposable Supabase project, not a migration
// replay against BATOOL. Demo seed 002 and existing fixture suites are excluded.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTarget } from './hosted-verification-guard.mjs';
const target=await loadTarget('.tmp/hosted-acceptance/target.json',process.env,true);
if(target.projectRef!=='jcbxxgjrnkhgcspbscgb')throw Error('Reviewed initialization target required');
const files=['20261030000100_catalog.sql','20261030000300_dashboard_roles.sql','20261030000400_owner_product_editing.sql','20261030000500_owner_product_images.sql','20261031000600_order_foundation.sql','20261101000700_product_drafts.sql','20261102000800_owner_business_settings.sql','20261102000900_secure_checkout.sql','20261102001000_checkout_intent_recovery.sql'];
const sources=[];const parts=[];
for(const file of files){
  const source=await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
  const begin=/^begin;\s*$/im;const end=/^commit;\s*$/im;
  if(!begin.test(source)||!end.test(source)||!source.trimEnd().toLowerCase().endsWith('commit;'))throw Error('Unexpected source transaction');
  sources.push({file,sha256:createHash('sha256').update(source).digest('hex')});
  parts.push(`-- Accepted schema definition source: ${file}\n${source.replace(begin,'').replace(end,'').trim()}\n`);
}
const text=`-- ONE-TIME EMPTY DISPOSABLE INITIALIZATION ONLY.
-- Reviewed target: ${target.projectRef}; never run against BATOOL.
-- All changes are atomic; any nonempty/conflicting target aborts.
-- No demo merchandise, Auth users, roles, orders or fixture suites.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $guard$ begin
  if current_user<>'postgres' or current_setting('session_replication_role')<>'origin'
    or exists(select 1 from auth.users)
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p'))
    or exists(select 1 from pg_namespace where nspname like 'batool\\_%' escape '\\')
    or exists(select 1 from storage.buckets) or exists(select 1 from storage.objects)
    or exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal)
  then raise exception 'STOP: target is not a new empty disposable Supabase database'; end if;
  if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole=(select oid from pg_roles where rolname=current_user)
      and (d.defaclnamespace=0 or d.defaclnamespace='public'::regnamespace)
      and a.grantee not in (0,d.defaclrole)
      and a.grantee not in (select oid from pg_roles where rolname in ('anon','authenticated','service_role')))
  then raise exception 'STOP: unexpected current-creator default ACL'; end if;
end; $guard$;
${parts.join('\n')}
do $closed$ begin
  if exists(select 1 from public.products) or exists(select 1 from public.orders) or exists(select 1 from public.dashboard_roles)
    or exists(select 1 from auth.users)
    or exists(select 1 from batool_checkout_internal.readiness where enabled or cod_ready or easypaisa_manual_ready or jazzcash_manual_ready or zero_tax_reviewed)
  then raise exception 'STOP: unexpected seeded data or intake readiness'; end if;
end; $closed$;
notify pgrst,'reload schema';
commit;
`;
const dir=new URL('../.tmp/hosted-acceptance/',import.meta.url);await mkdir(dir,{recursive:true});
await writeFile(new URL('initialize-disposable-schema.sql',dir),text);
await writeFile(new URL('schema-sources.json',dir),JSON.stringify({target:target.projectRef,sources,artifactSha256:createHash('sha256').update(text).digest('hex')},null,2));
console.log('Prepared one atomic empty-disposable schema artifact from nine accepted definition sources; seed 002 excluded. No SQL executed.');
