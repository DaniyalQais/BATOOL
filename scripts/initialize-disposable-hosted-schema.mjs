// First initialization only; NEVER replays migrations on an initialized project.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadTarget,postgresEnvironment} from './hosted-verification-guard.mjs';
let committed=false;
try{
 const file='.tmp/hosted-acceptance/target.json';
 const target=await loadTarget(file,process.env,true);
 if(target.projectRef!=='jcbxxgjrnkhgcspbscgb'||target.schemaReadyThrough!==null||target.noProductionData!==false)throw Error('Not initial setup');
 const dir=new URL('../.tmp/hosted-acceptance/',import.meta.url);
 const artifact=await readFile(new URL('initialize-disposable-schema.sql',dir),'utf8');
 const record=JSON.parse(await readFile(new URL('schema-sources.json',dir),'utf8'));
 const hash=v=>createHash('sha256').update(v).digest('hex');
 if(record.target!==target.projectRef||record.artifactSha256!==hash(artifact)||record.sources.length!==9)throw Error('Artifact changed');
 for(const source of record.sources){if(!/^\d{14}_[a-z_]+\.sql$/.test(source.file)||hash(await readFile(new URL(`../supabase/migrations/${source.file}`,import.meta.url)))!==source.sha256)throw Error('Source changed');}
 const pgEnv=postgresEnvironment(target);
 const sql=text=>new Promise((yes,no)=>{
  const c=spawn(process.env.BATOOL_HOSTED_PSQL||'C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:pgEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';
  c.stdout.on('data',x=>out+=x);c.stderr.on('data',()=>{});c.stdin.on('error',()=>{});c.on('error',()=>no(Error('Client unavailable')));c.on('close',code=>code===0?yes(out.trim()):no(Error('Initialization or inspection failed')));c.stdin.end(text);
 });
 await sql(artifact);committed=true;
 const sources=await readFile(new URL('../supabase/tests/checkout_recovery_postflight.sql',import.meta.url),'utf8');
 const fingerprints=[...sources.matchAll(/\('([^']+)','([0-9a-f]{32})'\)/g)];
 if(fingerprints.length!==5)throw Error('Missing reviewed fingerprints');
 const check=JSON.parse(await sql(`begin transaction isolation level repeatable read, read only;
  select json_build_object('auth_users',(select count(*) from auth.users),'products',(select count(*) from public.products),'orders',(select count(*) from public.orders),'roles',(select count(*) from public.dashboard_roles),
   'closed',(select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness),
   'unconfigured_shipping',(select settings->'shipping'='{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null}'::jsonb from public.business_settings),
   'notifications_empty',(select settings='{"emails":[],"whatsapp_numbers":[]}'::jsonb from public.order_notification_settings),
   'sources_match',${fingerprints.map(([,sig,md5])=>`coalesce((select md5(regexp_replace(prosrc,'[[:space:]]+','','g'))='${md5}' from pg_proc where oid=to_regprocedure('${sig}')),false)`).join(' and ')});
  rollback;`));
 if(check.auth_users!==0||check.products!==0||check.orders!==0||check.roles!==0||!check.closed||!check.unconfigured_shipping||!check.notifications_empty||!check.sources_match)throw Error('Prerequisites not confirmed');
 const saved=JSON.parse(await readFile(file,'utf8'));saved.schemaReadyThrough='010';saved.noProductionData=true;await writeFile(file,JSON.stringify(saved,null,2)+'\n');
 await writeFile(new URL('schema-initialization-result.json',dir),JSON.stringify({target:target.projectRef,firstInitialization:true,artifactSha256:record.artifactSha256,inspection:check},null,2));
 console.log('PASS: new disposable schema initialized once; empty Auth/catalog/orders/roles, shipping unconfigured, all readiness false, five source bodies matched.');
 console.log('No production migration replay, fixture suite, Auth creation, order or deployment performed.');
}catch{
 console.error(committed?'Initialization committed but prerequisite inspection incomplete. STOP; do not replay initialization.':'Initialization not confirmed. STOP; inspect current state before retrying. Raw diagnostics suppressed.');process.exitCode=1;
}
