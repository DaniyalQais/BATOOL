import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {loadTarget,postgresEnvironment} from './hosted-verification-guard.mjs';
try{
 const target=await loadTarget('.tmp/hosted-acceptance/target.json');if(target.projectRef!=='jcbxxgjrnkhgcspbscgb')throw Error();
 const prior=JSON.parse(await readFile(new URL('../.tmp/hosted-acceptance/operational-recovery-results.json',import.meta.url),'utf8'));if(!prior.complete||!prior.cleanup)throw Error();
 const output=new URL('../.tmp/hosted-acceptance/operational-availability.json',import.meta.url);
 try{await readFile(output);throw Error('Completed result already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
 const env=postgresEnvironment(target);
 const sql=body=>new Promise((yes,no)=>{
  const p=spawn(process.env.BATOOL_HOSTED_PSQL,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',()=>{});p.stdin.on('error',()=>{});p.on('error',()=>no(Error()));p.on('close',code=>code===0?yes(out.trim()):no(Error()));p.stdin.end(body);
 });
 if(await sql('select bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls;')!=='t')throw Error();
 await sql("set batool.test_disposable='yes';\n"+await readFile(new URL('../supabase/tests/operational_availability.sql',import.meta.url),'utf8'));
 if(await sql(`select (public.checkout_availability()='{"enabled":false,"methods":[]}'::jsonb) and (select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness) and (select bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls);`)!=='t')throw Error();
 await writeFile(output,JSON.stringify({target:target.projectRef,complete:true,newAvailabilityMatrix:'PASS',transactionRolledBack:true,allGatesClosed:true,productionTouched:false},null,2));
 console.log('PASS new disposable availability matrix: shipping/policy/instructions/tax/recovery/handling prerequisites; wallet details alone do not enable a method. Rolled back; all gates closed.');
}catch{console.error('New availability check incomplete. Raw diagnostics suppressed; no production operations.');process.exitCode=1;}
