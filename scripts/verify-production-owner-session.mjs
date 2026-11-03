// One existing Owner's privately entered real session; read-only application
// probes only. No passwords/tokens/headers/customer data are logged or saved.
// No signup, recovery email, settings save, case mutation or logout is allowed.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const origin='https://batool-lake.vercel.app',project='https://cydnirqrsjrlljrjfidq.supabase.co';
const report={scope:'Actual existing production Owner session; read-only verification',complete:false};let browser,stage='published release prerequisite';
const need=v=>{if(!v)throw Error('Check unconfirmed');};
try{
 const live=JSON.parse(await readFile('.tmp/production-disabled-release/live-ui-result.json','utf8'));need(live.complete);
 const env={};for(const file of ['.env.local','.env.hosted.local'])for(const line of (await readFile(file,'utf8')).split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(m)env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}
 need(env.SUPABASE_URL===project);if(env.PLAYWRIGHT_BROWSERS_PATH)process.env.PLAYWRIGHT_BROWSERS_PATH=env.PLAYWRIGHT_BROWSERS_PATH;
 const {chromium}=await import(pathToFileURL(env.BATOOL_PLAYWRIGHT_MODULE).href);browser=await chromium.launch({headless:false});
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();const blocked=[];
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  const read=['GET','HEAD','OPTIONS'].includes(method);
  const login=url.origin===project&&url.pathname==='/auth/v1/token'&&method==='POST'&&['password','refresh_token'].includes(url.searchParams.get('grant_type'));
  const caseRead=url.origin===project&&url.pathname==='/rest/v1/rpc/owner_recovery_case'&&method==='POST';
  if((read&&[origin,project].includes(url.origin))||login||caseRead)return route.continue();
  blocked.push({method,category:url.origin===project?'blocked application mutation':'other origin'});return route.abort();
 });
 stage='private existing Owner login';await page.goto(origin+'/admin/login/',{waitUntil:'domcontentloaded'});
 console.log('Private Owner verification browser opened. Sign in with the existing Owner account; do not save/edit settings or use password recovery.');
 await page.waitForFunction(()=>location.pathname==='/admin/'&&document.querySelector('dt')?.textContent==='Signed in as',{},{timeout:600000});
 stage='real session read-only authorization';
 report.evidence=await page.evaluate(async({project,key})=>{
  const raw=localStorage.getItem('batool-admin-auth');let session;try{session=JSON.parse(raw??'null');}catch{return null;}
  if(!session?.access_token)return null;
  const headers={apikey:key,Authorization:`Bearer ${session.access_token}`};
  const identity=await fetch(project+'/auth/v1/user',{headers});if(!identity.ok)return null;const user=await identity.json();
  if(user.is_anonymous||user.id!==session.user?.id)return null;
  const roles=await fetch(project+'/rest/v1/dashboard_roles?select=role&user_id=eq.'+encodeURIComponent(user.id),{headers});const rows=roles.ok?await roles.json():[];
  const role=rows.length===1?rows[0].role:null;if(role!=='owner')return {role,verifiedUser:true,owner:false};
  const settings=await fetch(project+'/rest/v1/business_settings?select=id,revision&limit=1',{headers});const data=settings.ok?await settings.json():[];
  const recovery=await fetch(project+'/rest/v1/rpc/owner_recovery_case',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_case:'00000000-0000-4000-8000-000000000000'})});const missing=await recovery.json().catch(()=>null);
  return {verifiedUser:true,role:'owner',owner:true,settingsReadAuthorized:settings.status===200&&Array.isArray(data)&&data.length===1,liveOwnerRecoveryReadAuthorized:recovery.status===409&&missing?.code==='PT409'};
 },{project,key:env.SUPABASE_PUBLISHABLE_KEY});
 need(report.evidence?.owner&&report.evidence.settingsReadAuthorized&&report.evidence.liveOwnerRecoveryReadAuthorized);
 report.blockedRequests=blocked;need(!blocked.some(r=>r.category==='blocked application mutation'));
 report.complete=true;report.pending=['actual Partner session','actual unassigned session','actual anonymous Auth session','actual revoked session'];
 console.log('PASS: actual production Owner identity/role, settings read and live-session recovery read boundary; no saves, case mutations or account changes.');
}catch(error){report.failure={stage,category:error.name,networkCode:error.cause?.code??null};console.error('STOP: Owner session verification unconfirmed; raw diagnostics suppressed.');process.exitCode=1;}
finally{if(browser)await browser.close();await writeFile('.tmp/production-disabled-release/owner-session-result.json',JSON.stringify(report,null,2));}
