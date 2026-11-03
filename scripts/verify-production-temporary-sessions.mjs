// Explicit user authorization: isolated temporary production Auth accounts/roles
// only. Application probes are reads. Never sign JWTs, spoof claims, mutate
// orders/recovery/settings, change existing accounts, or send emails.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const ref='cydnirqrsjrlljrjfidq',project=`https://${ref}.supabase.co`,origin='https://batool-lake.vercel.app';
const dir='.tmp/activation-preparation/';const run=randomUUID(),nil='00000000-0000-4000-8000-000000000000';
const mode=process.argv[2];const base=true; // No production anonymous-provider write is permitted.
const report={project:ref,run,scope:'Actual Auth-issued production sessions; temporary accounts only; no synthetic JWT evidence',checks:[],complete:false,cleanup:false};
const planned=(base?['partner','unassigned','revoked']:[]).map(role=>({role,id:randomUUID()}));
const sessions=[];let service,browser,originalAuth,baseline,stage='authorized target binding',management,api;
const need=(v,label='Check unconfirmed')=>{if(!v)throw Error(label);};
const pass=label=>{report.checks.push(label);console.log('PASS: '+label);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tables=['public.products','public.product_variants','public.business_settings','public.order_notification_settings','public.orders','public.order_items','public.order_customer_details','public.order_creation_keys','public.order_status_history','public.order_checkout_details','batool_checkout_internal.readiness','batool_checkout_internal.recovery_controls','batool_checkout_internal.recovery_cases','batool_checkout_internal.recovery_intents','batool_checkout_internal.recovery_audit'];
const fingerprintQuery=`select jsonb_build_object('tables',jsonb_build_object(${tables.map(t=>`'${t}',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) from ${t} t)`).join(',')}),
 'existing_users',(select md5(coalesce(jsonb_agg(to_jsonb(u) order by u.id)::text,'[]')) from auth.users u where coalesce(u.raw_app_meta_data->>'batool_verification_run',u.raw_user_meta_data->>'batool_verification_run','')<>'${run}'),
 'existing_roles',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.user_id)::text,'[]')) from public.dashboard_roles r where not exists(select 1 from auth.users u where u.id=r.user_id and coalesce(u.raw_app_meta_data->>'batool_verification_run',u.raw_user_meta_data->>'batool_verification_run','')='${run}')),
 'closed',(select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness) and (select count(*)=1 and bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls),
 'auth_user_custom_triggers',(select count(*) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal)) as evidence`;
