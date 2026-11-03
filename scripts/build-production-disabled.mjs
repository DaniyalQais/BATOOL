// Production public inputs only; local static build, no publication or mutations.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const values={};for(const line of (await readFile('.env.local','utf8')).split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(m)values[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}
const project='https://cydnirqrsjrlljrjfidq.supabase.co';
const activationPreparation=process.argv.includes('--activation-preparation');
const mediaPreparation=process.argv.includes('--product-media-preparation');
const reportDirectory=mediaPreparation?'.tmp/product-media-release':activationPreparation?'.tmp/activation-preparation':'.tmp/production-disabled-release';
if(values.SUPABASE_URL!==project)throw Error('Production public binding required');
const env={...process.env,SUPABASE_URL:project,SUPABASE_PUBLISHABLE_KEY:values.SUPABASE_PUBLISHABLE_KEY,CATALOG_SOURCE:'supabase',BATOOL_CHECKOUT_ENDPOINT:project+'/functions/v1/secure-checkout',BATOOL_CHECKOUT_RELEASE:'false',BATOOL_RECOVERY_RELEASE:'false',BATOOL_PRODUCT_MEDIA_RELEASE:'false',BATOOL_LOCAL_CHECKOUT_URL:'',NEXT_TELEMETRY_DISABLED:'1'};
const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{env,stdio:'inherit',windowsHide:true});p.on('error',reject);p.on('close',resolve);});
if(code!==0){console.error('STOP: production public-data build failed; no publication performed.');process.exit(code??1);}
const catalog=await readFile('src/features/catalog/model/generated/catalog.ts','utf8');
if(!catalog.includes('"source": "supabase"'))throw Error('Synthetic catalog must never be published');
const pages=['index.html','checkout/index.html','admin/login/index.html','help/delivery/index.html'];
for(const path of pages){const html=await readFile('out/'+path,'utf8');if(!html.includes('noindex'))throw Error('noindex missing');}
const scope=await readFile('.tmp/production-disabled-release/production-scope-secret.private','utf8');
const hashes=[];
async function walk(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const relative=prefix+entry.name;if(entry.isDirectory())await walk(dir+'/'+entry.name,relative+'/');else{const bytes=await readFile(dir+'/'+entry.name);if(bytes.includes(Buffer.from(scope)))throw Error('Server secret found in export');hashes.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await walk('out');
await mkdir(reportDirectory,{recursive:true});
await writeFile(reportDirectory+'/static-manifest.json',JSON.stringify({origin:'https://batool-lake.vercel.app',project,endpoint:env.BATOOL_CHECKOUT_ENDPOINT,catalogSource:'supabase',checkoutRelease:false,recoveryRelease:false,productMediaRelease:false,noindex:true,files:hashes},null,2));
console.log('PASS: production-data static export prepared; release flags false, noindex retained, server signing secret excluded. No publication performed.');
