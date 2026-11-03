// Offline-only artifact preparation. Never contacts a Supabase/hosting API.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const local=await readFile(new URL('../.env.local',import.meta.url),'utf8');
const url=local.match(/^SUPABASE_URL\s*=\s*["']?(https:\/\/[a-z0-9]{20}\.supabase\.co)["']?\s*$/m)?.[1];
if(!url||url.includes('jcbxxgjrnkhgcspbscgb'))throw Error('Production identity unavailable or disposable');
const files=['src/features/checkout/model/contracts.ts','src/features/checkout/model/availability.ts',
 'supabase/functions/_shared/checkout-handler.ts','supabase/functions/secure-checkout/index.ts'];
const expected=[0,1,2,1];const parts=[],sources=[];
for(const [i,file]of files.entries()){
 const body=await readFile(new URL('../'+file,import.meta.url),'utf8');
 if(body.split(/\r?\n/).filter(line=>line.startsWith('import ')).length!==expected[i])throw Error('Review new imports');
 sources.push({file,sha256:createHash('sha256').update(body).digest('hex')});
 parts.push(body.replace(/^import .*;\r?\n/gm,''));
}
const dir=new URL('../.tmp/production-checkout/',import.meta.url);await mkdir(dir,{recursive:true});
await writeFile(new URL('secure-checkout.bundle.ts',dir),parts.join('\n'));
const plan={preparedOnly:true,projectRef:new URL(url).hostname.split('.')[0],endpoint:url+'/functions/v1/secure-checkout',
 function:'secure-checkout',entrypoint:'index.ts',artifact:'.tmp/production-checkout/secure-checkout.bundle.ts',verify_jwt:false,
 acceptedMigrations:'001–012',newMigration:'20261102001300_checkout_recovery_order_validation.sql',sources,
 initialBackendFlags:{BATOOL_CHECKOUT_ENABLED:'false',BATOOL_RECOVERY_ENABLED:'false'},
 backendSecretNames:['BATOOL_CHECKOUT_SCOPE_SECRET','BATOOL_CHECKOUT_ORIGINS'],platformNames:['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],
 storefrontFlags:{BATOOL_CHECKOUT_RELEASE:'false',BATOOL_RECOVERY_RELEASE:'false'},
 allowedOrigins:['https://batool-lake.vercel.app'],originStatus:'User-confirmed; old chatgpt.site origin excluded; no custom domain confirmed',
 admission:{strategy:'fixed server-selected HMAC cohorts; no address-header trust',perCohortPerMinute:30,globalPerMinute:120,capacityApprovalPending:true},
 rollback:['Close intake/recovery and keep database/method/build gates off','Restore reviewed previous function artifact and static release if needed','Keep signing secret, existing orders, stock, retry mappings and audit intact','No down migration or replay of 001–012; repair database forward'],
 constraints:['no production writes or deployment authorized','all DB readiness and payment preferences remain off','manual 013 preflight/result review before one application','no disposable fixtures/scripts against production']};
await writeFile(new URL('deployment-plan.json',dir),JSON.stringify(plan,null,2)+'\n');
console.log('Prepared production-only target manifest, source hashes and credential-free function bundle locally. No remote requests.');
