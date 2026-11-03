-- NEW availability projection only; disposable target guard is in the runner.
-- All synthetic configuration changes roll back; no orders/stock touched.
begin;
do $$
declare ready jsonb;
begin
  if current_setting('batool.test_disposable',true) is distinct from 'yes' then raise exception 'Disposable guard required'; end if;
  update public.business_settings set settings=settings||'{"cod_enabled":true,"easypaisa_enabled":false,"jazzcash_enabled":false,"shipping":{"country_code":"PK","currency":"PKR","mode":"free","fee_minor":0},"policy_state":"approved","policy_text":"SYNTHETIC AVAILABILITY POLICY ONLY","payment_instructions_state":"approved","payment_instructions":"SYNTHETIC AVAILABILITY INSTRUCTIONS ONLY"}'::jsonb where id;
  update batool_checkout_internal.readiness set enabled=true,cod_ready=true,zero_tax_reviewed=true,easypaisa_manual_ready=false,jazzcash_manual_ready=false;
  if public.checkout_availability()<>'{"enabled":false,"methods":[]}'::jsonb then raise exception 'Recovery prerequisite bypass'; end if;
  update batool_checkout_internal.recovery_controls set enabled=true,verification_policy_ref=gen_random_uuid();
  ready:='{"enabled":true,"methods":["cod"]}'::jsonb;
  if public.checkout_availability()<>ready then raise exception 'Ready COD missing'; end if;
  update public.business_settings set settings=jsonb_set(settings,'{shipping}','{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null}'::jsonb);
  if public.checkout_availability()->'enabled'<>'false'::jsonb then raise exception 'Unconfigured shipping bypass'; end if;
  update public.business_settings set settings=jsonb_set(settings,'{shipping}','{"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":0}'::jsonb);
  update public.business_settings set settings=jsonb_set(settings,'{policy_state}','"draft"');
  if public.checkout_availability()->'enabled'<>'false'::jsonb then raise exception 'Draft policy bypass'; end if;
  update public.business_settings set settings=jsonb_set(settings,'{policy_state}','"approved"');
  update public.business_settings set settings=jsonb_set(settings,'{payment_instructions_state}','"draft"');
  if public.checkout_availability()->'enabled'<>'false'::jsonb then raise exception 'Draft instructions bypass'; end if;
  update public.business_settings set settings=jsonb_set(settings,'{payment_instructions_state}','"approved"');
  update batool_checkout_internal.readiness set zero_tax_reviewed=false;
  if public.checkout_availability()->'enabled'<>'false'::jsonb then raise exception 'Tax prerequisite bypass'; end if;
  update batool_checkout_internal.readiness set zero_tax_reviewed=true,cod_ready=false;
  if public.checkout_availability()->'enabled'<>'false'::jsonb then raise exception 'COD handling bypass'; end if;
  update batool_checkout_internal.readiness set cod_ready=true;
  update public.business_settings set settings=settings||'{"easypaisa_enabled":true,"easypaisa_account_title":"SYNTHETIC FIXTURE","easypaisa_account_number":"00000000000"}'::jsonb;
  if public.checkout_availability()<>ready then raise exception 'Saved wallet details enabled method prematurely'; end if;
  update batool_checkout_internal.readiness set easypaisa_manual_ready=true;
  if public.checkout_availability()<>'{"enabled":true,"methods":["cod","easypaisa"]}'::jsonb then raise exception 'Wallet handling gate missing'; end if;
  if public.get_public_business_settings()->'checkout_enabled'<>'false'::jsonb then raise exception 'Legacy static DTO changed'; end if;
end $$;
rollback;
