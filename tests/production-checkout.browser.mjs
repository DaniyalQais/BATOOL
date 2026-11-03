// New production wiring/recovery UI only. All external HTTP intercepted.
// No Auth/customer data, hosted requests or checkout fixture orders.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const closed=process.argv.includes('--closed');
const cartOnly=process.argv.includes('--cart');
const {chromium}=await import(pathToFileURL(process.env.BATOOL_PLAYWRIGHT_MODULE).href);
const root=fileURLToPath(new URL('../out/',import.meta.url));
const server=createServer(async(req,res)=>{
 try{
  let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==resolve(root)&&!file.startsWith(resolve(root)+sep))throw Error();
  if((await stat(file)).isDirectory())file=resolve(file,'index.html');
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.webp':'image/webp'}[extname(file)];
  res.writeHead(200,{'Content-Type':type??'application/octet-stream'});res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
 const errors=[];page.on('pageerror',()=>errors.push('pageerror'));
 let mode='unavailable',opens=[],external=0;
 const id='00000000-0000-4000-8000-000000000101',key='00000000-0000-4000-8000-000000000102';
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===origin)return route.continue();external++;
  if(closed)throw Error('Unexpected external request');
  assert.equal(url.href,'https://abcdefghijklmnopqrst.supabase.co/functions/v1/secure-checkout');
  const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  const body=route.request().postDataJSON();
  if(body.action==='availability')return route.fulfill({headers,json:mode==='cod'?{enabled:true,methods:['cod']}:{enabled:false,methods:[]}});
  if(body.action==='support_open'){
   opens.push(body);if(opens.length===1)return route.abort('failed');
   return route.fulfill({headers,json:{case_id:body.case_id,state:'open',expires_at:'2099-01-01T00:00:00Z'}});
  }
  if(body.action==='support_result')return route.fulfill({headers,json:{state:'retired',scope:'synthetic_signed_scope',resolution:{status:'retired',quote_id:id,resolution_id:key,replacement_key:key,replacement_quote:null}}});
  throw Error('Unexpected action');
 });
 await page.addInitScript(()=>{if(!localStorage.getItem('batool-bag'))localStorage.setItem('batool-bag','[{"id":0,"size":"M","quantity":1}]');});
 await page.goto(origin+(cartOnly?'/':'/checkout/'));
 if(cartOnly){
  await page.getByRole('button',{name:/Open shopping bag/}).click();
  await page.getByRole('button',{name:'Review bag',exact:true}).click();
  const link=page.getByRole('link',{name:'Continue to checkout'});await link.waitFor();assert.equal(await link.getAttribute('href'),'/checkout/');
  await link.click();await page.getByRole('heading',{name:'Checkout',exact:true}).waitFor();
  console.log('PASS new bag entry point links to production checkout and defers availability to the backend.');
 }else if(closed){
  await page.getByRole('heading',{name:'Checkout is unavailable',exact:true}).waitFor();
  assert.equal(await page.getByRole('combobox').count(),0);assert.equal(external,0);
  console.log('PASS new release flags closed: static production page makes no checkout request and offers no payment selector.');
 }else{
  await page.getByText('New orders are unavailable.',{exact:true}).waitFor();assert.equal(await page.getByRole('combobox').count(),0);
  mode='cod';await page.getByRole('button',{name:'Refresh availability'}).click();
  await page.getByRole('combobox').waitFor();assert.deepEqual(await page.locator('select option').allTextContents(),['Choose an available method','Cash on delivery']);
  await page.getByRole('button',{name:'Open or retry support case'}).click();
  await page.getByRole('button',{name:'Open or retry support case'}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!!sessionStorage.getItem('batool-checkout-support-v1'));
  // The first lost response is displayed before allowing a retry.
  await page.getByText('Recovery response was lost. Your bag and case are preserved. Retry this same case.').waitFor();
  await page.getByRole('button',{name:'Open or retry support case'}).click();
  await page.getByText(/Support case reference:/).waitFor();assert.equal(opens.length,2);assert.ok(JSON.stringify(opens[0])===JSON.stringify(opens[1]),'Same support case and proof reused');
  await page.getByRole('button',{name:'Check this support case'}).click();
  await page.getByRole('button',{name:'Review replacement quote'}).waitFor();
  const saved=await page.evaluate(()=>({bag:localStorage.getItem('batool-bag'),intent:JSON.parse(sessionStorage.getItem('batool-checkout-intent-v1'))}));
  assert.equal(saved.intent.state,'restart');assert.equal(saved.intent.replacement_key,key);assert.equal(JSON.parse(saved.bag).length,1);
  await page.reload();await page.getByRole('button',{name:'Review replacement quote'}).waitFor();
  console.log('PASS new production UI uses live method allowlist; lost support response reuses proof/case; confirmed retirement persists across reload with bag intact.');
 }
 assert.equal(errors.length,0);
}finally{await browser?.close();await new Promise(yes=>{server.closeAllConnections();server.close(yes);});}
