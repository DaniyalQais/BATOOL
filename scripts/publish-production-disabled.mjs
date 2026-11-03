// Authorized static-only Vercel release. Never uploads repository source,
// environment files or server credentials; never modifies Supabase or Auth.
import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {spawn} from 'node:child_process';
const dir=resolve('.tmp/production-disabled-release'),alias='batool-lake.vercel.app';
const report={alias,checks:[],mutations:[],complete:false};let stage='Vercel login';
const need=(v,label)=>{if(!v)throw Error(label);};
const pass=label=>{report.checks.push(label);console.log('PASS: '+label);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(name,value)=>writeFile(join(dir,name),JSON.stringify(value,null,2),{flag:'wx'});
try{
 const mode=process.argv[2];need(['--prepare','--deploy','--deploy-cached','--publish','--rollback'].includes(mode),'Explicit release stage required');
 const {token}=JSON.parse(await readFile(join(homedir(),'AppData/Roaming/com.vercel.cli/Data/auth.json'),'utf8'));need(token,'Vercel login missing');
 const api=async(path,method='GET',body)=>{const r=await fetch('https://api.vercel.com'+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});need(r.ok,`Vercel ${method} request HTTP ${r.status}`);return await r.json();};
 const previous=JSON.parse(await readFile(join(dir,'vercel-alias-before.json'),'utf8'));
 need(previous.alias===alias&&previous.projectId==='prj_bvKELVC1cDw3mgZVvsnVPrumoCZN','Exact existing alias/project required');
 const previousDeployment=previous.deploymentId??previous.deployment?.id;need(previousDeployment,'Prior deployment missing');
 if(mode==='--prepare'){
  stage='previous release/configuration backup';
  const project=await api(`/v9/projects/${previous.projectId}`);
  const deployment=await api(`/v13/deployments/${previousDeployment}`);
  need(deployment.readyState==='READY'&&deployment.projectId===previous.projectId,'Prior release must remain ready');
  await save('vercel-project-before.private.json',project);await save('vercel-deployment-before.private.json',deployment);
  const owner=project.accountId??deployment.teamId??deployment.ownerId;need(owner,'Vercel account binding missing');
  await save('vercel-target.json',{projectId:project.id,orgId:owner,projectName:project.name,previousDeployment,alias});
  pass('Existing Vercel project/release configuration retained; prior deployment left intact');
  stage='existing production artifact integrity';
  const manifest=JSON.parse(await readFile(join(dir,'static-manifest.json'),'utf8'));
  need(manifest.origin==='https://'+alias&&manifest.project==='https://cydnirqrsjrlljrjfidq.supabase.co'&&manifest.catalogSource==='supabase'&&!manifest.checkoutRelease&&!manifest.recoveryRelease&&manifest.noindex,'Closed production export required');
  for(const file of manifest.files)need(hash(await readFile(join('out',file.path)))===file.sha256,'Built artifact changed; stop');
  const staging=join(dir,'vercel-static');await mkdir(join(staging,'.vercel/output'),{recursive:true});
  await cp('out',join(staging,'.vercel/output/static'),{recursive:true,errorOnExist:true,force:false});
  // Preserve Next's exported directory URLs and static assets without server code.
  const routes=[];for(const file of manifest.files.filter(f=>f.path.endsWith('index.html'))){
   const route='/'+file.path.slice(0,-'index.html'.length);
   const escaped=route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   if(route!=='/')routes.push({src:'^'+escaped.slice(0,-1)+'$',status:308,headers:{Location:route}});
   routes.push({src:'^'+escaped+'$',dest:'/'+file.path});
  }
  routes.push({handle:'filesystem'},{src:'/(.*)',status:404,dest:'/404.html'});
  await writeFile(join(staging,'.vercel/output/config.json'),JSON.stringify({version:3,routes},null,2));
  await writeFile(join(staging,'.vercel/project.json'),JSON.stringify({projectId:project.id,orgId:owner,projectName:project.name}));
  // Empty source root: the CLI receives prebuilt static artifacts only.
  await writeFile(join(staging,'vercel.json'),JSON.stringify({version:2,framework:null}));
  pass('Previously checked production static files packaged; no rebuild or source upload');
  report.complete=true;
 }else{
  const target=JSON.parse(await readFile(join(dir,'vercel-target.json'),'utf8'));
  const query='?teamId='+encodeURIComponent(target.orgId);
  if(mode==='--deploy'||mode==='--deploy-cached'){
   stage='staged static deployment';
   const prepared=JSON.parse(await readFile(join(dir,'vercel-prepare-result.json'),'utf8'));need(prepared.complete,'Prepared rollback/artifact required');
   let args;
   if(mode==='--deploy-cached'){
    const outcome=JSON.parse(await readFile(join(dir,'vercel-failed-deployment-outcome.json'),'utf8'));
    need(outcome.aliasUnchanged===true&&outcome.newDeployments.length===0&&outcome.noRetryPerformed===true,'Existing deployment outcome must be resolved');
    await save('vercel-cached-deployment-intent.json',{projectId:target.projectId,alias,startedAt:new Date().toISOString(),assignDomains:false,priorNpxStartupFailedWithoutDeployment:true});
    const cli=join(homedir(),'AppData/Local/npm-cache/_npx/5a8bcc9627c43cb2/node_modules/vercel/dist/vc.js');await access(cli);
    args=[cli,'deploy','--prebuilt','--prod','--skip-domain','--yes'];
   }else{
    await access(join(dir,'vercel-deployment-intent.json')).then(()=>{throw Error('Existing deployment intent: resolve outcome before retrying');},e=>{if(e.code!=='ENOENT')throw e;});
    await save('vercel-deployment-intent.json',{projectId:target.projectId,alias,startedAt:new Date().toISOString(),assignDomains:false});
    args=[join(dirname(process.execPath),'node_modules/npm/bin/npx-cli.js'),'--yes','vercel','deploy','--prebuilt','--prod','--skip-domain','--yes'];
   }
   const run=await new Promise((yes,no)=>{const p=spawn(process.execPath,args,{cwd:join(dir,'vercel-static'),env:{...process.env,VERCEL_PROJECT_ID:target.projectId,VERCEL_ORG_ID:target.orgId,VERCEL_TOKEN:token,VERCEL_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',no);p.on('close',code=>yes({code,out,err}));});
   const urls=[...new Set(run.out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g)??[])];
   if(run.code!==0){report.cliFailure={exitCode:run.code,category:/token|login|authenticat/i.test(run.err)?'authentication':/prebuilt|output|framework/i.test(run.err)?'artifact/configuration':'deployment unconfirmed'};throw Error('CLI deployment did not confirm success; inspect intent before retrying');}
   need(urls.length===1,'Unique staged deployment URL required');
   const deployed=await api(`/v13/deployments/${new URL(urls[0]).hostname}${query}`);
   need(deployed.projectId===target.projectId&&deployed.readyState==='READY','Staged release identity/readiness');
   await save('vercel-deployment-after.json',deployed);
   report.mutations.push('Prebuilt static deployment created; production alias not changed');pass('Staged static release READY in the existing project');report.complete=true;
  }else{
   const deployed=mode==='--publish'?JSON.parse(await readFile(join(dir,'vercel-deployment-after.json'),'utf8')):{id:target.previousDeployment};
   if(mode==='--publish'){const checked=JSON.parse(await readFile(join(dir,'staged-ui-result.json'),'utf8'));need(checked.complete&&checked.deploymentId===deployed.id,'Staged focused UI verification required');}
   stage=mode==='--publish'?'sole approved alias assignment':'approved prior alias restoration';
   const current=await api(`/v4/aliases/${alias}${query}`);const expected=mode==='--publish'?target.previousDeployment:JSON.parse(await readFile(join(dir,'vercel-deployment-after.json'),'utf8')).id;
   need((current.deploymentId??current.deployment?.id)===expected,'Production alias changed outside this release; stop');
   const assigned=await api(`/v2/deployments/${deployed.id}/aliases${query}`,'POST',{alias});need(assigned.alias===alias,'Unexpected assigned alias');
   report.mutations.push(stage);report.deploymentId=deployed.id;pass(stage);report.complete=true;
  }
 }
}catch(error){report.failure={stage,reason:/^(Vercel |Prior |Existing |Unexpected |Production |CLI |Built |Staged |Closed |Unique )/.test(error.message??'')?error.message:'Stage unconfirmed; raw diagnostics suppressed',networkCode:error?.cause?.code??null};console.error('STOP: '+stage+' — '+report.failure.reason);process.exitCode=1;}
finally{await writeFile(join(dir,`vercel-${(process.argv[2]??'unknown').slice(2)}-result.json`),JSON.stringify(report,null,2));}
