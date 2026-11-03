// Final closure proof + local evidence consolidation. No fixture execution.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {loadTarget,postgresEnvironment} from './hosted-verification-guard.mjs';
try{
 const target=await loadTarget('.tmp/hosted-acceptance/target.json');if(target.projectRef!=='jcbxxgjrnkhgcspbscgb')throw Error();
 const dir=new URL('../.tmp/hosted-acceptance/',import.meta.url);const records=[];
 for(const entry of await readdir(dir,{withFileTypes:true}))if(entry.isDirectory())try{const record=JSON.parse(await readFile(new URL(entry.name+'/results.json',dir),'utf8'));records.push({file:entry.name+'/results.json',...record});}catch{}
 const access=JSON.parse(await readFile(new URL('pending-access-results.json',dir),'utf8'));if(!access.complete)throw Error();
 const setup=['actual Owner revision-checked settings and private-recipient save','public settings allowlist and service-only RPC restrictions'];
 const orders=['hosted commit survives discarded response; cart retained until confirmation','concurrent hosted retries and committed resolution preserve one order/deduction; foreign scope isolated','reload of confirmed receipt does not consume cart again','expired intent retirement and lost resolve retry keep same durable replacement identity','pinned replacement quote, concurrent creation and lost replacement response produce one additional order/deduction'];
 const evidence=[...setup,...orders].map(check=>{const record=records.find(r=>r.results.some(x=>x.check===check&&x.result==='PASS'));if(!record)throw Error();return{check,result:'PASS',evidence:record.file};});
 const patch=JSON.parse(await readFile(new URL('commit-check-fix.json',dir),'utf8'));if(patch.newRollbackRegression!=='PASS'||!patch.appliedOnlyToDisposable)throw Error();
 const closed=await fetch(target.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Origin:target.origin,'Content-Type':'application/json'},body:'{"action":"scope"}'});if(closed.status!==503||(await closed.json()).error!=='checkout_unavailable')throw Error();
 const response=await fetch(`https://api.supabase.com/v1/projects/${target.projectRef}/config/auth`,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${process.env.BATOOL_HOSTED_MANAGEMENT_TOKEN||process.env.SUPABASE_ACCESS_TOKEN}`}});if(!response.ok||(await response.json()).external_anonymous_users_enabled!==false)throw Error();
 const final=await new Promise((yes,no)=>{
  const p=spawn(process.env.BATOOL_HOSTED_PSQL,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:postgresEnvironment(target),windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',()=>{});p.stdin.on('error',()=>{});p.on('error',()=>no(Error()));p.on('close',code=>code===0?yes(JSON.parse(out.trim())):no(Error()));
  p.stdin.end(`begin transaction isolation level repeatable read, read only;
   select json_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'customers',(select count(*) from public.order_customer_details),'keys',(select count(*) from public.order_creation_keys),'history',(select count(*) from public.order_status_history),'contexts',(select count(*) from public.order_checkout_details),'stock',(select stock_quantity from public.product_variants where product_id=0 and size='M'),'users',(select count(*) from auth.users),'roles',(select count(*) from public.dashboard_roles),
    'closed',(select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness),
    'methods_off',(select bool_and(settings->'cod_enabled'='false'::jsonb and settings->'easypaisa_enabled'='false'::jsonb and settings->'jazzcash_enabled'='false'::jsonb) from public.business_settings),
    'public_off',public.get_public_business_settings()->'checkout_enabled'='false'::jsonb and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb,
    'snapshots',(select bool_and(currency='PKR' and subtotal_minor=100001 and shipping_minor=25001 and tax_minor=0 and discount_minor=0 and total_minor=125002 and fulfillment_status='pending' and payment_status='unpaid') from public.orders),
    'cod_only',(select bool_and(payment_method='cod' and verification_mode='cash_on_delivery' and wallet_account_title is null and wallet_account_number is null) from public.order_checkout_details));rollback;`);
 });
 if(final.orders!==2||final.items!==2||final.customers!==2||final.keys!==2||final.history!==4||final.contexts!==2||final.stock!==3||final.users!==0||final.roles!==0||!final.closed||!final.methods_off||!final.public_off||!final.snapshots||!final.cod_only)throw Error();
 const summary={target:target.projectRef,hostedClientOrderChecks:'PASS',actualSessionDataApiMatrix:'PASS',fullProductionStorefrontUi:'NOT EXECUTED',evidence,accessEvidence:'pending-access-results.json',syntheticRoleRegression:{evidence:'commit-check-fix.json',distinctFromActualAuth:true},finalClosure:{edgeIntake:'OFF',anonymousAuth:'RESTORED OFF',database:final},productionMigration011:'PENDING MANUAL REVIEW/APPLICATION',logoutBoundary:'Refresh revoked; issued JWT valid until expiry unless role mapping revoked',operationalLostCredentialRecovery:'PENDING',productionWrites:false};
 await writeFile(new URL('acceptance-summary.json',dir),JSON.stringify(summary,null,2));
 console.log('PASS final closure: Edge intake off; anonymous Auth restored off; all database/payment/public gates off; temporary users/roles zero.');
 console.log('PASS final fixture state: two complete unpaid COD orders, unchanged PKR snapshots, two stock deductions (M 5 to 3).');
 console.log('Consolidated separate hosted/actual-session/synthetic evidence. Production 011 and operational recovery remain pending.');
}catch{console.error('Final acceptance consolidation incomplete; no overall closure claim. Raw diagnostics suppressed.');process.exitCode=1;}
