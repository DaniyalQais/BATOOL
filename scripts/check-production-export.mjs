// Offline synthetic export only. Never loads catalog/settings from BATOOL.
import { spawn } from 'node:child_process';
const preview=process.argv[2]==='--preview';
if(!preview&&process.argv[2]!=='--closed')throw Error('Choose --preview or --closed');
const project='https://abcdefghijklmnopqrst.supabase.co';
const env={...process.env,CATALOG_SOURCE:'demo',SUPABASE_URL:project,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_export_only',
 BATOOL_LOCAL_CHECKOUT_URL:'',BATOOL_CHECKOUT_ENDPOINT:preview?project+'/functions/v1/secure-checkout':'',
 BATOOL_CHECKOUT_RELEASE:preview?'true':'false',BATOOL_RECOVERY_RELEASE:preview?'true':'false',NEXT_TELEMETRY_DISABLED:'1'};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{env,stdio:'inherit',windowsHide:true});
child.on('error',()=>{console.error('Offline export could not start');process.exitCode=1;});
child.on('close',code=>{process.exitCode=code??1;});
