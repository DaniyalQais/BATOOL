// Only NEW 013/order-reference/admission regressions. Never calls production,
// replays 001–012, deploys another function or creates a committed fixture order.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {loadTarget,postgresEnvironment} from './hosted-verification-guard.mjs';
const dir=new URL('../.tmp/checkout-gap-fixes/',import.meta.url);
const resultPath=new URL('result.json',dir),migrationPath=new URL('../supabase/migrations/20261102001300_checkout_recovery_order_validation.sql',import.meta.url);
const sha=x=>createHash('sha256').update(x).digest('hex');
const need=v=>{if(!v)throw Error('Unconfirmed');};
const results=[],accounts=[];let stage='offline preparation',target,sql,admin,management,authOriginal,authChanged=false,baseline,complete=false,cleanup=true,deployed=false;
const mode=process.argv[2]??'--prepare';
const done=label=>results.some(r=>r.check===label&&r.result==='PASS');
async function save(extra={}){await writeFile(resultPath,JSON.stringify({target:target?.projectRef,complete:complete&&cleanup,lastStage:stage,results,cleanup,deployed,productionTouched:false,...extra},null,2));}
async function pass(label){results.push({check:label,result:'PASS'});console.log('PASS '+label);await save();}
try{
 need(['--prepare','--run','--continue'].includes(mode));target=await loadTarget('.tmp/hosted-acceptance/target.json');need(target.projectRef==='jcbxxgjrnkhgcspbscgb');await mkdir(dir,{recursive:true});
 const files=['src/features/checkout/model/contracts.ts','src/features/checkout/model/availability.ts','supabase/functions/_shared/checkout-handler.ts','supabase/functions/secure-checkout/index.ts'];
 const parts=[],sources=[],expected=[0,1,2,1];
 for(const [i,file]of files.entries()){const body=await readFile(new URL('../'+file,import.meta.url),'utf8');need(body.split(/\r?\n/).filter(l=>l.startsWith('import ')).length===expected[i]);sources.push({file,sha256:sha(body)});parts.push(body.replace(/^import .*;\r?\n/gm,''));}
 const bundle=parts.join('\n');const migration=await readFile(migrationPath,'utf8');
 if(mode==='--prepare'){
  await writeFile(new URL('secure-checkout.bundle.ts',dir),bundle);
  await writeFile(new URL('plan.json',dir),JSON.stringify({target:target.projectRef,endpoint:target.endpoint,origin:target.origin,sourceHashes:sources,bundleSha256:sha(bundle),newMigrationSha256:sha(migration),newMigration:'20261102001300_checkout_recovery_order_validation.sql',functions:['secure-checkout'],verify_jwt:false,productionWrites:false,changes:['Apply only new 013','Deploy changed secure-checkout to disposable only','Temporary test recovery/anonymous Auth enablement; intake/payment gates stay closed','Only new focused tests; finally close gates and remove temporary Auth']},null,2));
  console.log('Prepared exact disposable-only new regression/deployment artifacts; no network requests.');process.exit(0);
 }
 const plan=JSON.parse(await readFile(new URL('plan.json',dir),'utf8'));need(plan.bundleSha256===sha(bundle)&&plan.newMigrationSha256===sha(migration));
 try{const prior=JSON.parse(await readFile(resultPath,'utf8'));need(mode==='--continue'&&!prior.complete);results.push(...prior.results);deployed=prior.deployed===true;}catch(e){if(e.code!=='ENOENT')throw e;need(mode==='--run');}
 if(deployed)need(JSON.parse(await readFile(new URL('deployment.json',dir),'utf8')).bundleSha256===sha(bundle));
 const pg=postgresEnvironment(target);
 sql=body=>new Promise((yes,no)=>{const p=spawn(process.env.BATOOL_HOSTED_PSQL,['-X','-q','-A','-t','-F','\t','-v','ON_ERROR_STOP=1'],{env:pg,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',()=>{});p.stdin.on('error',()=>{});p.on('error',()=>no(Error()));p.on('close',code=>code===0?yes(out.trim()):no(Error()));p.stdin.end(body);});
 const stats=async()=>JSON.parse(await sql(`begin read only;select json_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'contexts',(select count(*) from public.order_checkout_details),'stock',(select stock_quantity from public.product_variants where product_id=0 and size='M'),'users',(select count(*) from auth.users),'roles',(select count(*) from public.dashboard_roles),'closed',(select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness),'recovery_closed',(select bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls));rollback;`));
 stage='owned disposable prerequisites';baseline=await stats();need(baseline.orders===2&&baseline.keys===2&&baseline.stock===3&&baseline.users===0&&baseline.roles===0&&baseline.closed&&baseline.recovery_closed);
 const evidence=JSON.parse(await readFile(new URL('../.tmp/hosted-acceptance/operational-recovery-results.json',import.meta.url),'utf8'));need(evidence.complete&&evidence.cleanup);
 need(await sql(`select count(*)=1 and bool_and(project_ref='${target.projectRef}' and finished) from batool_acceptance.run;`)==='t');
 const token=process.env.BATOOL_HOSTED_MANAGEMENT_TOKEN;need(token);
 management=async(path,method='GET',body,raw=false)=>{const form=body instanceof FormData;const r=await fetch('https://api.supabase.com/v1/projects/'+target.projectRef+path,{method,redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${token}`,...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('Management request unconfirmed');if(raw)return{body:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')};const text=await r.text();return text.trim()?JSON.parse(text):null;};
 need(((await management('')).id??'')===target.projectRef);
 const label1='new 013 one-time disposable application preserves existing data and restricted grants';
 if(!done(label1)){
  stage=label1;
  const pre=(await sql(await readFile(new URL('../supabase/tests/recovery_order_validation_preflight.sql',import.meta.url),'utf8'))).split(/\r?\n/).map(r=>r.split('\t'));
  need(pre.length===4&&pre.slice(0,3).every(r=>r[1]==='PASS'));await sql(migration);
  const post=(await sql(await readFile(new URL('../supabase/tests/recovery_order_validation_postflight.sql',import.meta.url),'utf8'))).split(/\r?\n/).map(r=>r.split('\t'));
  need(post.length===4&&post.slice(0,3).every(r=>r[1]==='PASS')&&JSON.stringify(JSON.parse(pre[3][1]))===JSON.stringify(JSON.parse(post[3][1])));await pass(label1);
 }
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})}};
 admin=createClient(target.projectUrl,process.env.BATOOL_HOSTED_SERVICE_KEY,options);
 const rpc=async(name,args,client=admin)=>{const r=await client.rpc(name,args);need(!r.error);return r.data;};
 const denied=async(name,args,client,code='42501')=>{const r=await client.rpc(name,args);if(r.error?.code!==code)await writeFile(new URL('denial-diagnostic.json',dir),JSON.stringify({rpc:name,expectedCode:code,actualCode:/^[a-zA-Z0-9_]{1,60}$/.test(r.error?.code??'')?r.error.code:null,stage},null,2));need(r.error?.code===code);};
 const fresh=async role=>{
  const email=`${randomUUID()}-${role}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});need(!created.error&&created.data.user);const a={id:created.data.user.id,role};accounts.push(a);
  a.client=createClient(target.projectUrl,process.env.BATOOL_HOSTED_PUBLISHABLE_KEY,options);const login=await a.client.auth.signInWithPassword({email,password});need(!login.error&&login.data.session);
  a.claims=JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1],'base64url').toString());need(a.claims.sub===a.id&&/^[0-9a-f-]{36}$/.test(a.claims.session_id));
  need(!(await a.client.auth.getUser()).error);if(role!=='unassigned')await sql(`insert into public.dashboard_roles(user_id,role) values('${a.id}','${role}');`);return a;
 };
 stage='fresh sessions for changed RPC coverage';const owner=await fresh('owner');
 const label2='new rollback regression blocks foundation and legacy unsupported cases without weakening verification or changing orders/stock';
 if(!done(label2)){
  stage=label2;await sql(`set batool.test_disposable='yes';set batool.probe_user='${owner.id}';set batool.probe_session='${owner.claims.session_id}';\n`+await readFile(new URL('../supabase/tests/recovery_order_validation.sql',import.meta.url),'utf8'));await pass(label2);
 }
 const label3='changed secure-checkout deployed only to disposable; previous artifact retained';
 if(!done(label3)){
  stage=label3;const prior=await management('/functions/secure-checkout');need(prior.slug==='secure-checkout'&&prior.verify_jwt===false);
  const backup=await management('/functions/secure-checkout/body','GET',undefined,true);
  await writeFile(new URL('previous-function-body.bin',dir),backup.body);await writeFile(new URL('previous-function-metadata.json',dir),JSON.stringify({target:target.projectRef,slug:prior.slug,version:prior.version,verify_jwt:prior.verify_jwt,contentType:backup.type,bodySha256:sha(backup.body)},null,2));
  const secret=await readFile(new URL('../.tmp/hosted-acceptance/scope-secret.txt',import.meta.url),'utf8');need(/^[A-Za-z0-9_-]{64}$/.test(secret));
  await management('/secrets','POST',[{name:'BATOOL_CHECKOUT_ENABLED',value:'false'},{name:'BATOOL_RECOVERY_ENABLED',value:'false'},{name:'BATOOL_CHECKOUT_ORIGINS',value:target.origin},{name:'BATOOL_CHECKOUT_SCOPE_SECRET',value:secret}]);
  const form=new FormData();form.append('metadata',JSON.stringify({name:'secure-checkout',entrypoint_path:'index.ts',verify_jwt:false}));form.append('file',new Blob([bundle],{type:'application/typescript'}),'index.ts');
  const deployment=await management('/functions/deploy?slug=secure-checkout','POST',form);need(deployment.slug==='secure-checkout'&&deployment.verify_jwt===false);deployed=true;
  await writeFile(new URL('deployment.json',dir),JSON.stringify({target:target.projectRef,slug:deployment.slug,version:deployment.version,bundleSha256:sha(bundle),sourceHashes:sources},null,2));await pass(label3);
 }
 const edge=async(body,extra={})=>{const r=await fetch(target.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{origin:target.origin,'content-type':'application/json',...extra},body:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>null)};};
 // Wait for this deployed version's new admission footprint, not just HTTP 200.
 stage='changed runtime readiness';let ready=false;
 for(let i=0;i<8;i++){const r=await edge({action:'availability'});if(r.status===200&&r.body?.enabled===false&&Array.isArray(r.body.methods)&&r.body.methods.length===0){ready=true;break;}if(![404,503].includes(r.status))throw Error();await new Promise(done=>setTimeout(done,1500));}need(ready);
 const label4='hosted availability and spoofed-header burst share one server-selected bucket, enforce 30/minute and reveal no private fields';
 if(!done(label4)){
  stage=label4;
  // Fresh minute prevents confusing an earlier completed/partial test's budget.
  const remaining=60000-Date.now()%60000;console.log('Waiting for one fresh limiter window; no completed suite repeats.');await new Promise(done=>setTimeout(done,remaining+150));
  const started=Date.now();const responses=[];const transportErrors=[];
  for(let offset=0;offset<32;offset+=8){const settled=await Promise.allSettled(Array.from({length:8},(_,n)=>edge({action:'availability'},{'x-forwarded-for':`198.51.100.${offset+n+1}`})));for(const r of settled)if(r.status==='fulfilled')responses.push(r.value);else transportErrors.push(r.reason?.name??'unknown');}
  await writeFile(new URL('burst-diagnostics.json',dir),JSON.stringify({elapsedMs:Date.now()-started,sameMinute:Math.floor(started/60000)===Math.floor(Date.now()/60000),statuses:responses.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{}),transportErrorNames:transportErrors,recognizedBodies:responses.filter(r=>JSON.stringify(r.body)==='{"enabled":false,"methods":[]}'||JSON.stringify(r.body)==='{"error":"rate_limited"}').length},null,2));
  need(transportErrors.length===0&&Math.floor(started/60000)===Math.floor(Date.now()/60000));
  need(responses.filter(r=>r.status===200).length===30&&responses.filter(r=>r.status===429).length===2);
  need(responses.every(r=>r.status===200?JSON.stringify(r.body)==='{"enabled":false,"methods":[]}':JSON.stringify(r.body)==='{"error":"rate_limited"}'));
  const rows=JSON.parse(await sql(`select json_build_object('cohorts',(select count(*) from batool_checkout_internal.rate_windows where window_start=floor(extract(epoch from clock_timestamp())/60) and bucket<>'global'),'hits',(select max(hits) from batool_checkout_internal.rate_windows where window_start=floor(extract(epoch from clock_timestamp())/60) and bucket<>'global'));`));
  need(rows.cohorts===1&&rows.hits===32);await pass(label4);
 }
 const policy=randomUUID();await sql(`update batool_checkout_internal.recovery_controls set enabled=true,verification_policy_ref='${policy}' where id;`);
 await management('/secrets','POST',[{name:'BATOOL_RECOVERY_ENABLED',value:'true'}]);
 const label5='actual Owner changed RPC and hosted Edge recover a checkout-backed committed order; retries preserve receipt and stock';
 const label6='changed RPCs deny Partner, unassigned, actual anonymous Auth and direct service access to wrappers/private helpers';
 const caseId=randomUUID(),proof=randomBytes(32).toString('hex');
 stage='changed hosted support route readiness';let opened=false;
 for(let i=0;i<8;i++){const r=await edge({action:'support_open',case_id:caseId,proof});if(r.status===200&&r.body?.case_id===caseId){opened=true;break;}if(r.status!==503)throw Error();await new Promise(done=>setTimeout(done,1500));}need(opened);
 const order=await sql('select id from public.orders order by id limit 1;');
 if(!done(label5)){
  stage=label5;const verified=await rpc('owner_verify_recovery',{p_case:caseId,p_revision:1,p_decision:'verify',p_quote:null,p_order:order,p_evidence:randomUUID(),p_independently_verified:true},owner.client);need(verified.state==='verified');
  await rpc('owner_resolve_recovery',{p_case:caseId,p_revision:2},owner.client); // Deliberately ignore response before same-case retry.
  const retry=await rpc('owner_resolve_recovery',{p_case:caseId,p_revision:2},owner.client);need(retry.state==='committed');
  const first=await edge({action:'support_result',case_id:caseId,proof}),second=await edge({action:'support_result',case_id:caseId,proof});
  need(first.status===200&&second.status===200&&first.body.state==='committed'&&first.body.resolution.receipt.order_id===order&&JSON.stringify(first.body)===JSON.stringify(second.body)&&!first.body.scope);
  const unavailable=await edge({action:'scope'});need(unavailable.status===503);await pass(label5);
 }
 if(!done(label6)){
  stage=label6+': Partner/unassigned session prerequisites';const partner=await fresh('partner'),unassigned=await fresh('unassigned');
  stage=label6+': Auth configuration';
  authOriginal=await management('/config/auth');need(authOriginal.security_captcha_enabled!==true);
  if(authOriginal.external_anonymous_users_enabled!==true){await management('/config/auth','PATCH',{external_anonymous_users_enabled:true});authChanged=true;}
  stage=label6+': actual anonymous session issuance';
  const anonClient=createClient(target.projectUrl,process.env.BATOOL_HOSTED_PUBLISHABLE_KEY,options);let login;
  for(let attempt=0;attempt<8;attempt++){
   login=await anonClient.auth.signInAnonymously();if(!login.error)break;
   await writeFile(new URL('anonymous-issuance-diagnostic.json',dir),JSON.stringify({attempt,errorCode:/^[a-zA-Z0-9_]{1,60}$/.test(login.error.code??'')?login.error.code:null},null,2));
   if(login.error.code!=='anonymous_provider_disabled')break;
   await new Promise(done=>setTimeout(done,2000));
  }
  need(!login.error&&login.data.user&&login.data.user.is_anonymous);
  const anon={id:login.data.user.id,client:anonClient};accounts.push(anon);await sql(`insert into public.dashboard_roles(user_id,role) values('${anon.id}','owner');`);
  const publicClient=createClient(target.projectUrl,process.env.BATOOL_HOSTED_PUBLISHABLE_KEY,options);
  for(const [role,client] of [['partner',partner.client],['unassigned',unassigned.client],['anonymous-auth',anonClient],['no-session',publicClient],['service',admin]]){
   stage=label6+': '+role+' boundaries';
   await denied('owner_verify_recovery',{p_case:caseId,p_revision:1,p_decision:'verify',p_quote:null,p_order:order,p_evidence:randomUUID(),p_independently_verified:true},client);
   await denied('owner_resolve_recovery',{p_case:caseId,p_revision:1},client);
  }
  stage=label6+': private grant boundaries';
  need(await sql(`select not exists(select 1 from pg_roles r cross join (values('batool_checkout_internal.supported_checkout_order(uuid)'),('batool_checkout_internal.verify_recovery_v012(uuid,integer,text,uuid,uuid,uuid,boolean)'),('batool_checkout_internal.resolve_recovery_v012(uuid,integer)')) f(signature) where r.rolname in('anon','authenticated','service_role') and has_function_privilege(r.oid,f.signature,'EXECUTE'));`)==='t');await pass(label6);
 }
 complete=true;
}catch{console.error('NOT COMPLETE: '+stage+'. Raw diagnostics suppressed; inspect saved progress before continuation, never replay accepted migrations.');process.exitCode=1;}
finally{
 if(management){try{await management('/secrets','POST',[{name:'BATOOL_CHECKOUT_ENABLED',value:'false'},{name:'BATOOL_RECOVERY_ENABLED',value:'false'}]);}catch{cleanup=false;}}
 if(authChanged)try{await management('/config/auth','PATCH',{external_anonymous_users_enabled:authOriginal.external_anonymous_users_enabled===true});}catch{cleanup=false;}
 if(sql)try{await sql('update batool_checkout_internal.recovery_controls set enabled=false,verification_policy_ref=null where id;');}catch{cleanup=false;}
 for(const a of accounts){try{await a.client?.auth.signOut({scope:'local'});need(!(await admin.auth.admin.deleteUser(a.id)).error);}catch{cleanup=false;}}
 if(sql&&baseline)try{
  const after=JSON.parse(await sql(`select json_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'contexts',(select count(*) from public.order_checkout_details),'stock',(select stock_quantity from public.product_variants where product_id=0 and size='M'),'users',(select count(*) from auth.users),'roles',(select count(*) from public.dashboard_roles),'closed',(select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness),'recovery_closed',(select bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls));`));need(JSON.stringify(after)===JSON.stringify(baseline));
  if(deployed){const r=await fetch(target.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{origin:target.origin,'content-type':'application/json'},body:'{"action":"scope"}'});need(r.status===503);const secrets=await management('/secrets');for(const name of ['BATOOL_CHECKOUT_ENABLED','BATOOL_RECOVERY_ENABLED'])need(secrets.some(s=>s.name===name&&(s.digest===sha('false')||s.value===sha('false')||s.value==='false')));}
 }catch{cleanup=false;}
 if(mode!=='--prepare'&&target){await save();console.log(cleanup?'Closure confirmed: original orders/stock unchanged, temporary Auth removed, all disposable intake/payment/recovery gates off.':'Closure UNCONFIRMED; inspect only disposable state.');if(!cleanup)process.exitCode=1;}
}
