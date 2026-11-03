// NEW recovery rehearsal only. Never deploys, calls production, replays 001–011,
// changes checkout readiness, or creates orders. Actual Auth + hosted PostgREST;
// changed Edge handler runs locally, NOT in hosted Edge. Credentials stay in memory.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { checkoutHandler, scopeSigner } from '../supabase/functions/_shared/checkout-handler.ts';
import { loadTarget, postgresEnvironment } from './hosted-verification-guard.mjs';
const checks=[];const accounts=[];let stage='target prerequisites',sql,admin,target,baseline,complete=false,cleanup=true;
const need=v=>{if(!v)throw Error('Unconfirmed check');};
const pass=label=>{checks.push({check:label,result:'PASS'});console.log('PASS '+label);};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const mode=process.argv[2]??'--check';
const output=new URL('../.tmp/hosted-acceptance/operational-recovery-results.json',import.meta.url);
try {
 target=await loadTarget('.tmp/hosted-acceptance/target.json');need(target.projectRef==='jcbxxgjrnkhgcspbscgb');
 need(['--check','--run','--continue'].includes(mode));
 need(process.env.BATOOL_HOSTED_SERVICE_KEY&&process.env.BATOOL_HOSTED_PUBLISHABLE_KEY&&process.env.BATOOL_HOSTED_PSQL);
 if(mode==='--check'){console.log('Disposable target/credential slots present; no network requests. New 012 only; no deployment or checkout fixtures.');process.exit(0);}
 const pg=postgresEnvironment(target);
 sql=text=>new Promise((yes,no)=>{
  const p=spawn(process.env.BATOOL_HOSTED_PSQL,['-X','-q','-A','-t','-F','\t','-v','ON_ERROR_STOP=1'],{env:pg,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';
  p.stdout.on('data',x=>out+=x);p.stderr.on('data',()=>{});p.stdin.on('error',()=>{});p.on('error',()=>no(Error()));p.on('close',code=>code===0?yes(out.trim()):no(Error()));p.stdin.end(text);
 });
 const stats=async()=>JSON.parse(await sql(`begin read only;select json_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'context',(select count(*) from public.order_checkout_details),'stock',(select stock_quantity from public.product_variants where product_id=0 and size='M'),'users',(select count(*) from auth.users),'roles',(select count(*) from public.dashboard_roles),'closed',(select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness));rollback;`));
 baseline=await stats();need(baseline.orders===2&&baseline.keys===2&&baseline.stock===3&&baseline.users===0&&baseline.roles===0&&baseline.closed);
 need(await sql(`select count(*)=1 and bool_and(project_ref='${target.projectRef}' and finished) from batool_acceptance.run;`)==='t');
 const migration=await readFile(new URL('../supabase/migrations/20261102001200_operational_checkout_recovery.sql',import.meta.url),'utf8');
 const fingerprint=createHash('sha256').update(migration).digest('hex');
 const exists=await sql("select to_regclass('batool_checkout_internal.recovery_cases') is not null;");
 if(mode==='--run'){
  need(exists==='f');stage='new 012 preflight and one-time disposable application';
  const pre=(await sql(await readFile(new URL('../supabase/tests/operational_recovery_preflight.sql',import.meta.url),'utf8'))).split(/\r?\n/).map(r=>r.split('\t'));
  need(pre.length===4&&pre.slice(0,3).every(r=>r[1]==='PASS'));
  await sql(migration);
  const post=(await sql(await readFile(new URL('../supabase/tests/operational_recovery_postflight.sql',import.meta.url),'utf8'))).split(/\r?\n/).map(r=>r.split('\t'));
  need(post.length===5&&post.slice(0,4).every(r=>r[1]==='PASS')&&JSON.stringify(JSON.parse(pre[3][1]))===JSON.stringify(JSON.parse(post[4][1])));
  await writeFile(output,JSON.stringify({complete:false,migrationSha256:fingerprint,checks,lastStage:stage,productionTouched:false},null,2));
  pass('new 012 disposable preflight/application/postflight; original orders/stock and closed gates unchanged');
 }else{
  need(exists==='t');const prior=JSON.parse(await readFile(output,'utf8'));need(!prior.complete&&prior.migrationSha256===fingerprint);
  checks.push(...prior.checks);console.log('Continuation skips migration and previously completed new cases.');
 }
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})}};
 admin=createClient(target.projectUrl,process.env.BATOOL_HOSTED_SERVICE_KEY,options);
 const api=async(name,args,actor=admin)=>{const result=await actor.rpc(name,args);if(result.error)throw Error('RPC denied/unconfirmed');return result.data;};
 const rejected=async(name,args,actor,code)=>{const r=await actor.rpc(name,args);need(r.error&&(!code||r.error.code===code));};
 const done=label=>checks.some(c=>c.check===label&&c.result==='PASS');
 const fresh=async role=>{
  const email=`${randomUUID()}-${role}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});need(!created.error&&uuid.test(created.data.user?.id));
  const account={id:created.data.user.id,role};accounts.push(account);account.client=createClient(target.projectUrl,process.env.BATOOL_HOSTED_PUBLISHABLE_KEY,options);
  const logged=await account.client.auth.signInWithPassword({email,password});need(!logged.error&&logged.data.session);account.token=logged.data.session.access_token;
  if(role!=='unassigned')await sql(`insert into public.dashboard_roles(user_id,role) values('${account.id}','${role==='partner'?'partner':'owner'}');`);
  return account;
 };
 stage='new live Owner recovery session prerequisites';
 const owner=await fresh('owner');const partner=await fresh('partner');const unassigned=await fresh('unassigned');const revoked=await fresh('revoked');
 const publicClient=createClient(target.projectUrl,process.env.BATOOL_HOSTED_PUBLISHABLE_KEY,options);
 const policy=randomUUID();await sql(`update batool_checkout_internal.recovery_controls set enabled=true,verification_policy_ref='${policy}' where id;`);
 const signer=await scopeSigner(randomBytes(48).toString('base64url'));
 const handler=checkoutHandler({enabled:false,recoveryEnabled:true,origins:new Set([target.origin]),signer,rpc:(name,args)=>api(name,args)});
 const guest=async(body)=>{
  const r=await handler(new Request('http://localhost/secure-checkout',{method:'POST',headers:{origin:target.origin,'content-type':'application/json'},body:JSON.stringify(body)}));
  return {status:r.status,body:await r.json()};
 };
 const open=async()=>{
  const c={id:randomUUID(),proof:randomBytes(32).toString('hex')};const r=await guest({action:'support_open',case_id:c.id,proof:c.proof});need(r.status===200&&r.body.state==='open');return c;
 };
 const read=c=>api('owner_recovery_case',{p_case:c.id},owner.client);
 const verify=async(c,quote=null,order=null,independently=true,revision=1)=>api('owner_verify_recovery',{
  p_case:c.id,p_revision:revision,p_decision:'verify',p_quote:quote,p_order:order,p_evidence:randomUUID(),p_independently_verified:independently},owner.client);
 const resolve=(c,revision=2)=>api('owner_resolve_recovery',{p_case:c.id,p_revision:revision},owner.client);
 const exchange=c=>guest({action:'support_result',case_id:c.id,proof:c.proof});
 const label1='new Owner recovery RPCs deny Partner/unassigned/public/service callers; raw escrow/audit inaccessible';
 if(!done(label1)){
  stage=label1;const c=await open();
  for(const actor of [partner.client,unassigned.client,publicClient,admin])for(const [name,args]of[
   ['owner_recovery_case',{p_case:c.id}],['owner_resolve_recovery',{p_case:c.id,p_revision:1}],
   ['owner_verify_recovery',{p_case:c.id,p_revision:1,p_decision:'verify',p_quote:randomUUID(),p_order:null,p_evidence:randomUUID(),p_independently_verified:true}]])await rejected(name,args,actor,'42501');
  for(const actor of [owner.client,partner.client,unassigned.client,publicClient])await rejected('checkout_support_result',{p_case:c.id,p_proof:c.proof},actor,'42501');
  need(await sql(`select not exists(select 1 from pg_roles r cross join (values('recovery_intents'),('recovery_cases'),('recovery_audit')) t(n) where r.rolname in('anon','authenticated','service_role') and has_table_privilege(r.oid,'batool_checkout_internal.'||t.n,'SELECT,INSERT,UPDATE,DELETE'));`)==='t');
  pass(label1);
 }
 const label2='independent verification and revision required; unknown original identity escalates without replacement';
 if(!done(label2)){
  stage=label2;const c=await open();
  await rejected('owner_verify_recovery',{p_case:c.id,p_revision:1,p_decision:'verify',p_quote:randomUUID(),p_order:null,p_evidence:randomUUID(),p_independently_verified:false},owner.client,'PT400');
  await rejected('owner_resolve_recovery',{p_case:c.id,p_revision:1},owner.client,'PT409');
  await rejected('owner_verify_recovery',{p_case:c.id,p_revision:999,p_decision:'escalate',p_quote:null,p_order:null,p_evidence:null,p_independently_verified:false},owner.client,'PT409');
  const result=await verify(c,randomUUID());need(result.state==='escalated');
  const check=await exchange(c);need(check.status===200&&check.body.state==='escalated'&&!check.body.scope&&!check.body.resolution);
  const wrong=await guest({action:'support_result',case_id:c.id,proof:randomBytes(32).toString('hex')});need(wrong.status===503||wrong.status===401);
  await rejected('owner_resolve_recovery',{p_case:c.id,p_revision:2},owner.client,'PT409');pass(label2);
 }
 const label3='lost-credential committed-order recovery returns original receipt; repeated operator/guest responses do not write orders or stock';
 if(!done(label3)){
  stage=label3;const order=await sql('select id from public.orders order by created_at limit 1;');need(uuid.test(order));const c=await open();
  const verified=await verify(c,null,order);need(verified.state==='verified'&&verified.audit.length===2);
  await resolve(c); // Deliberately discard successful real operator response.
  const replay=await resolve(c);need(replay.state==='committed'&&replay.audit.length===3);
  const first=await exchange(c),second=await exchange(c);need(first.status===200&&second.status===200&&first.body.resolution.receipt.order_id===order&&JSON.stringify(first.body)===JSON.stringify(second.body));
  need(!first.body.scope&&first.body.resolution.receipt.payment_status==='unpaid');pass(label3);
 }
 const label4='expired intent: new Owner resolution waits on creator locks, durably retires once, rejects old creation and reissues one replacement identity';
 if(!done(label4)){
  stage=label4;const quote=randomUUID(),scope=randomUUID(),key=randomUUID();
  await sql(`insert into batool_checkout_internal.quotes(id,scope_id,cart,snapshot,expires_at) select '${quote}','${scope}',cart,snapshot,clock_timestamp()-interval '1 hour' from batool_checkout_internal.quotes where order_id is not null limit 1;`);
  need(await api('checkout_register_intent',{p_scope:scope,p_key:key,p_quote:quote})===true);
  await rejected('checkout_register_intent',{p_scope:scope,p_key:randomUUID(),p_quote:quote},admin,'PT409');
  const c=await open();await verify(c,quote);
  const barrier=spawn(process.env.BATOOL_HOSTED_PSQL,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:pg,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const locked=new Promise((yes,no)=>{let buf='';barrier.stdout.on('data',x=>{buf+=x;if(buf.includes('LOCKED'))yes();});barrier.on('error',no);barrier.on('close',code=>{if(code!==0)no(Error());});});
  const finished=new Promise((yes,no)=>barrier.on('close',code=>code===0?yes():no(Error())));barrier.stderr.on('data',()=>{});
  barrier.stdin.end(`begin;select pg_advisory_xact_lock(hashtextextended('${scope}:'||encode(sha256(convert_to('${key}','UTF8')),'hex'),0));select 1 from batool_checkout_internal.quotes where id='${quote}' for update;select 'LOCKED';select pg_sleep(2);rollback;`);
  await locked;const start=Date.now();const retired=await resolve(c);need(Date.now()-start>800&&retired.state==='retired');await finished;
  const again=await resolve(c);need(again.audit.length===3&&again.state==='retired');
  const a=await exchange(c),b=await exchange(c);need(a.status===200&&b.status===200&&a.body.state==='retired'&&a.body.resolution.resolution_id===b.body.resolution.resolution_id&&a.body.resolution.replacement_key===b.body.resolution.replacement_key);
  need(await signer.verify(a.body.scope)===scope); // New secret, no usable old capability involved.
  await rejected('checkout_create',{p_scope:scope,p_key:key,p_quote:quote,p_customer:{}},admin,'PT409');
  await rejected('checkout_create',{p_scope:scope,p_key:randomUUID(),p_quote:quote,p_customer:{}},admin,'PT409');
  need(await sql(`select count(*)=1 from batool_checkout_internal.intent_resolutions where quote_id='${quote}';`)==='t');
  pass(label4);
 }
 const label5='new recovery RPCs deny logged-out retained JWT immediately and deny live role removal';
 if(!done(label5)){
  stage=label5;const c=await open();await api('owner_recovery_case',{p_case:c.id},revoked.client);
  need(!(await revoked.client.auth.signOut({scope:'local'})).error);revoked.signedOut=true;
  const retained=createClient(target.projectUrl,process.env.BATOOL_HOSTED_PUBLISHABLE_KEY,{...options,global:{...options.global,headers:{Authorization:`Bearer ${revoked.token}`}}});
  await rejected('owner_recovery_case',{p_case:c.id},retained,'42501');
  await sql(`delete from public.dashboard_roles where user_id='${owner.id}';`);await rejected('owner_recovery_case',{p_case:c.id},owner.client,'42501');
  pass(label5);
 }
 const label6='expired case proof blocks exchange; immutable audit and escrow reject modifications';
 if(!done(label6)){
  stage=label6;const c=await open();await sql(`update batool_checkout_internal.recovery_cases set expires_at=clock_timestamp()-interval '1 second' where id='${c.id}';`);
  await rejected('checkout_support_result',{p_case:c.id,p_proof:c.proof},admin,'PT401');
  for(const text of ['update batool_checkout_internal.recovery_audit set event=event;','delete from batool_checkout_internal.recovery_intents;']){
   let denied=false;try{await sql('begin;'+text+'rollback;');}catch{denied=true;}need(denied);
  }pass(label6);
 }
 complete=true;
}catch{console.error('NOT COMPLETE: '+stage+'. Raw provider responses/credentials suppressed; do not replay applied migrations.');process.exitCode=1;}
finally{
 if(sql){try{await sql('update batool_checkout_internal.recovery_controls set enabled=false,verification_policy_ref=null where id;');}catch{cleanup=false;}}
 for(const a of accounts){try{if(!a.signedOut)await a.client?.auth.signOut({scope:'local'});const r=await admin.auth.admin.deleteUser(a.id);need(!r.error);}catch{cleanup=false;}}
 if(sql&&baseline){try{
  const after=JSON.parse(await sql(`begin read only;select json_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'context',(select count(*) from public.order_checkout_details),'stock',(select stock_quantity from public.product_variants where product_id=0 and size='M'),'users',(select count(*) from auth.users),'roles',(select count(*) from public.dashboard_roles),'closed',(select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness));rollback;`));need(JSON.stringify(after)===JSON.stringify(baseline));
  need(await sql('select bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls;')==='t');
 }catch{cleanup=false;}}
 if(mode!=='--check'&&target)await writeFile(output,JSON.stringify({target:target.projectRef,complete:complete&&cleanup,lastStage:stage,checks,migrationSha256:createHash('sha256').update(await readFile(new URL('../supabase/migrations/20261102001200_operational_checkout_recovery.sql',import.meta.url))).digest('hex'),cleanup,productionTouched:false,evidence:'local changed handler + actual hosted Auth/PostgREST; synthetic lock barrier; no hosted Edge deployment'},null,2));
 if(!cleanup)process.exitCode=1;
 if(mode!=='--check')console.log(cleanup?'Cleanup: no new orders/deductions, temporary Auth removed, checkout/payment/recovery gates closed.':'Cleanup unconfirmed; inspect disposable gates/identities before continuing.');
}
