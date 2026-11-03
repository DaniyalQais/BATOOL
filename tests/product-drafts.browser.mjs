// New draft UI only. Synthetic Auth/REST fixtures; every external request is intercepted.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
if (!process.env.BATOOL_PLAYWRIGHT_MODULE) throw new Error('Set BATOOL_PLAYWRIGHT_MODULE to an existing Playwright index.mjs.');
const { chromium } = await import(pathToFileURL(process.env.BATOOL_PLAYWRIGHT_MODULE).href);
const root = path.resolve('out');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = createServer(async (request,response) => {
  try {
    const pathname = new URL(request.url,'http://localhost').pathname;
    const file = path.resolve(root, `.${pathname}`, ...(pathname.endsWith('/') ? ['index.html'] : []));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    response.setHeader('Content-Type',mime[path.extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const userId = '00000000-0000-4000-8000-000000000701';
const timestamp = '2026-11-01T12:00:00Z';
const legacy = { 0:'gulnaar',2:'meher',3:'saba',7:'mira',8:'noor',11:'zeenat' };
function product(id,name) {
  return { id,slug: legacy[id] ?? `aurora-draft-${id}`,name,description:'Synthetic stitched concept',price_minor:12345,currency:'PKR',
    active:false,is_demo:true,draft_managed:id>=12,archived:false,subcategory:id>=12?null:'Daily Pret',color:id>=12?null:'#51343f',tag:id>=12?null:'Concept',
    image_slug:legacy[id]??null,image_note:'Synthetic concept disclosure',main_image_path:null,main_image_width:null,main_image_height:null,image_alt:null,
    edit_revision:5,sort_order:id,created_at:timestamp,updated_at:timestamp,
    product_variants:['S','M','L','XL'].map(size=>({product_id:id,size,active:true,stock_quantity:null})) };
}
const products = Object.keys(legacy).map(id=>product(Number(id),`Retained ${id}`));
const creations = []; const saves = []; const unexpected = []; const errors = [];
let browser;
try {
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext();
  const expires_at = Math.floor(Date.now()/1000)+3600;
  const user = {id:userId,email:'draft-ui@example.invalid',is_anonymous:false,app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated',created_at:timestamp};
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:userId,role:'authenticated',exp:expires_at})).toString('base64url')}.synthetic-draft-ui`;
  await context.addInitScript(({token,user,expires_at})=>localStorage.setItem('batool-admin-auth',JSON.stringify({access_token:token,refresh_token:'synthetic-draft-ui-refresh',expires_at,token_type:'bearer',user})),{token,user,expires_at});
  await context.route('**/*',async route=>{
    const request=route.request(); const url=new URL(request.url());
    if (url.origin===base) return route.continue();
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if (url.pathname==='/auth/v1/user') return json(user);
    if (url.pathname==='/rest/v1/dashboard_roles') return json([{user_id:userId,role:'owner'}]);
    if (url.pathname==='/rest/v1/products' && request.method()==='GET') return json(products);
    if (url.pathname==='/rest/v1/orders' && request.method()==='GET') return json([]);
    // This suite isolates product drafts; settings readiness has its own UI suite.
    if (['/rest/v1/business_settings','/rest/v1/order_notification_settings'].includes(url.pathname)) return json({code:'PGRST205',message:'Settings not configured in product fixtures'},404);
    if (url.pathname==='/rest/v1/rpc/owner_create_product_draft') {
      const payload=request.postDataJSON(); creations.push(payload);
      if (creations.length===1) {
        const row=product(12,payload.p_name); row.description=payload.p_description; row.price_minor=payload.p_price_minor;
        row.product_variants.forEach(variant=>variant.stock_quantity=payload.p_stocks[variant.size]); products.push(row);
        return json({code:'synthetic_unconfirmed',message:'Synthetic lost confirmation'},503);
      }
      assert.deepEqual(payload,creations[0]); return json(products.find(p=>p.id===12));
    }
    if (url.pathname==='/rest/v1/rpc/owner_save_catalog_product') {
      const payload=request.postDataJSON(); saves.push(payload); const row=products.find(p=>p.id===payload.p_product_id);
      assert.equal(row.edit_revision,payload.p_expected_revision);
      Object.assign(row,{name:payload.p_name,description:payload.p_description,price_minor:payload.p_price_minor,active:payload.p_active,
        archived:payload.p_archived,subcategory:payload.p_subcategory,color:payload.p_color,tag:payload.p_tag,edit_revision:row.edit_revision+1});
      return json(row);
    }
    unexpected.push({path:url.pathname,method:request.method()}); return route.abort();
  });
  const page=await context.newPage(); page.on('pageerror',()=>errors.push('browser-script-error'));
  await page.goto(base+'/admin/');
  const form=page.getByRole('heading',{name:'Create an inactive draft',exact:true}).locator('..');
  await form.getByRole('button',{name:'Create inactive draft',exact:true}).waitFor();
  await form.getByRole('textbox',{name:'Product name',exact:true}).fill('Aurora draft');
  await form.getByRole('textbox',{name:'Description',exact:true}).fill('Synthetic stitched concept');
  await form.getByRole('textbox',{name:'Price (PKR)',exact:true}).fill('123.45');
  await form.getByRole('checkbox',{name:'Unknown',exact:true}).nth(1).uncheck();
  await form.getByRole('textbox',{name:'Quantity (M)',exact:true}).fill('0');
  await form.getByRole('button',{name:'Create inactive draft',exact:true}).click();
  const retry=form.getByRole('button',{name:'Retry draft creation',exact:true}); await retry.waitFor();
  await retry.click();
  const draft=page.getByRole('heading',{name:'Aurora draft',exact:true}).locator('..'); await draft.waitFor();
  assert.equal(creations.length,2); assert.deepEqual(creations[0],creations[1]); assert.equal(products.filter(p=>p.id===12).length,1);
  assert.deepEqual(creations[0].p_stocks,{S:null,M:0,L:null,XL:null});
  assert.equal(await draft.getByRole('checkbox',{name:'Active in the next storefront build',exact:true}).isDisabled(),true);
  assert.equal(await draft.locator('input[type="file"]').isDisabled(),true);
  assert.equal(await draft.getByRole('button',{name:'Upload unavailable',exact:true}).isDisabled(),true);
  await draft.getByRole('combobox',{name:'Collection',exact:true}).selectOption('Daily Pret');
  await draft.getByRole('textbox',{name:'Card label',exact:true}).fill('Concept');
  await draft.getByRole('textbox',{name:'Card accent color (#RRGGBB)',exact:true}).fill('#51343f');
  assert.equal(await draft.getByRole('checkbox',{name:'Active in the next storefront build',exact:true}).isDisabled(),true);
  await draft.getByRole('checkbox',{name:'Archive (keep inactive; retain product and images)',exact:true}).check();
  await draft.getByRole('button',{name:'Save product',exact:true}).click();
  await draft.getByText(/Saved to the database\. Storefront changes require rebuilding/).waitFor();
  assert.equal(saves.length,1); assert.equal(saves[0].p_archived,true); assert.equal(saves[0].p_active,false);
  assert.deepEqual(unexpected,[]); assert.deepEqual(errors,[]);
  console.log('PASS isolated draft UI: uncertain-create retry reuses key/payload; one resulting draft; Unknown/zero stock; metadata/archive save; image and activation controls disabled. Synthetic fixtures only, not database or real Auth-session authorization.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
