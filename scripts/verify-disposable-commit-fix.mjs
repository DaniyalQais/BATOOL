// Apply only NEW 011 to the reviewed disposable target, then run its NEW
// rollback regression. Never apply to BATOOL or replay completed suites.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadTarget,postgresEnvironment} from './hosted-verification-guard.mjs';
let applied=false;
try{
 const target=await loadTarget('.tmp/hosted-acceptance/target.json');if(target.projectRef!=='jcbxxgjrnkhgcspbscgb')throw Error();
 const pgEnv=postgresEnvironment(target);
 const sql=text=>new Promise((yes,no)=>{
  const p=spawn(process.env.BATOOL_HOSTED_PSQL,['-X','-q','-A','-t','-F','\t','-v','ON_ERROR_STOP=1'],{env:pgEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';
  p.stdout.on('data',x=>out+=x);p.stderr.on('data',()=>{});p.stdin.on('error',()=>{});p.on('error',()=>no(Error()));p.on('close',code=>code===0?yes(out.trim()):no(Error()));p.stdin.end(text);
 });
 const rows=text=>text.split(/\r?\n/).filter(Boolean).map(line=>line.split('\t'));
 const pre=rows(await sql(await readFile(new URL('../supabase/tests/order_commit_preflight.sql',import.meta.url),'utf8')));
 if(pre.length!==6||pre.slice(0,5).some(r=>r[1]!=='PASS'))throw Error();
 const baseline=JSON.parse(pre[5][1]);if(baseline.orders!==0)throw Error();
 const migration=await readFile(new URL('../supabase/migrations/20261102001100_order_commit_checks.sql',import.meta.url),'utf8');
 await sql(migration);applied=true;
 const post=rows(await sql(await readFile(new URL('../supabase/tests/order_commit_postflight.sql',import.meta.url),'utf8')));
 if(post.length!==5||post.slice(0,4).some(r=>r[1]!=='PASS')||JSON.stringify(JSON.parse(post[4][1]))!==JSON.stringify(baseline))throw Error();
 console.log('PASS new 011 disposable preflight/application/postflight; checker body and existing counts unchanged, intake closed.');
 await sql("set batool.test_disposable='yes';\n"+await readFile(new URL('../supabase/tests/order_commit_checks.sql',import.meta.url),'utf8'));
 const clean=JSON.parse(await sql(`begin read only; select json_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'stock',(select stock_quantity from public.product_variants where product_id=0 and size='M'),'closed',(select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness));rollback;`));
 if(clean.orders!==0||clean.items!==0||clean.keys!==0||clean.stock!==5||!clean.closed)throw Error();
 await writeFile(new URL('../.tmp/hosted-acceptance/commit-check-fix.json',import.meta.url),JSON.stringify({target:target.projectRef,migrationSha256:createHash('sha256').update(migration).digest('hex'),appliedOnlyToDisposable:true,preflight:'PASS',postflight:'PASS',newRollbackRegression:'PASS',cleanup:clean,syntheticRoleEvidence:true},null,2));
 const path='.tmp/hosted-acceptance/target.json';const saved=JSON.parse(await readFile(path,'utf8'));saved.acceptancePatches=['20261102001100_order_commit_checks.sql'];await writeFile(path,JSON.stringify(saved,null,2)+'\n');
 console.log('PASS new synthetic service-role regression: deferred completeness succeeds, incomplete order rejected, direct privileges denied; rollback preserved zero orders/keys and stock 5. Actual HTTP commit still pending.');
}catch{console.error(applied?'011 applied in disposable target; new verification incomplete. Do not replay migration.':'New 011 disposable preparation not confirmed; inspect state before retrying.');process.exitCode=1;}
