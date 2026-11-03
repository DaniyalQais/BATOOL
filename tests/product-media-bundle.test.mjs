// Exercise the actual prepared Edge bundle with synthetic HTTP ports only.
// No Supabase network, Auth session or Storage mutation occurs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import sharp from 'sharp';
test('prepared small Edge bundle cold-loads pinned private bytes, reports readiness, then validates and registers three outputs',async()=>{
 const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;
 const calls={asset:0,publish:0,register:0};let handler;
 const owner='00000000-0000-4000-8000-000000001401';
 const source=await sharp({create:{width:384,height:512,channels:3,background:'#51343f'}}).jpeg().toBuffer();
 const asset=await readFile('.tmp/product-media-release/magick.wasm.gz');
 const values={SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'synthetic-public-only',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-only',BATOOL_ALLOWED_ORIGINS:'https://batool-lake.vercel.app'};
 globalThis.Deno={env:{get:name=>values[name]},serve:callback=>{handler=callback;}};
 const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 globalThis.fetch=async(input,init)=>{
  const r=new Request(input,init),u=new URL(r.url);assert.equal(u.hostname,'synthetic.invalid');
  if(u.pathname==='/auth/v1/user')return json({id:owner,aud:'authenticated',role:'authenticated',is_anonymous:false});
  if(u.pathname==='/rest/v1/dashboard_roles')return json([{role:'owner'}]);
  if(u.pathname==='/rest/v1/rpc/owner_product_media_ready')return json(true);
  if(u.pathname.includes('/product-image-validator-assets/')){calls.asset++;assert.equal(r.headers.get('apikey'),'synthetic-server-only');return new Response(asset,{headers:{'Content-Type':'application/gzip'}});}
  if(u.pathname.includes('/product-image-uploads/'))return new Response(source,{headers:{'Content-Type':'image/jpeg'}});
  if(u.pathname.startsWith('/storage/v1/object/product-images/')){
   assert.equal(r.method,'POST');assert.equal(r.headers.get('x-upsert'),'false');
   const body=new Uint8Array(await r.arrayBuffer());assert.equal((await sharp(body).metadata()).format,'webp');calls.publish++;return json({Key:'synthetic'});
  }
  if(u.pathname==='/rest/v1/rpc/register_product_image_asset'){
   const b=await r.json();assert.equal(b.p_product_id,12);assert.equal(b.p_user_id,owner);assert.equal(b.p_sha256.length,64);calls.register++;return json(null);
  }
  throw Error('Unexpected synthetic request');
 };
 try{
  await import(pathToFileURL(resolve('.tmp/product-media-release/index.js')).href);assert.equal(typeof handler,'function');
  const headers={Authorization:'Bearer synthetic-session',Origin:'https://batool-lake.vercel.app'};
  const ready=await handler(new Request('https://synthetic.invalid/functions/v1/validate-product-image',{headers}));
  assert.equal(ready.status,200);assert.deepEqual(await ready.json(),{ready:true,contract:'batool-product-image-v2'});
  const result=await handler(new Request('https://synthetic.invalid/functions/v1/validate-product-image',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({productId:12,uploadPath:`products/12/${owner}/00000000-0000-4000-8000-000000001411.jpg`})}));
  assert.equal(result.status,200);const body=await result.json();assert.equal(body.width,384);assert.equal(body.height,512);assert.match(body.path,/^products\/12\//);
  assert.deepEqual(calls,{asset:1,publish:3,register:1});
 }finally{globalThis.fetch=oldFetch;if(oldDeno===undefined)delete globalThis.Deno;else globalThis.Deno=oldDeno;}
});
