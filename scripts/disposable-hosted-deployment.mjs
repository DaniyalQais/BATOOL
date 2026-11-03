// Disposable project only. Offline preparation is the default. Management
// credentials never enter the function bundle, browser, logs or shell arguments.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {loadTarget} from './hosted-verification-guard.mjs';
const dir=new URL('../.tmp/hosted-acceptance/',import.meta.url);
const hash=v=>createHash('sha256').update(v).digest('hex');
let stage='local deployment preparation';
try{
 const mode=process.argv[2]??'--prepare';
 if(!['--prepare','--run','--resume-pending','--remaining-access','--disable'].includes(mode)||process.argv.length>3)throw Error('Usage');
 const target=await loadTarget('.tmp/hosted-acceptance/target.json');
 if(target.projectRef!=='jcbxxgjrnkhgcspbscgb')throw Error('Reviewed target required');
 await mkdir(dir,{recursive:true});
 const files=['src/features/checkout/model/contracts.ts','supabase/functions/_shared/checkout-handler.ts','supabase/functions/secure-checkout/index.ts'];
 const parts=[];const sources=[];
 for(const file of files){
  const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  sources.push({file,sha256:hash(source)});
  // Exactly the two local one-line imports are inlined; no external dependency.
  const imports=source.split(/\r?\n/).filter(line=>line.startsWith('import '));
  if(file.endsWith('contracts.ts')?imports.length!==0:imports.length!==1)throw Error('Unexpected imports');
  parts.push(source.replace(/^import .*;\r?\n/gm,''));
 }
 const bundle='// Disposable hosted acceptance only; no embedded credentials.\n'+parts.join('\n');
 const metadata={name:'secure-checkout',entrypoint_path:'index.ts',verify_jwt:false};
 await writeFile(new URL('secure-checkout.bundle.ts',dir),bundle);
 await writeFile(new URL('deployment-plan.json',dir),JSON.stringify({target:target.projectRef,endpoint:target.endpoint,metadata,sources,bundleSha256:hash(bundle),changes:['Deploy only secure-checkout','Set isolated BATOOL checkout origin/scope/intake secrets','Temporarily allow anonymous Auth only in disposable project','Run hosted fixture batch; finally disable Edge intake and restore anonymous setting']},null,2));
 let scopeSecret;
 try{scopeSecret=await readFile(new URL('scope-secret.txt',dir),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;scopeSecret=randomBytes(48).toString('base64url');await writeFile(new URL('scope-secret.txt',dir),scopeSecret,{flag:'wx'});}
 if(!/^[A-Za-z0-9_-]{64}$/.test(scopeSecret))throw Error('Private scope secret invalid');
 if(mode==='--prepare'){
  console.log('Prepared exact-target single-file function bundle, source hashes, deployment plan and private scope secret. No remote requests or configuration changes.');
 }else{
  const token=process.env.BATOOL_HOSTED_MANAGEMENT_TOKEN||process.env.SUPABASE_ACCESS_TOKEN;
  if(!token){console.log('NOT RUN: disposable Management API token missing. Configure it privately; do not share it.');process.exitCode=2;}
  else{
   const request=async(path,method='GET',body)=>{
    const form=body instanceof FormData;
    const response=await fetch(`https://api.supabase.com/v1/projects/${target.projectRef}${path}`,{method,redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${token}`,...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Error('Management request failed');
    const text=await response.text();
    return text.trim()?JSON.parse(text):null;
   };
   const secrets=enabled=>request('/secrets','POST',[{name:'BATOOL_CHECKOUT_ENABLED',value:enabled?'true':'false'},...(enabled?[{name:'BATOOL_CHECKOUT_ORIGINS',value:target.origin},{name:'BATOOL_CHECKOUT_SCOPE_SECRET',value:scopeSecret}]:[])]);
   if(mode==='--disable'){
    stage='disposable intake closure';await secrets(false);console.log('Disposable Edge intake disabled. No deployment or fixture batch run.');
   }else{
    stage='disposable management identity';
    const project=await request('');if((project.id??project.ref)!==target.projectRef)throw Error('Project mismatch');
    stage='disposable Auth configuration review';
    const original=await request('/config/auth');
    if(Object.entries(original).some(([key,value])=>/^hook_.*_enabled$/.test(key)&&value===true))throw Error('Custom Auth hooks require separate review');
    if(original.external_email_enabled!==true)throw Error('Email/password provider unavailable');
    if(original.security_captcha_enabled===true)throw Error('Captcha requires separate disposable test configuration');
    let batchOK=false,closureOK=true,authChanged=false;
    try{
     stage='disposable Edge configuration';await secrets(false);
     await request('/secrets','POST',[{name:'BATOOL_CHECKOUT_ORIGINS',value:target.origin},{name:'BATOOL_CHECKOUT_SCOPE_SECRET',value:scopeSecret}]);
     if(original.external_anonymous_users_enabled!==true){await request('/config/auth','PATCH',{external_anonymous_users_enabled:true});authChanged=true;}
     stage='single-function disposable deployment';
     let deployed;
     if(mode==='--resume-pending'||mode==='--remaining-access'){
      const previous=JSON.parse(await readFile(new URL('deployment-run-result.json',dir),'utf8'));
      if(previous.target!==target.projectRef||previous.bundleSha256!==hash(bundle)||!previous.edgeAndAuthClosureConfirmed)throw Error('Continuation artifact or cleanup mismatch');
      deployed=await request('/functions/secure-checkout');
     }else{
      const form=new FormData();form.append('metadata',JSON.stringify(metadata));form.append('file',new Blob([bundle],{type:'application/typescript'}),'index.ts');
      deployed=await request('/functions/deploy?slug=secure-checkout','POST',form);
     }
     if(deployed.slug!=='secure-checkout'||deployed.verify_jwt!==false)throw Error('Deployment not confirmed');
     if(mode!=='--remaining-access'){
     stage='disposable intake enablement';await secrets(true);
     stage='hosted gateway readiness before fixture provisioning';
     let ready=false;
     for(let attempt=0;attempt<10;attempt++){
      const response=await fetch(target.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Origin:target.origin,'Content-Type':'application/json'},body:'{"action":"scope"}'});
      const body=await response.json().catch(()=>null);
      if(response.status===200&&typeof body?.scope==='string'){ready=true;break;}
      if(![404,503].includes(response.status))throw Error('Unexpected hosted gateway status');
      await new Promise(done=>setTimeout(done,2000));
     }
     if(!ready)throw Error('Hosted gateway readiness unconfirmed');
     }
     stage='new hosted acceptance batch';
     const code=await new Promise((yes,no)=>{
      const args=mode==='--remaining-access'?['scripts/verify-hosted-access-pending.mjs']:['scripts/verify-hosted-checkout.mjs',mode==='--resume-pending'?'--resume-pending':'--run','.tmp/hosted-acceptance/target.json'];
      const child=spawn(process.execPath,args,{env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      // The owned runner emits fixed labels/statuses only; never forward raw
      // third-party stderr (browser launch errors can expose diagnostic data).
      child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',()=>{});child.on('error',()=>no(Error('Runner unavailable')));child.on('close',yes);
     });
     if(code!==0)throw Error('Hosted batch incomplete');batchOK=true;
    }finally{
     try{await secrets(false);}catch{closureOK=false;}
     if(authChanged)try{await request('/config/auth','PATCH',{external_anonymous_users_enabled:original.external_anonymous_users_enabled===true});}catch{closureOK=false;}
     await writeFile(new URL('deployment-run-result.json',dir),JSON.stringify({target:target.projectRef,bundleSha256:hash(bundle),batchComplete:batchOK,edgeAndAuthClosureConfirmed:closureOK,lastStage:stage},null,2));
     console.log(closureOK?'Disposable Edge intake disabled; anonymous Auth configuration restored.':'UNCONFIRMED cleanup: operator must disable disposable intake and inspect Auth configuration.');
     if(!closureOK)process.exitCode=1;
    }
   }
  }
 }
}catch{console.error(`NOT COMPLETE: ${stage}. Raw diagnostics suppressed; do not replay initialization or fixtures blindly.`);process.exitCode=1;}