async function fingerprint(){const rows=await management('/database/query/read-only','POST',{query:fingerprintQuery});need(rows.length===1&&rows[0].evidence.closed,'Production gates must remain closed');return rows[0].evidence;}
async function owned(){const rows=await management('/database/query/read-only','POST',{query:`select id::text from auth.users where coalesce(raw_app_meta_data->>'batool_verification_run',raw_user_meta_data->>'batool_verification_run','')='${run}'`});need(rows.every(r=>uuid.test(r.id)));return rows.map(r=>r.id);}
async function assign(id,role){need(uuid.test(id)&&['owner','partner'].includes(role));await management('/database/query','POST',{query:`do $$ begin if not exists(select 1 from auth.users where id='${id}' and coalesce(raw_app_meta_data->>'batool_verification_run',raw_user_meta_data->>'batool_verification_run','')='${run}') or exists(select 1 from public.dashboard_roles where user_id='${id}') then raise exception 'Owned fresh fixture required'; end if; insert into public.dashboard_roles(user_id,role) values('${id}','${role}'); end $$;`});}
async function probe(a,path,{method='GET',body}={}){return api(path,{method,body,token:a.token});}
async function expectRows(a,table,columns,count){const r=await probe(a,`/rest/v1/${table}?select=${columns}&limit=${count===0&&table.startsWith('order_')?0:2}`);need(r.status===200&&Array.isArray(r.data)&&r.data.length===count);return r;}
async function caseRead(a,status,code){const r=await probe(a,'/rest/v1/rpc/owner_recovery_case',{method:'POST',body:{p_case:nil}});need(r.status===status&&r.data?.code===code);}
async function identity(a,anonymousExpected){const r=await probe(a,'/auth/v1/user');need(r.status===200&&r.data.id===a.id&&r.data.is_anonymous===anonymousExpected);const claims=JSON.parse(Buffer.from(a.token.split('.')[1],'base64url'));need(claims.sub===a.id&&claims.role==='authenticated'&&claims.is_anonymous===anonymousExpected&&uuid.test(claims.session_id)&&claims.exp*1000>Date.now());a.sid=claims.session_id;a.session.expires_at=claims.exp;report.tokenLifetimeSeconds=claims.exp-claims.iat;const rows=await management('/database/query/read-only','POST',{query:`select exists(select 1 from auth.sessions where id='${a.sid}' and user_id='${a.id}') as live`});need(rows[0].live);}
async function restricted(a){
 await identity(a,a.role==='anonymous-auth');
 const roles=await probe(a,'/rest/v1/dashboard_roles?select=role');need(roles.status===200&&roles.data.length===(a.role==='partner'?1:0));if(a.role==='partner')need(roles.data[0].role==='partner');
 await expectRows(a,'business_settings','id,revision',0);await expectRows(a,'order_notification_settings','id,revision',0);
 for(const table of ['order_customer_details','order_items','order_checkout_details'])await expectRows(a,table,'order_id',0);
 const reports=await probe(a,'/rest/v1/orders?select=id,currency,total_minor&limit=0');need(reports.status===200&&Array.isArray(reports.data)&&reports.data.length===0);
 await caseRead(a,403,'42501');
 const serviceOnly=await probe(a,'/rest/v1/rpc/checkout_availability',{method:'POST',body:{}});need(serviceOnly.status===403&&serviceOnly.data?.code==='42501');
 pass(`Actual ${a.role}: verified Auth identity/live session; private settings hidden, Owner recovery read and service-only read RPC denied`);
}
async function ui(a){
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();let blocked=0;
 await context.addInitScript(session=>localStorage.setItem('batool-admin-auth',JSON.stringify(session)),a.session);
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(['GET','HEAD','OPTIONS'].includes(r.method())&&[origin,project].includes(u.origin))return route.continue();blocked++;return route.abort();});
 await page.goto(origin+'/admin/',{waitUntil:'networkidle'});
 if(a.role==='partner'){await page.getByText('Partner',{exact:true}).waitFor();need(await page.getByRole('heading',{name:'Orders',exact:true}).count()===1);}
 else await page.getByRole('heading',{name:a.role==='anonymous-auth'?'Sign in required':'Access not assigned',exact:true}).waitFor();
 need(await page.getByRole('heading',{name:'Owner business settings',exact:true}).count()===0&&await page.getByRole('heading',{name:'Checkout recovery',exact:true}).count()===0&&blocked===0);
 await context.close();pass(`Actual ${a.role}: published browser admin permissions; no application mutations`);
}
try{
 need(mode==='--base','Only the non-anonymous batch is authorized');await mkdir(dir,{recursive:true});
 await writeFile(dir+run+'-owned-accounts.json',JSON.stringify({project:ref,run,planned},null,2),{flag:'wx'});
 const env={};for(const file of ['.env.local','.env.hosted.local'])for(const line of (await readFile(file,'utf8')).split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(m)env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}need(env.SUPABASE_URL===project);
 management=async(path,method='GET',body)=>{const r=await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{method,headers:{Authorization:`Bearer ${env.BATOOL_HOSTED_MANAGEMENT_TOKEN}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});need(r.ok,`Management ${method} ${path}: HTTP ${r.status}`);return r.json();};
 const target=await management('');need((target.id??target.ref)===ref);
 originalAuth=await management('/config/auth');need(originalAuth.external_anonymous_users_enabled===false,'Production anonymous signup must remain disabled');need(originalAuth.external_email_enabled&&!originalAuth.security_captcha_enabled&&!Object.entries(originalAuth).some(([k,v])=>/^hook_.*_enabled$/.test(k)&&v===true),'Auth hooks/captcha require separate review');
 baseline=await fingerprint();need(baseline.auth_user_custom_triggers===0,'Custom Auth triggers require review before fixtures');await writeFile(dir+run+'-baseline.private.json',JSON.stringify(baseline,null,2),{flag:'wx'});
 const keys=await management('/api-keys');service=keys.find(k=>k.name==='service_role'&&k.api_key?.startsWith('eyJ'))?.api_key;need(service,'Production legacy admin key unavailable');const sc=JSON.parse(Buffer.from(service.split('.')[1],'base64url'));need(sc.ref===ref&&sc.role==='service_role');
 api=async(path,{method='GET',body,token,admin=false}={})=>{const r=await fetch(project+path,{method,headers:{apikey:admin?service:env.SUPABASE_PUBLISHABLE_KEY,...(admin||token?{Authorization:`Bearer ${admin?service:token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});return {status:r.status,data:await r.json().catch(()=>null)};};
 if(env.PLAYWRIGHT_BROWSERS_PATH)process.env.PLAYWRIGHT_BROWSERS_PATH=env.PLAYWRIGHT_BROWSERS_PATH;const {chromium}=await import(pathToFileURL(env.BATOOL_PLAYWRIGHT_MODULE).href);browser=await chromium.launch({headless:true});
 if(base){
  stage='isolated temporary account creation';
  for(const item of planned){
   const email=`batool-check-${run}-${item.role}@example.invalid`,password=randomBytes(36).toString('base64url')+'aA1!';
   const created=await api('/auth/v1/admin/users',{admin:true,method:'POST',body:{id:item.id,email,password,email_confirm:true,app_metadata:{batool_verification_run:run,batool_verification_case:item.role},user_metadata:{role:'owner'}}});need(created.status===200&&created.data.id===item.id,'Temporary account creation unconfirmed; cleanup will resolve ownership');
   if(item.role!=='unassigned')await assign(item.id,item.role==='revoked'?'owner':'partner');
   const login=await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});need(login.status===200&&login.data.user?.id===item.id&&login.data.access_token);
   sessions.push({...item,token:login.data.access_token,session:login.data});
  }
  stage='actual Partner and unassigned reads/UI';for(const a of sessions.filter(a=>a.role!=='revoked')){await restricted(a);await ui(a);}
  stage='isolated real Owner session revocation';const a=sessions.find(a=>a.role==='revoked');await identity(a,false);await expectRows(a,'business_settings','id,revision',1);await caseRead(a,409,'PT409');
  const out=await probe(a,'/auth/v1/logout?scope=local',{method:'POST'});need(out.status===204,'Only the temporary session may be logged out');
  const live=await management('/database/query/read-only','POST',{query:`select exists(select 1 from auth.sessions where id='${a.sid}' and user_id='${a.id}') as live`});need(live[0].live===false);await caseRead(a,403,'42501');
  const refresh=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:a.session.refresh_token}});need([400,401,403].includes(refresh.status));
  await expectRows(a,'business_settings','id,revision',1);report.revokedSession={authSessionRemoved:true,refreshRejected:true,liveOwnerRecoveryDenied:true,legacySettingsReadUntilJwtExpiry:true,tokenLifetimeSeconds:report.tokenLifetimeSeconds};
  pass('Actual temporary Owner logout: refresh/session revoked; live-session recovery denied; legacy settings JWT window observed');
  await management('/database/query','POST',{query:`delete from public.dashboard_roles r using auth.users u where r.user_id=u.id and u.id='${a.id}' and u.raw_app_meta_data->>'batool_verification_run'='${run}' and r.role='owner'`});
  await expectRows(a,'business_settings','id,revision',0);await caseRead(a,403,'42501');pass('Removing only temporary Owner role immediately denies retained-JWT settings access');
 }
 report.anonymous='PENDING by user instruction; production anonymous provider remains disabled and was not changed';
 report.complete=true;report.evidenceLimit='No fixture orders: zero-row report/private-order requests do not prove populated-row filtering. Prior disposable populated-data evidence remains separate.';
}catch(error){report.failure={stage,category:error.name,reason:/^(Management |Production |Auth |Custom |Temporary |Actual |Only |Anonymous )/.test(error.message??'')?error.message:'Check unconfirmed; raw diagnostics suppressed',networkCode:error.cause?.code??null};console.error('STOP: '+stage+' — '+report.failure.reason);process.exitCode=1;}
finally{
 if(browser)await browser.close();let cleanup=true;
 if(management&&api&&service)try{
  const ids=await owned();for(const id of ids){
   const current=await api('/auth/v1/admin/users/'+id,{admin:true});need(current.status===200&&coalesceMarker(current.data)===run,'Cleanup ownership check failed');
   await management('/database/query','POST',{query:`delete from public.dashboard_roles r using auth.users u where r.user_id=u.id and u.id='${id}' and coalesce(u.raw_app_meta_data->>'batool_verification_run',u.raw_user_meta_data->>'batool_verification_run','')='${run}'`});
   const deleted=await api('/auth/v1/admin/users/'+id,{admin:true,method:'DELETE',body:{should_soft_delete:false}});need(deleted.status===200,'Temporary account cleanup unconfirmed');
  }
  need((await owned()).length===0);const after=await fingerprint();need(JSON.stringify(after)===JSON.stringify(baseline),'Existing data fingerprint changed');
  const auth=await management('/config/auth');need(auth.external_anonymous_users_enabled===false&&auth.disable_signup===originalAuth.disable_signup,'Auth provider configuration changed');
  const publicAuth=await api('/auth/v1/settings');need(publicAuth.status===200&&(publicAuth.data?.external?.anonymous_users??publicAuth.data?.external?.anonymous)===false,'Anonymous Auth public setting must remain disabled');
  report.productionAnonymousSignupDisabled=true;report.authConfigurationChanged=false;
  pass('Only run-owned accounts/roles removed; existing accounts, application data/stock and closed gates unchanged; production anonymous signup remains disabled');
 }catch{cleanup=false;}
 else if(baseline)cleanup=false;
 report.cleanup=cleanup;report.anonymousWindowStillChanged=false;
 report.complete=report.complete&&cleanup;
 if(!cleanup){console.error('STOP: cleanup/preservation unconfirmed; do not replay the batch blindly.');process.exitCode=1;}
 await mkdir(dir,{recursive:true});await writeFile(dir+run+'-session-result.json',JSON.stringify(report,null,2));await writeFile(dir+'latest-session-result.json',JSON.stringify(report,null,2));
}
function coalesceMarker(user){return user?.app_metadata?.batool_verification_run??user?.user_metadata?.batool_verification_run;}
