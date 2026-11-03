// Local artifact preparation ONLY. Public build dependencies may be resolved;
// no Supabase API, uploads or deployment mode.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {DECODER_BUCKET,DECODER_PATH,DECODER_BYTES,DECODER_SHA256,verifiedDecoderAsset} from '../supabase/functions/_shared/product-image-decoder-asset.ts';
const directory='.tmp/product-media-release';
await mkdir(directory,{recursive:true});
const bytes=await readFile('supabase/functions/validate-product-image/assets/magick.wasm');
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
if(bytes.length!==DECODER_BYTES||sha(bytes)!==DECODER_SHA256)throw Error('Pinned decoder mismatch; stop without packaging');
const compressed=gzipSync(bytes,{level:9});
await verifiedDecoderAsset(new Blob([compressed]));
await writeFile(directory+'/magick.wasm.gz',compressed);
const deno=process.env.BATOOL_LOCAL_DENO||resolve('.tmp/deno-runtime/package/deno.exe');
// Select native ESM exports (not tslib's Node CommonJS compatibility wrapper).
const args=['bundle','--no-remote','--frozen','--conditions=module','--config','supabase/functions/validate-product-image/deno.json','--minify','--output',directory+'/index.js','supabase/functions/validate-product-image/index.ts'];
const code=await new Promise((yes,no)=>{
  const p=spawn(deno,args,{windowsHide:true,env:{...process.env,DENO_DIR:resolve('.tmp/deno-cache')},stdio:['ignore','pipe','pipe']});
  let log='';p.stdout.on('data',b=>log+=b);p.stderr.on('data',b=>log+=b);p.on('error',no);
  p.on('close',async code=>{await writeFile(directory+'/bundle.log',log);yes(code);});
});
if(code!==0)throw Error('Local bundling failed; see ignored product-media-release/bundle.log');
const bundle=await readFile(directory+'/index.js');
if(bundle.length>=5*1024*1024||bundle.includes(bytes.subarray(0,1024)))throw Error('Unexpected bundle payload');
const files=['supabase/migrations/20261102001400_product_media_activation.sql','supabase/functions/validate-product-image/index.ts',
 'supabase/functions/validate-product-image/deno.json','supabase/functions/validate-product-image/deno.lock',
 'supabase/functions/_shared/product-image-handler.ts','supabase/functions/_shared/product-image-decoder-asset.ts',
 'supabase/functions/_shared/decode-product-image.ts','supabase/functions/_shared/image-policy.ts','supabase/functions/_shared/catalog-policy.ts'];
const sources=await Promise.all(files.map(async file=>({file,sha256:sha(await readFile(file))})));
const manifest={productionProject:'cydnirqrsjrlljrjfidq',disposableProject:'jcbxxgjrnkhgcspbscgb',origin:'https://batool-lake.vercel.app',sources,
  migration:'20261102001400_product_media_activation.sql',function:'validate-product-image',metadata:{name:'validate-product-image',entrypoint_path:'index.js',verify_jwt:false},
  decoder:{bucket:DECODER_BUCKET,path:DECODER_PATH,contentType:'application/gzip',upsert:false,private:true,bytes:compressed.length,sha256:sha(compressed),decodedBytes:DECODER_BYTES,decodedSha256:DECODER_SHA256},
  bundle:{file:'index.js',bytes:bundle.length,sha256:sha(bundle)},
  mediaRelease:false,checkoutRelease:false,recoveryRelease:false,deployed:false};
await writeFile(directory+'/manifest.json',JSON.stringify(manifest,null,2));
console.log(`Prepared pinned private decoder (${compressed.length} bytes) and JavaScript bundle (${bundle.length} bytes). No deployment or upload.`);
