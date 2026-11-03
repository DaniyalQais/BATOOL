// Failed-stage diagnostics only: real browser module import, GET and OPTIONS.
// No checkout POST, database write, fixtures, session provisioning or mocks.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {pathToFileURL} from 'node:url';
import {loadTarget} from './hosted-verification-guard.mjs';
let stage='configuration',server,browser;
const category=error=>{
 const text=String(error?.message??'');
 return /EADDRINUSE/.test(text)?'loopback port in use':/Executable doesn't exist/.test(text)?'missing browser executable':/EACCES|EPERM|Access is denied/.test(text)?'local execution denied':/CERT_|certificate/i.test(text)?'browser TLS':/Failed to fetch|fetch failed|ERR_CONNECTION|ERR_NAME|ERR_NETWORK/.test(text)?'browser network or CORS':/browserType.launch|Target.*closed/.test(text)?'browser launch':'unclassified failed stage';
};
try{
 const target=await loadTarget('.tmp/hosted-acceptance/target.json');
 const {chromium}=await import(pathToFileURL(process.env.BATOOL_PLAYWRIGHT_MODULE).href);
 stage='type-stripped module preparation';
 const modules=new Map();for(const name of ['checkout-client','contracts'])modules.set('/'+name+'.ts',stripTypeScriptTypes(await readFile(new URL(`../src/features/checkout/model/${name}.ts`,import.meta.url),'utf8')));
 stage='loopback server';
 server=createServer((req,res)=>{
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Read-only browser diagnosis</title>');}
  else if(modules.has(req.url)){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(modules.get(req.url));}
  else res.writeHead(404).end();
 });await new Promise((yes,no)=>{server.once('error',no);server.listen(43871,'127.0.0.1',yes);});
 stage='browser launch';browser=await chromium.launch({headless:true});console.log('PASS browser launch');
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
 page.on('requestfailed',request=>{console.log('Browser request failure category: '+category({message:request.failure()?.errorText}));});
 stage='loopback navigation';await page.goto(target.origin);console.log('PASS loopback navigation');
 stage='actual checkout client import';
 const imported=await page.evaluate(async()=>{const m=await import('/checkout-client.ts');return typeof m.checkoutClient==='function'&&typeof m.httpCheckoutTransport==='function';});if(!imported)throw Error('Module not available');console.log('PASS actual checkout client import');
 for(const method of ['OPTIONS','GET']){
  stage='real hosted browser '+method;
  try{
   const status=await page.evaluate(async({endpoint,method})=>{const r=await fetch(endpoint,{method});return r.status;},{endpoint:target.endpoint,method});
   console.log(`Hosted browser ${method} status: ${status}`);
  }catch(error){console.log('Hosted browser '+method+': '+category(error));process.exitCode=1;}
 }
}catch(error){console.log('NOT COMPLETE '+stage+': '+category(error));process.exitCode=1;}
finally{if(browser)await browser.close().catch(()=>{});if(server?.listening)await new Promise(done=>{server.closeAllConnections();server.close(done);});console.log('Diagnosis ended; no checkout POST, fixtures or Auth users created.');}
