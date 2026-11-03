// Initial disposable discovery only: GET/OPTIONS and read-only SQL. No fixtures,
// migrations, Auth creation, secret changes, deployment or checkout mutation RPC.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTarget, postgresEnvironment } from './hosted-verification-guard.mjs';
const env=process.env;
const databaseOnly=process.argv[3]==='--database-only';
const report={scope:'disposable initial read-only inspection',checks:[]};
const add=(check,result)=>{report.checks.push({check,result});console.log(`${check}: ${typeof result==='string'?result:JSON.stringify(result)}`);};
let stage='target binding';
try {
  const file=process.argv[2]; if(!file||!(process.argv.length===3||(process.argv.length===4&&databaseOnly)))throw Error('Usage');
  const target=await loadTarget(file,env,true);
  add('Production exclusion and database binding','PASS');
  const pgEnv=postgresEnvironment(target);
  const sql=text=>new Promise(resolve=>{
    const child=spawn(env.BATOOL_HOSTED_PSQL||'C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:pgEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let out='',err='';
    child.stdout.on('data',v=>{out+=v});child.stderr.on('data',v=>{err+=v});
    child.on('error',()=>resolve({ok:false,category:'client unavailable'}));
    child.on('close',code=>{
      const category=/could not translate host|Name or service not known|No such host/i.test(err)?'DNS resolution':/Network is unreachable|No route to host|could not connect|connection.*timed out|timeout expired/i.test(err)?'network connectivity':/certificate|root certificate|SSL error/i.test(err)?'TLS validation':/password authentication failed|authentication failed/i.test(err)?'database authentication':'database query or connection';
      resolve(code===0?{ok:true,out:out.trim()}:{ok:false,category});
    });
    child.stdin.on('error',()=>{});child.stdin.end(text);
  });
  stage='read-only database inventory';
  const known=['products','product_variants','dashboard_roles','orders','order_items','order_customer_details','order_creation_keys','order_status_history','order_checkout_details','business_settings','order_notification_settings'];
  const inventory=await sql(`begin transaction isolation level repeatable read, read only;
    select json_build_object('read_only',current_setting('transaction_read_only')='on','administrator',current_user='postgres',
      'auth_users',(select count(*) from auth.users),
      'public_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')),
      'application_tables',(select coalesce(json_agg(c.relname),'[]'::json) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${known.map(n=>`'${n}'`).join(',')})),
      'recovery_creator',to_regprocedure('public.checkout_create(uuid,uuid,uuid,jsonb)') is not null,
      'recovery_resolver',to_regprocedure('public.checkout_resolve(uuid,uuid,uuid)') is not null,
      'prior_acceptance_run',to_regnamespace('batool_acceptance') is not null,
      'custom_auth_triggers',(select count(*) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal));
    rollback;`);
  if(inventory.ok){
    const data=JSON.parse(inventory.out);add('Database inventory',data);
    if(data.application_tables.length){
      const tables=data.application_tables.filter(n=>known.includes(n));
      const counts=await sql(`begin transaction isolation level repeatable read, read only;
        select json_build_object(${tables.map(n=>`'${n}',(select count(*) from public.${n})`).join(',')}); rollback;`);
      add('Application counts',counts.ok?JSON.parse(counts.out):`NOT VERIFIED: ${counts.category}`);
    }
  } else {add('Database inventory',`NOT VERIFIED: ${inventory.category}`);process.exitCode=2;}
  const request=async(path,headers={},method='GET')=>{
    try {const r=await fetch(target.projectUrl+path,{method,headers,redirect:'error',signal:AbortSignal.timeout(15000)});return {r,data:method==='GET'?await r.json().catch(()=>null):null};}
    catch{return null;}
  };
  if(!databaseOnly){
  stage='read-only API inventory';
  if(env.BATOOL_HOSTED_PUBLISHABLE_KEY){
    const settings=await request('/auth/v1/settings',{apikey:env.BATOOL_HOSTED_PUBLISHABLE_KEY});
    const providers=settings?.data?.external;
    const anonymous=typeof providers?.anonymous_users==='boolean'?providers.anonymous_users:typeof providers?.anonymous==='boolean'?providers.anonymous:null;
    add('Auth public settings',settings?{status:settings.r.status,emailEnabled:typeof providers?.email==='boolean'?providers.email:null,anonymousEnabled:anonymous}: 'NOT VERIFIED: network');
  }
  if(env.BATOOL_HOSTED_SERVICE_KEY){
    // apikey only: new Secret key is not a user JWT. Discard user response rows.
    const users=await request('/auth/v1/admin/users?page=1&per_page=1',{apikey:env.BATOOL_HOSTED_SERVICE_KEY});
    add('Auth administration key read access',users?{status:users.r.status,accepted:users.r.status===200&&Array.isArray(users.data?.users),anyUsers:Array.isArray(users.data?.users)?users.data.users.length>0:null}:'NOT VERIFIED: network');
  }
  const edge=await request('/functions/v1/secure-checkout',{Origin:target.origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},'OPTIONS');
  add('Edge preflight availability',edge?{status:edge.r.status,allowedOrigin:edge.r.headers.get('access-control-allow-origin')===target.origin}:'NOT VERIFIED: network');
  }
  add('Mutation readiness','UNCHANGED: no flags promoted; schema/data verification still requires review');
} catch {add(stage,'NOT VERIFIED: configuration or request failure; raw diagnostics suppressed');process.exitCode=1;}
finally {
  await mkdir(new URL('../.tmp/hosted-acceptance/',import.meta.url),{recursive:true});
  await writeFile(new URL(`../.tmp/hosted-acceptance/${databaseOnly?'inspection-database':'inspection'}.json`,import.meta.url),JSON.stringify(report,null,2));
  console.log('Read-only discovery finished; no checkout/Auth fixtures, migrations or deployments performed.');
}
