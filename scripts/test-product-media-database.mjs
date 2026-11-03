// NEW checks only. Reuse an owned stopped loopback cluster and clone its existing
// migration-010 baseline. Never accepts a remote URL or replays migrations 001–013.
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:net';
const root=process.cwd(),directory=resolve('.tmp/product-media-release');
const data=resolve('.tmp/recovery-pg-1793623783535/data');
if(!data.startsWith(resolve('.tmp')+'\\')&& !data.startsWith(resolve('.tmp')+'/'))throw Error('Workspace cluster only');
if((await readFile(join(data,'PG_VERSION'),'utf8')).trim()!=='18')throw Error('Unexpected local cluster');
const bin='C:/Program Files/PostgreSQL/18/bin';await mkdir(directory,{recursive:true});
async function run(name,args,input=''){
 return new Promise((yes,no)=>{const p=spawn(join(bin,name+'.exe'),args,{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';
 p.stdout.on('data',v=>output+=v);p.stderr.on('data',v=>output+=v);p.on('error',no);
 p.on(name==='pg_ctl'?'exit':'close',async code=>{if(name==='pg_ctl'){p.stdout.destroy();p.stderr.destroy();}if(code){await writeFile(join(directory,'database-failure.log'),output);no(Error('Local '+name+' failed; diagnostics retained privately'));}else yes(output);});p.stdin.end(input);});
}
const server=createServer();await new Promise(yes=>server.listen(0,'127.0.0.1',yes));const port=server.address().port;await new Promise(yes=>server.close(yes));
const base=['-X','-h','127.0.0.1','-p',String(port),'-U','postgres','-v','ON_ERROR_STOP=1'];
const additional=process.argv.includes('--additional');
let started=false;const db=additional?JSON.parse(await readFile(join(directory,'database-result.json'),'utf8')).database:'product_media_'+Date.now();
if(!/^product_media_[0-9]+$/.test(db))throw Error('Owned local clone identity required');
const fingerprint=`select md5(coalesce((select jsonb_agg(to_jsonb(t) order by id)::text from public.orders t),''))||':'||
 md5(coalesce((select jsonb_agg(to_jsonb(t) order by product_id,size)::text from public.product_variants t),''))||':'||
 md5(coalesce((select jsonb_agg(to_jsonb(t) order by id)::text from public.products t),''));`;
try{
 await run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 if(!additional)await run('psql',[...base,'-d','postgres','-c',`create database ${db} template postgres;`]);
 const sql=(input)=>run('psql',[...base,'-d',db,'-A','-t'],input);
 if(!additional)await sql(`update batool_checkout_internal.readiness set enabled=false,cod_ready=false,easypaisa_manual_ready=false,jazzcash_manual_ready=false;
 update public.business_settings set settings=settings||'{"cod_enabled":false,"easypaisa_enabled":false,"jazzcash_enabled":false}'::jsonb;`);
 const before=(await sql(fingerprint)).trim();
 if(!additional){
  const migration=await run('psql',[...base,'-d',db,'-f',resolve('supabase/migrations/20261102001400_product_media_activation.sql')]);
  await writeFile(join(directory,'local-migration-014.log'),migration);
 }
 if((await sql(fingerprint)).trim()!==before)throw Error('Migration changed baseline orders/products/stock');
 const result=await run('psql',[...base,'-d',db],`set batool.test_disposable='yes';\n\\i supabase/tests/${additional?'product_media_additional.sql':'product_media_activation.sql'}\n`);
 await writeFile(join(directory,additional?'database-additional-tests.log':'database-tests.log'),result);
 if(!result.includes('PASS new media')||!result.includes('ROLLBACK'))throw Error('New test marker absent');
 if((await sql(fingerprint)).trim()!==before)throw Error('Fixture rollback changed baseline');
 await writeFile(join(directory,additional?'database-additional-result.json':'database-result.json'),JSON.stringify({target:'owned loopback PostgreSQL 18 clone',database:db,baseline:'existing local migrations through 010; no 001–013 replay',migration014AppliedOnlyToClone:!additional,newFocusedBatchPassed:true,existingOrdersProductsStockUnchanged:true,fixturesRolledBack:true,syntheticAuthOnly:true,actualSessionsVerified:false,remoteAccess:false},null,2));
 console.log('PASS new media SQL batch; existing orders/products/stock unchanged before/after migration and fixture rollback. Synthetic Auth only; no remote database used.');
}finally{if(started)await run('pg_ctl',['-D',data,'-m','fast','-w','stop']);}
