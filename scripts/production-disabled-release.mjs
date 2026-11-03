// Explicitly authorized closed production release. No migration, Auth writes,
// order/recovery mutations, business-setting writes, or fixture runners.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
const ref='cydnirqrsjrlljrjfidq', origin='https://batool-lake.vercel.app';
const projectUrl=`https://${ref}.supabase.co`, endpoint=projectUrl+'/functions/v1/secure-checkout';
const dir=new URL('../.tmp/production-disabled-release/',import.meta.url);
const sha=v=>createHash('sha256').update(v).digest('hex');
const need=(value,label)=>{if(!value)throw Error(label);};
async function preserveJson(name,value){const file=new URL(name,dir);try{const previous=JSON.parse(await readFile(file,'utf8'));need(JSON.stringify(previous)===JSON.stringify(value),'Prior backup differs; stop for review');}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(file,JSON.stringify(value,null,2),{flag:'wx'});}}
async function dotenv(file){const result={};for(const line of (await readFile(new URL('../'+file,import.meta.url),'utf8')).split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(m)result[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}return result;}
const report={project:ref,origin,checks:[],mutations:[],complete:false};
let stage='configuration';
const pass=label=>{report.checks.push(label);console.log('PASS: '+label);};
try {
 await mkdir(dir,{recursive:true});
 const mode=process.argv[2];need(['--inspect','--deploy-backend','--verify-backend'].includes(mode),'Explicit mode required');
 const hosted=await dotenv('.env.hosted.local'),local=await dotenv('.env.local');
 need(local.SUPABASE_URL===projectUrl,'Local production binding mismatch');
 need(hosted.BATOOL_HOSTED_MANAGEMENT_TOKEN,'Management access missing');
 const management=async(path,method='GET',body,binary=false)=>{
  const form=body instanceof FormData;
  const response=await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{method,headers:{Authorization:`Bearer ${hosted.BATOOL_HOSTED_MANAGEMENT_TOKEN}`,...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
  need(response.ok,`Management ${method} ${path}: HTTP ${response.status}`);
  if(binary)return new Uint8Array(await response.arrayBuffer());
  const text=await response.text();return text.trim()?JSON.parse(text):null;
 };
 const gateQuery=`select jsonb_build_object(
  'readiness_closed',(select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness),
  'recovery_closed',(select count(*)=1 and bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls),
  'preferences_closed',(select count(*)=1 and bool_and(not (settings->>'cod_enabled')::boolean and not (settings->>'easypaisa_enabled')::boolean and not (settings->>'jazzcash_enabled')::boolean) from public.business_settings),
  'counts',jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'context',(select count(*) from public.order_checkout_details),'products',(select count(*) from public.products),'variants',(select count(*) from public.product_variants),'cases',(select count(*) from batool_checkout_internal.recovery_cases),'audit',(select count(*) from batool_checkout_internal.recovery_audit)),
  'stock_digest',(select md5(coalesce(jsonb_agg(jsonb_build_array(product_id,size,stock_quantity) order by product_id,size)::text,'[]')) from public.product_variants)) as evidence`;
 const gates=async()=>{
  const rows=await management('/database/query/read-only','POST',{query:gateQuery});
  need(Array.isArray(rows)&&rows.length===1,'Database evidence shape');
  const result=rows[0].evidence;need(result?.readiness_closed&&result?.recovery_closed&&result?.preferences_closed,'Production gates must already be closed');return result;
 };
 stage='production identity';const identity=await management('');need((identity.id??identity.ref)===ref,'Project identity mismatch');pass('Exact production project binding');
 if(mode==='--inspect'){
  stage='prior function inventory';const functions=await management('/functions');need(Array.isArray(functions),'Function inventory shape');
  const previous=functions.find(f=>f.slug==='secure-checkout'||f.name==='secure-checkout')??null;
  await preserveJson('previous-function.json',previous);
  if(previous){const body=await management('/functions/secure-checkout/body','GET',undefined,true);need(body.length>0,'Previous function body empty');await writeFile(new URL('previous-function-body.bin',dir),body,{flag:'wx'});}
  pass(previous?'Prior secure-checkout metadata/body retained':'No prior secure-checkout function exists; recorded absence');
  stage='prior secret inventory';const secrets=await management('/secrets');need(Array.isArray(secrets),'Secret inventory shape');
  await preserveJson('previous-secret-digests.json',secrets.map(s=>({name:s.name,value:s.value})));
  report.existingCustomNames=secrets.filter(s=>s.name.startsWith('BATOOL_')).map(s=>s.name);
  stage='closed database baseline';const baseline=await gates();await writeFile(new URL('baseline.json',dir),JSON.stringify(baseline,null,2),{flag:'wx'});pass('Database readiness/recovery/payment preferences closed; aggregate baseline retained');
  report.previousFunctionExists=!!previous;
  report.complete=true;
 }else if(mode==='--deploy-backend'){
  stage='accepted inspection';const inspection=JSON.parse(await readFile(new URL('inspect-result.json',dir),'utf8'));need(inspection.complete&&inspection.project===ref,'Completed production inspection required');
  await gates();
  const priorSecrets=JSON.parse(await readFile(new URL('previous-secret-digests.json',dir),'utf8'));
  need(!inspection.previousFunctionExists,'Existing function requires reviewed artifact restoration before replacement');
  need(!priorSecrets.some(s=>s.name==='BATOOL_CHECKOUT_SCOPE_SECRET'),'Existing signing secret must not be overwritten');
  const manifest=JSON.parse(await readFile(new URL('../.tmp/production-checkout/deployment-plan.json',import.meta.url),'utf8'));
  need(manifest.projectRef===ref&&manifest.function==='secure-checkout'&&manifest.verify_jwt===false,'Reviewed bundle binding');
  for(const source of manifest.sources)need(sha(await readFile(new URL('../'+source.file,import.meta.url)))===source.sha256,'Source changed since preparation');
  const bundle=await readFile(new URL('../.tmp/production-checkout/secure-checkout.bundle.ts',import.meta.url),'utf8');
  need(sha(bundle)==='0a429f7c2957adf8add55ad4086c9182e431a803d268e75c2238252d3ee61f4b','Unexpected reviewed bundle hash');
  const secret=randomBytes(48).toString('base64url');
  await writeFile(new URL('production-scope-secret.private',dir),secret,{flag:'wx',mode:0o600});
  stage='closed Edge configuration';await management('/secrets','POST',[{name:'BATOOL_CHECKOUT_ENABLED',value:'false'},{name:'BATOOL_RECOVERY_ENABLED',value:'false'},{name:'BATOOL_CHECKOUT_ORIGINS',value:origin},{name:'BATOOL_CHECKOUT_SCOPE_SECRET',value:secret}]);report.mutations.push('Only four approved BATOOL Edge secrets configured; both release flags false');
  stage='single function deployment';const form=new FormData();form.set('metadata',JSON.stringify({name:'secure-checkout',entrypoint_path:'index.ts',verify_jwt:false}));form.set('file',new Blob([bundle],{type:'application/typescript'}),'index.ts');
  const deployment=await management('/functions/deploy?slug=secure-checkout','POST',form);
  await writeFile(new URL('deployed-function.json',dir),JSON.stringify(deployment,null,2));report.mutations.push('Deployed secure-checkout only');report.bundleSha256=sha(bundle);report.complete=true;
 }else{
  stage='deployed function verification';const functions=await management('/functions');const deployed=functions.find(f=>f.slug==='secure-checkout'||f.name==='secure-checkout');need(deployed?.verify_jwt===false&&deployed.status==='ACTIVE','Active deployed guest-capability function required');
  const saved=JSON.parse(await readFile(new URL('deployed-function.json',dir),'utf8'));need(saved.id===deployed.id&&saved.version===deployed.version,'Unexpected deployed function/version');pass('Deployed function identity/version and verify_jwt=false');
  const values=await management('/secrets');const expected={BATOOL_CHECKOUT_ENABLED:'false',BATOOL_RECOVERY_ENABLED:'false',BATOOL_CHECKOUT_ORIGINS:origin,BATOOL_CHECKOUT_SCOPE_SECRET:await readFile(new URL('production-scope-secret.private',dir),'utf8')};
  for(const [name,value]of Object.entries(expected))need(values.find(s=>s.name===name)?.value===sha(value),'Deployed configuration digest mismatch');pass('Exact origin/signing configuration and both backend flags false');
  stage='unchanged database evidence';const baseline=JSON.parse(await readFile(new URL('baseline.json',dir),'utf8')),after=await gates();need(JSON.stringify(baseline)===JSON.stringify(after),'Database aggregate/stock baseline changed');pass('Database gates, counts and stock digest unchanged');
  stage='read-only HTTP boundaries';
  for(const [label,method,site,status]of [['approved origin CORS','OPTIONS',origin,204],['excluded old origin','OPTIONS','https://batool-atelier.foamyelk1024.chatgpt.site',403],['non-POST rejection','GET',origin,405]]){
   const response=await fetch(endpoint,{method,headers:{Origin:site,...(method==='OPTIONS'?{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}:{})},redirect:'error',signal:AbortSignal.timeout(20000)});
   need(response.status===status,label+' status');need(response.headers.get('access-control-allow-origin')===(site===origin?origin:null),label+' origin');pass(label);
  }
  // scope is rejected before signing/admission/RPC while intake is disabled.
  const closed=await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"action":"scope"}',redirect:'error',signal:AbortSignal.timeout(20000)});
  need(closed.status===503&&(await closed.json()).error==='checkout_unavailable','Disabled intake rejection');pass('Disabled scope rejected before any database mutation');
  report.complete=true;
 }
}catch(error){report.failure={stage,reason:error?.message?.startsWith('Management ')||/^(Existing|Unexpected|Production gates|Source changed|Project identity|Database aggregate)/.test(error?.message??'')?error.message:'Check unconfirmed; raw diagnostics suppressed'};console.error('STOP: '+stage+' — '+report.failure.reason);process.exitCode=1;}
finally{await writeFile(new URL(`${(process.argv[2]??'unknown').slice(2)}-result.json`,dir),JSON.stringify(report,null,2));}
