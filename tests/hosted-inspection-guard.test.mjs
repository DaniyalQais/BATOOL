import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInspectionTarget, validateTarget } from '../scripts/hosted-verification-guard.mjs';
const ref='abcdefghijklmnopqrst';
const prod='https://zyxwvutsrqponmlkjihg.supabase.co';
const target={name:'batool-checkout-acceptance-20261102',disposable:true,projectRef:ref,projectUrl:`https://${ref}.supabase.co`,dbHost:`db.${ref}.supabase.co`,dbUser:'postgres',dbPort:5432,origin:'http://127.0.0.1:43871',schemaReadyThrough:null,noProductionData:false};
test('discovery permits unverified schema without granting mutation readiness',()=>{
  const checked=validateInspectionTarget(target,prod,ref);
  assert.equal(checked.schemaReadyThrough,null); assert.equal(checked.noProductionData,false);
  assert.throws(()=>validateTarget(checked,prod,ref));
});
test('inspection still rejects production, mismatched confirmation and foreign database',()=>{
  assert.throws(()=>validateInspectionTarget(target,target.projectUrl,ref));
  assert.throws(()=>validateInspectionTarget(target,prod,'wrong'));
  assert.throws(()=>validateInspectionTarget({...target,dbHost:'db.zyxwvutsrqponmlkjihg.supabase.co'},prod,ref));
});
test('ready mutation targets retain the previous strict prerequisites',()=>{
  assert.doesNotThrow(()=>validateTarget({...target,schemaReadyThrough:'010',noProductionData:true},prod,ref));
  assert.throws(()=>validateTarget({...target,schemaReadyThrough:'010',noProductionData:false},prod,ref));
  assert.throws(()=>validateTarget({...target,schemaReadyThrough:null,noProductionData:true},prod,ref));
});
