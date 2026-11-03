// New deployed-artifact checks only. No Auth credentials, fixtures or API writes.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const mode=process.argv[2],dir='.tmp/production-disabled-release/';
const interactive=process.argv.includes('--interactive');
const remaining=process.argv.includes('--remaining'),hold=process.argv.includes('--hold');
const result={mode,checks:[],complete:false};let browser,stage='release binding';
function need(v){if(!v)throw Error('Check unconfirmed');}
function pass(label){result.checks.push(label);console.log('PASS: '+label);}
try{
 need(['--staged','--live'].includes(mode));
 const deployment=JSON.parse(await readFile(dir+'vercel-deployment-after.json','utf8'));
 const manifest=JSON.parse(await readFile(dir+'static-manifest.json','utf8'));
 need(deployment.projectId==='prj_bvKELVC1cDw3mgZVvsnVPrumoCZN'&&deployment.readyState==='READY');result.deploymentId=deployment.id;
 const origin=mode==='--staged'?'https://'+deployment.url:'https://batool-lake.vercel.app';
 if(remaining){const prior=JSON.parse(await readFile(dir+'staged-ui-result.json','utf8'));need(prior.deploymentId===deployment.id&&prior.checks.filter(c=>c.startsWith('Exact closed artifact')).length===4&&!prior.complete);await writeFile(dir+'staged-http-accepted-browser-incomplete.json',JSON.stringify(prior,null,2),{flag:'wx'});result.checks.push(...prior.checks.filter(c=>c.startsWith('Exact closed artifact')));}
 const env={};for(const line of (await readFile('.env.hosted.local','utf8')).split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(m)env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}
 if(env.PLAYWRIGHT_BROWSERS_PATH)process.env.PLAYWRIGHT_BROWSERS_PATH=env.PLAYWRIGHT_BROWSERS_PATH;
 const {chromium}=await import(pathToFileURL(env.BATOOL_PLAYWRIGHT_MODULE).href);
 browser=await chromium.launch({headless:!interactive});
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
 if(interactive){
  stage='private Vercel authentication';
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  console.log('Private verification browser opened. Sign in to Vercel there; no credentials, cookies or session state are recorded.');
  await page.waitForFunction(({origin})=>location.origin===origin&&document.querySelector('link[rel="canonical"]')?.getAttribute('href')==='https://batool-lake.vercel.app/',{origin},{timeout:600000});
  pass('Existing Vercel protection authenticated interactively; no bypass created or protection changes');
 }
 stage='served static pages';
 for(const file of remaining?[]:['index.html','checkout/index.html','help/delivery/index.html','admin/login/index.html']){
  const route='/'+file.replace(/index\.html$/,'');
  const response=interactive?await context.request.get(origin+route,{maxRedirects:0,timeout:20000}):await fetch(origin+route,{redirect:'error',signal:AbortSignal.timeout(20000)});need((interactive?response.status():response.status)===200);
  const bytes=interactive?await response.body():Buffer.from(await response.arrayBuffer());need(createHash('sha256').update(bytes).digest('hex')===manifest.files.find(f=>f.path===file)?.sha256);
  need(bytes.toString('utf8').includes('noindex'));pass('Exact closed artifact and noindex: '+route);
 }
 stage='real browser closed checkout';
 const unexpected=[];await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin&&['GET','HEAD'].includes(request.method()))return route.continue();
  // Closed pages must make no checkout/Auth/external calls; block before any write.
  unexpected.push({method:request.method(),category:url.hostname.endsWith('.supabase.co')?'supabase':'other'});return route.abort();
 });
 await page.goto(origin+'/checkout/',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Checkout is unavailable',exact:true}).waitFor();
 result.checkoutObservation={mainForms:await page.locator('main#main form').count(),externalRequests:unexpected};
 need(result.checkoutObservation.mainForms===0);need(unexpected.length===0);pass('Real browser: checkout closed, no checkout submission form or external/API requests');
 stage='real browser unauthenticated admin';
 await page.goto(origin+'/admin/',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Sign in required',exact:true}).waitFor();
 need(unexpected.length===0);pass('Real browser: unauthenticated admin requires sign-in; no Owner controls or API requests');
 result.authenticatedSessions='PENDING; no synthetic claims, session injection or account changes';result.complete=true;
 if(hold&&interactive){
  await writeFile(dir+'staged-ui-result.json',JSON.stringify(result,null,2));
  console.log('Staged verification complete. Private browser retained in memory for live checks; no session state saved.');
  await new Promise(resolve=>{
   let pending='';let queue=Promise.resolve();process.stdin.setEncoding('utf8');
   process.stdin.on('data',chunk=>{pending+=chunk;while(pending.includes('\n')){const split=pending.indexOf('\n'),line=pending.slice(0,split);pending=pending.slice(split+1);queue=queue.then(async()=>{
    let command;try{command=JSON.parse(line);}catch{return;}
    if(command.action==='close'){resolve();return;}
    if(command.action!=='live')return;
    const live={deploymentId:deployment.id,checks:[],complete:false};
    try{
     const primary='https://batool-lake.vercel.app';
     // Replace the staging request guard with the same restriction for the approved origin.
     await context.unroute('**/*');const blocked=[];
     await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin===primary&&['GET','HEAD'].includes(r.method()))return route.continue();blocked.push({method:r.method(),category:u.hostname.endsWith('.supabase.co')?'supabase':'other'});return route.abort();});
     for(const file of ['index.html','checkout/index.html','help/delivery/index.html','admin/login/index.html']){
      const r=await context.request.get(primary+'/'+file.replace(/index\.html$/,''),{maxRedirects:0,timeout:20000});need(r.status()===200);const bytes=await r.body();need(createHash('sha256').update(bytes).digest('hex')===manifest.files.find(f=>f.path===file)?.sha256&&bytes.includes(Buffer.from('noindex')));live.checks.push('Exact live artifact and noindex: '+file);
     }
     await page.goto(primary+'/checkout/',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Checkout is unavailable',exact:true}).waitFor();need(await page.locator('main#main form').count()===0&&blocked.length===0);live.checks.push('Live browser: checkout unavailable, no checkout form or API requests');
     await page.goto(primary+'/admin/',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Sign in required',exact:true}).waitFor();need(blocked.length===0);live.checks.push('Live browser: unauthenticated admin requires sign-in');live.complete=true;console.log('PASS: Live exact artifacts/noindex, disabled checkout and unauthenticated admin; no API requests.');
    }catch(error){live.failure={category:error.name,networkCode:error.cause?.code??null};console.error('STOP: live UI verification unconfirmed; browser retained, no raw diagnostics printed.');}
    await writeFile(dir+'live-ui-result.json',JSON.stringify(live,null,2));
   });}});
  });
 }
}catch(error){result.failure={stage,category:error.name,networkCode:error.cause?.code??null};console.error('STOP: '+stage+'; raw diagnostics suppressed');process.exitCode=1;}
finally{if(browser)await browser.close();await writeFile(dir+(mode==='--staged'?'staged-ui-result.json':'live-ui-result.json'),JSON.stringify(result,null,2));}
