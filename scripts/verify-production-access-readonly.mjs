// Focused new production HTTP/catalog evidence. No Auth session creation,
// impersonation, fixture, mutating RPC or role/account change.
import {readFile,writeFile} from 'node:fs/promises';
const env={};for(const file of ['.env.local','.env.hosted.local'])for(const line of (await readFile(file,'utf8')).split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(m)env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}
const ref='cydnirqrsjrlljrjfidq',url=`https://${ref}.supabase.co`;
const report={project:ref,checks:[],actualSessions:'PENDING: existing authenticated sessions have not been supplied through an interactive login; no synthetic JWT evidence substituted',complete:false};
let stage='production binding';
function need(v){if(!v)throw Error('Focused verification unconfirmed');}
function pass(label){report.checks.push(label);console.log('PASS: '+label);}
try{
 need(env.SUPABASE_URL===url);
 const query=`select jsonb_build_object('service_rpc_count',count(*),'service_only',bool_and(has_function_privilege('service_role',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE'))) as evidence from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'checkout_%'`;
 if(process.argv[2]==='--remaining'){
  const prior=JSON.parse(await readFile('.tmp/production-disabled-release/access-readonly-result.json','utf8'));
  need(prior.project===ref&&!prior.complete&&prior.checks.includes('Live catalog: all public checkout_* RPCs restricted to service_role'));
  await writeFile('.tmp/production-disabled-release/access-initial-incomplete-result.json',JSON.stringify(prior,null,2),{flag:'wx'});
  report.checks.push('Prior completed live service-only privilege check retained; not repeated');
 }else{
  stage='service-only privilege catalog';
  const meta=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`,{method:'POST',headers:{Authorization:`Bearer ${env.BATOOL_HOSTED_MANAGEMENT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query}),redirect:'error',signal:AbortSignal.timeout(20000)});
  need(meta.ok);const rows=await meta.json();need(rows[0]?.evidence?.service_rpc_count>=10&&rows[0]?.evidence?.service_only===true);pass('Live catalog: all public checkout_* RPCs restricted to service_role');
 }
 stage='unauthenticated service-only read RPC';
 const response=await fetch(url+'/rest/v1/rpc/checkout_availability',{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(20000)});
 const denied=await response.json();need([401,403].includes(response.status)&&denied.code==='42501');pass('Actual unauthenticated PostgREST request denied service-only read RPC');
 // No customer rows are requested, even on a broken private-table grant.
 for(const table of ['business_settings','order_notification_settings','order_customer_details']){
  stage='unauthenticated zero-row private-table request: '+table;
  const r=await fetch(url+`/rest/v1/${table}?select=*&limit=0`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY},redirect:'error',signal:AbortSignal.timeout(20000)});
  need([401,403].includes(r.status));const data=await r.json();need(data.code==='42501');pass('Unauthenticated table access denied: '+table);
 }
 report.complete=true;
}catch(error){report.failure={stage,category:error?.name??'unconfirmed',networkCode:error?.cause?.code??null};console.error('STOP: '+stage+' unconfirmed; no raw response printed.');process.exitCode=1;}
finally{await writeFile('.tmp/production-disabled-release/access-readonly-result.json',JSON.stringify(report,null,2));}
