// Continue ONLY CORS/access/recovery checks after both hosted orders passed.
// Never recreates catalog/orders, reapplies migrations, or repeats completed
// settings/service-RPC/browser-order cases. Real temporary Auth sessions only.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {loadTarget,postgresEnvironment} from './hosted-verification-guard.mjs';
const results=[];let stage='owned pending-case prerequisites';
const need=value=>{if(!value)throw Error('Check unconfirmed');};
const pass=label=>{results.push({check:label,result:'PASS'});console.log('PASS '+label);};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
let successful=false,cleanup=true,target,sql,admin,browser,server,forbiddenServer;
const accounts=[];
try{
 target=await loadTarget('.tmp/hosted-acceptance/target.json');need(target.projectRef==='jcbxxgjrnkhgcspbscgb');
 const pgEnv=postgresEnvironment(target);
 sql=text=>new Promise((yes,no)=>{
  const p=spawn(process.env.BATOOL_HOSTED_PSQL,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:pgEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',()=>{});p.stdin.on('error',()=>{});p.on('error',()=>no(Error()));p.on('close',code=>code===0?yes(out.trim()):no(Error()));p.stdin.end(text);
 });
 const stats=JSON.parse(await sql(`begin read only;select json_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'contexts',(select count(*) from public.order_checkout_details),'stock',(select stock_quantity from public.product_variants where product_id=0 and size='M'),'auth',(select count(*) from auth.users),'roles',(select count(*) from public.dashboard_roles),'closed',(select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness),'owned',(select count(*)=1 and bool_and(project_ref='${target.projectRef}' and finished) from batool_acceptance.run));rollback;`));
 need(stats.orders===2&&stats.items===2&&stats.keys===2&&stats.customers===2&&stats.contexts===2&&stats.history===4&&stats.stock===3&&stats.auth===0&&stats.roles===0&&stats.closed&&stats.owned);
 const folder=new URL('../.tmp/hosted-acceptance/',import.meta.url);
 let orderEvidence=false;
 for(const entry of await readdir(folder,{withFileTypes:true}))if(entry.isDirectory()){
  try{const data=JSON.parse(await readFile(new URL(entry.name+'/results.json',folder),'utf8'));if(data.lastStage==='real browser CORS boundary'&&data.results.some(r=>r.check==='pinned replacement quote, concurrent creation and lost replacement response produce one additional order/deduction'&&r.result==='PASS'))orderEvidence=true;}catch{}
 }
 need(orderEvidence);console.log('Owned two-order evidence accepted; completed order/settings/RPC cases skipped.');

 stage='real CORS behavior';
 const {chromium}=await import(pathToFileURL(process.env.BATOOL_PLAYWRIGHT_MODULE).href);
 server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><title>Pending hosted CORS acceptance</title>');});
 forbiddenServer=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Disallowed test origin</title>');});
 await new Promise((yes,no)=>{server.once('error',no);server.listen(43871,'127.0.0.1',yes);});
 await new Promise((yes,no)=>{forbiddenServer.once('error',no);forbiddenServer.listen(0,'127.0.0.1',yes);});
 const preflight=await fetch(target.endpoint,{method:'OPTIONS',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Origin:target.origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
 need(preflight.status===204&&preflight.headers.get('access-control-allow-origin')===target.origin&&preflight.headers.get('access-control-allow-methods')?.split(/,\s*/).includes('POST')&&preflight.headers.get('access-control-allow-headers')?.split(/,\s*/).includes('content-type'));
 browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();await page.goto(target.origin);
 const body={action:'recover',scope:'invalid-capability',key:randomUUID()};
 const visible=await page.evaluate(async({endpoint,body})=>{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();return r.status===401&&['scope_required','scope_expired_or_invalid'].includes(b.error);},{endpoint:target.endpoint,body});need(visible);
 const other=await context.newPage();await other.goto(`http://127.0.0.1:${forbiddenServer.address().port}`);
 need(await other.evaluate(async({endpoint,body})=>{try{await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return false;}catch{return true;}},{endpoint:target.endpoint,body}));
 for(const method of ['OPTIONS','POST']){
  const r=await fetch(target.endpoint,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Origin:'https://not-allowed.invalid','Content-Type':'application/json',...(method==='OPTIONS'?{'Access-Control-Request-Method':'POST'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});need(r.status===403&&!r.headers.has('access-control-allow-origin'));
 }
 pass('actual allowed preflight/browser POST and forbidden browser/direct CORS boundaries');

 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})}};
 admin=createClient(target.projectUrl,process.env.BATOOL_HOSTED_SERVICE_KEY,options);
 const api=async(path,token,body,method=body===undefined?'GET':'POST')=>{
  const r=await fetch(target.projectUrl+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:process.env.BATOOL_HOSTED_PUBLISHABLE_KEY,...(token?{Authorization:`Bearer ${token}`} :{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>null)};
 };
 const rows=async(table,token,count,select='order_id')=>{const r=await api(`/rest/v1/${table}?select=${select}&limit=20`,token);need(r.status===200&&Array.isArray(r.data)&&r.data.length===count);return r.data;};
 const denied=async(path,token,body,method)=>{const r=await api(path,token,body,method);need([401,403].includes(r.status)&&r.data?.code==='42501');};
 stage='fresh session prerequisites for pending populated matrix';
 const runId=randomUUID();
 for(const role of ['owner','partner','unassigned','revoked']){
  const email=`${runId}-${role}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'owner'}});need(!created.error&&uuid.test(created.data.user?.id));
  const a={role,id:created.data.user.id};accounts.push(a);a.client=createClient(target.projectUrl,process.env.BATOOL_HOSTED_PUBLISHABLE_KEY,options);
  const login=await a.client.auth.signInWithPassword({email,password});need(!login.error&&login.data.session&&login.data.user.id===a.id);a.token=login.data.session.access_token;a.refresh=login.data.session.refresh_token;
  const verified=await a.client.auth.getUser();need(!verified.error&&verified.data.user.id===a.id&&!verified.data.user.is_anonymous);
  if(role!=='unassigned')await sql(`insert into public.dashboard_roles(user_id,role) values('${a.id}','${role==='partner'?'partner':'owner'}');`);
 }
 const client=createClient(target.projectUrl,process.env.BATOOL_HOSTED_PUBLISHABLE_KEY,options);const login=await client.auth.signInAnonymously();need(!login.error&&login.data.session&&uuid.test(login.data.user?.id));
 const anon={role:'anonymous-auth',id:login.data.user.id,client,token:login.data.session.access_token};accounts.push(anon);const verified=await client.auth.getUser();need(!verified.error&&verified.data.user.id===anon.id&&verified.data.user.is_anonymous);
 await sql(`insert into public.dashboard_roles(user_id,role) values('${anon.id}','owner');`);
 console.log('Fresh real sessions prepared for pending populated access checks; prior login/settings cases not replayed.');
 stage='populated actual-session authorization matrix';
 for(const a of accounts){
  const owner=['owner','revoked'].includes(a.role),partner=a.role==='partner';
  await rows('dashboard_roles',a.token,owner||partner?1:0,'user_id,role');
  const reports=await rows('orders',a.token,owner||partner?2:0,'id,currency,subtotal_minor,shipping_minor,total_minor,fulfillment_status,payment_status');
  need(reports.every(r=>Object.keys(r).sort().join()===['id','currency','subtotal_minor','shipping_minor','total_minor','fulfillment_status','payment_status'].sort().join()));
  for(const [table,count]of[['order_items',2],['order_customer_details',2],['order_status_history',4],['order_checkout_details',2]]){
   const data=await rows(table,a.token,owner?count:0,table==='order_customer_details'?'order_id,recipient_name,phone,address_line1':'order_id');
   if(owner&&table==='order_customer_details')need(data.every(r=>r.recipient_name==='Synthetic acceptance customer'&&r.phone==='923000000000'&&r.address_line1==='Synthetic fixture address'));
  }
  for(const table of ['business_settings','order_notification_settings'])await rows(table,a.token,owner?1:0,'id');
  await denied('/rest/v1/order_creation_keys?select=order_id',a.token);
  await denied('/rest/v1/orders?id=not.is.null',a.token,{fulfillment_status:'confirmed'},'PATCH');
  const embed=await api('/rest/v1/orders?select=id,order_customer_details(order_id),order_items(order_id),order_checkout_details(order_id)',a.token);need(embed.status===200&&embed.data.length===(owner||partner?2:0));
  if(partner)need(embed.data.every(r=>['order_customer_details','order_items','order_checkout_details'].every(k=>r[k]===null||(Array.isArray(r[k])&&r[k].length===0))));
  pass(`actual ${a.role==='revoked'?'Owner before revocation':a.role}: populated reports/private rows/settings isolation, private embeds and direct write denial`);
 }
 for(const table of ['orders','order_items','order_customer_details','order_status_history','order_checkout_details','order_creation_keys','business_settings','order_notification_settings'])await denied(`/rest/v1/${table}?select=${['orders','business_settings','order_notification_settings'].includes(table)?'id':'order_id'}`);
 pass('no-session anonymous object denial, separate from actual anonymous Auth');

 stage='actual logout and role revocation';
 const revoked=accounts.find(a=>a.role==='revoked'),owner=accounts.find(a=>a.role==='owner');
 const business=(await rows('business_settings',owner.token,1,'revision,settings'))[0];const notification=(await rows('order_notification_settings',owner.token,1,'revision'))[0];
 const out=await revoked.client.auth.signOut({scope:'local'});need(!out.error);revoked.signedOut=true;
 const refresh=await api('/auth/v1/token?grant_type=refresh_token',undefined,{refresh_token:revoked.refresh});need([400,401,403].includes(refresh.status)&&['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired'].includes(refresh.data?.error_code??refresh.data?.code));
 await rows('orders',revoked.token,2,'id');pass('actual logout revokes refresh; issued JWT retains mapped access until expiry');
 await sql(`delete from public.dashboard_roles where user_id='${revoked.id}' and role='owner';`);
 await rows('orders',revoked.token,0,'id');for(const table of ['order_items','order_customer_details','order_status_history','order_checkout_details'])await rows(table,revoked.token,0);for(const table of ['business_settings','order_notification_settings'])await rows(table,revoked.token,0,'id');
 await denied('/rest/v1/rpc/owner_save_business_settings',revoked.token,{p_expected_revision:business.revision,p_settings:business.settings});await denied('/rest/v1/rpc/owner_save_notification_settings',revoked.token,{p_expected_revision:notification.revision,p_settings:{emails:[],whatsapp_numbers:[]}});
 pass('live role revocation immediately denies retained JWT reports/private/settings access and Owner saves');

 stage='original replacement identity recovery with all intake closed';
 // Recover the ORIGINAL persisted replacement key/scope from the owned fixture.
 // A backend-signed test guest capability exercises real Edge recovery; this is
 // not a customer identity-verification/reissuance endpoint or Auth JWT forgery.
 const identity=JSON.parse(await sql(`begin read only;select json_build_object('scope',r.scope_id,'key',r.replacement_key,'order',q.order_id) from batool_checkout_internal.intent_resolutions r join batool_checkout_internal.quotes q on q.id=r.replacement_quote_id where q.order_id is not null limit 1;rollback;`));
 need(uuid.test(identity.scope)&&uuid.test(identity.key)&&uuid.test(identity.order));
 const secret=await readFile(new URL('../.tmp/hosted-acceptance/scope-secret.txt',import.meta.url),'utf8');const signed=`${identity.scope}.${Date.now()+6*86400000}`;const scope=signed+'.'+createHmac('sha256',secret).update(signed).digest('hex');
 const response=await fetch(target.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Origin:target.origin,'Content-Type':'application/json'},body:JSON.stringify({action:'recover',scope,key:identity.key})});const recovered=await response.json();need(response.status===200&&recovered.confirmed===true&&recovered.receipt.order_id===identity.order&&recovered.receipt.payment_status==='unpaid');
 pass('real Edge/PostgREST recovery uses original persisted replacement scope/key while Edge and database intake are off');
 successful=true;
}catch{console.error(`NOT COMPLETE: ${stage}. No overall acceptance pass inferred; raw diagnostics suppressed.`);process.exitCode=1;}
finally{
 for(const a of accounts){
  try{if(a.client&&!a.signedOut){const r=await a.client.auth.signOut({scope:'local'});need(!r.error);}}catch{cleanup=false;}
  try{const r=await admin.auth.admin.deleteUser(a.id);need(!r.error);}catch{cleanup=false;}
 }
 if(browser)await browser.close().catch(()=>{cleanup=false;});for(const s of [server,forbiddenServer])if(s?.listening)await new Promise(done=>{s.closeAllConnections();s.close(done);});
 if(sql)try{
  const clean=JSON.parse(await sql(`begin read only;select json_build_object('orders',(select count(*) from public.orders),'keys',(select count(*) from public.order_creation_keys),'stock',(select stock_quantity from public.product_variants where product_id=0 and size='M'),'users',(select count(*) from auth.users),'roles',(select count(*) from public.dashboard_roles),'closed',(select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness));rollback;`));need(clean.orders===2&&clean.keys===2&&clean.stock===3&&clean.users===0&&clean.roles===0&&clean.closed);
 }catch{cleanup=false;}
 results.push({check:'owned Auth identities removed; unchanged two orders/two deductions; database gates closed',result:cleanup?'PASS':'UNCONFIRMED'});
 await mkdir(new URL('../.tmp/hosted-acceptance/',import.meta.url),{recursive:true});await writeFile(new URL('../.tmp/hosted-acceptance/pending-access-results.json',import.meta.url),JSON.stringify({scope:'pending real hosted CORS / actual Auth-session access / closed-intake recovery',complete:successful&&cleanup,results,lastStage:stage,productionTouched:false},null,2));
 console.log(cleanup?'Cleanup confirmed: temporary Auth identities removed, two orders/two deductions unchanged, database gates closed.':'Cleanup UNCONFIRMED; inspect disposable identities and gates.');if(!cleanup)process.exitCode=1;
}
