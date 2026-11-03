import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {pathToFileURL, fileURLToPath} from 'node:url';
import sharp from 'sharp';
import type {SupabaseClient} from '@supabase/supabase-js';
import {verifiedDecoderAsset,DECODER_BYTES} from '../supabase/functions/_shared/product-image-decoder-asset.ts';
import {IMAGE_VALIDATOR_CONTRACT} from '../supabase/functions/_shared/image-policy.ts';
import {handleProductImage, type ImageValidatorPorts} from '../supabase/functions/_shared/product-image-handler.ts';
import {decodeProductImage, type RasterDecoder} from '../supabase/functions/_shared/decode-product-image.ts';
import {trustedValidatorReady, productMediaReleased} from '../src/features/catalog/model/product-media-readiness.ts';
import {productImagePresentation} from '../src/features/catalog/model/product-image-presentation.ts';

test('new decoder transport verifies pinned bytes before running the unchanged trusted decoder',async()=>{
 const raw=await readFile('supabase/functions/validate-product-image/assets/magick.wasm');
 const verified=await verifiedDecoderAsset(new Blob([gzipSync(raw)]));assert.deepEqual(Buffer.from(verified),raw);
 const magick=await import(pathToFileURL(fileURLToPath(new URL('../.tmp/magick-package/package/dist/index.js',import.meta.url))).href);
 await magick.initializeImageMagick(verified);
 const input=await sharp({create:{width:384,height:512,channels:3,background:'#51343f'}}).withMetadata({exif:{IFD0:{Artist:'Synthetic private metadata'}}}).jpeg().toBuffer();
 const decoded=decodeProductImage(input,'image/jpeg',magick.ImageMagick as RasterDecoder);
 assert.equal(decoded.files.length,3);
 for(const f of decoded.files){const meta=await sharp(f.bytes).metadata();assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);}
});
test('decoder transport fails closed on tampering, truncation, invalid gzip and oversized expansion',async()=>{
 const raw=await readFile('supabase/functions/validate-product-image/assets/magick.wasm');
 const changed=Buffer.from(raw);changed[100]^=1;
 for(const payload of [gzipSync(changed),gzipSync(raw.subarray(0,100)),Buffer.from('invalid'),gzipSync(Buffer.alloc(DECODER_BYTES+1))])
   await assert.rejects(verifiedDecoderAsset(new Blob([payload])));
 await assert.rejects(verifiedDecoderAsset(new Blob([new Uint8Array(8*1024*1024+1)])));
});
function ports(role:string|null='owner',schema=true,decoder=true,anonymous=false){
 const calls:string[]=[];
 const caller={auth:{getUser:async()=>({error:null,data:{user:{id:'synthetic',is_anonymous:anonymous}}})},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:role?{role}:null,error:null})})})}),
  rpc:async(name:string)=>{assert.equal(name,'owner_product_media_ready');calls.push('schema');return{data:schema,error:null};}} as unknown as SupabaseClient;
 const p:ImageValidatorPorts={configured:true,allowedOrigins:['https://batool-lake.vercel.app'],caller:()=>caller,
  trusted:()=>{throw Error('Readiness must not publish');},decode:async()=>{throw Error('Readiness must not decode customer bytes');},
  ready:async()=>{calls.push('decoder');if(!decoder)throw Error('PRIVATE PROVIDER ERROR');}};
 return {p,calls};
}
const request=(origin='https://batool-lake.vercel.app',authorization='Bearer synthetic')=>new Request('https://example.invalid',{method:'GET',headers:{Origin:origin,Authorization:authorization}});
test('media readiness requires actual Owner validation, decoder and schema; denial exposes no provider details',async()=>{
 for(const role of ['partner',null]){const f=ports(role);assert.equal((await handleProductImage(request(),f.p)).status,403);assert.equal(f.calls.length,0);}
 const anon=ports('owner',true,true,true);assert.equal((await handleProductImage(request(),anon.p)).status,401);
 for(const [schema,decoder]of [[false,true],[true,false]]){const f=ports('owner',schema,decoder);const r=await handleProductImage(request(),f.p);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE/);}
 const f=ports();const response=await handleProductImage(request(),f.p);assert.equal(response.status,200);assert.equal(trustedValidatorReady(await response.json()),true);assert.deepEqual(f.calls,['decoder','schema']);
});
test('media CORS and public build contract admit only reviewed readiness without releasing checkout',async()=>{
 const f=ports();assert.equal((await handleProductImage(request('https://untrusted.invalid'),f.p)).status,403);assert.equal(f.calls.length,0);
 const pre=await handleProductImage(new Request('https://example.invalid',{method:'OPTIONS',headers:{Origin:'https://batool-lake.vercel.app'}}),f.p);
 assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Methods'),'GET, POST, OPTIONS');
 for(const value of [null,true,{ready:'true',contract:IMAGE_VALIDATOR_CONTRACT},{ready:true,contract:'old'}])assert.equal(trustedValidatorReady(value),false);
 const old=process.env.NEXT_PUBLIC_PRODUCT_MEDIA_RELEASE;try{delete process.env.NEXT_PUBLIC_PRODUCT_MEDIA_RELEASE;assert.equal(productMediaReleased(),false);process.env.NEXT_PUBLIC_PRODUCT_MEDIA_RELEASE='true';assert.equal(productMediaReleased(),true);}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_PRODUCT_MEDIA_RELEASE;else process.env.NEXT_PUBLIC_PRODUCT_MEDIA_RELEASE=old;}
});
test('approved new merchandise gets truthful photo copy while illustrative legacy provenance stays disclosed',()=>{
 const photo={path:'products/12/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/main.webp',width:384,height:512,alt:'Synthetic garment'};
 assert.equal(productImagePresentation({uploadedImage:photo,imageSlug:'',isDemo:false,imageNote:'Draft concept.'}).caption,'Owner-approved product photo.');
 assert.match(productImagePresentation({uploadedImage:photo,imageSlug:'',isDemo:true,imageNote:'Draft concept.'}).caption,/Draft concept/);
 assert.match(productImagePresentation({uploadedImage:photo,imageSlug:'gulnaar',isDemo:false,imageNote:'Illustrative fallback.'}).caption,/Illustrative fallback/);
});
