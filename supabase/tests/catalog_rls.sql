-- Run only after identifying the intended project, applying migrations and
-- reviewing conflicts. Test fixtures are rolled back; no real catalog edits persist.
begin;
insert into public.products (
  id, slug, name, description, price_minor, image_slug, subcategory, color, tag, active, is_demo
) values
  (2000000000, 'batool-rls-visible', 'RLS test', 'Test fixture', 0, 'gulnaar', 'Daily Pret', '#000000', 'Test', true, true),
  (2000000001, 'batool-rls-hidden', 'RLS test', 'Test fixture', 0, 'gulnaar', 'Daily Pret', '#000000', 'Test', false, true);
insert into public.product_variants (product_id, size, active) values
  (2000000000, 'S', true), (2000000000, 'M', false), (2000000001, 'L', true);

set local role anon;
do $$
begin
  if (select count(*) from public.products where id >= 2000000000) <> 1 then
    raise exception 'RLS failure: product visibility';
  end if;
  if (select count(*) from public.product_variants where product_id >= 2000000000) <> 1 then
    raise exception 'RLS failure: variant visibility';
  end if;
  if exists (select 1 from public.products where not active) or
     exists (select 1 from public.product_variants where not active) then
    raise exception 'RLS failure: inactive rows exposed';
  end if;
  begin
    insert into public.products (id) values (2000000002);
    raise exception 'RLS failure: product insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.products set name = 'forbidden' where id = 2000000000;
    raise exception 'RLS failure: product update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.products where id = 2000000000;
    raise exception 'RLS failure: product delete allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.product_variants (product_id, size) values (2000000000, 'XL');
    raise exception 'RLS failure: variant insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.product_variants set stock_quantity = 1 where product_id = 2000000000;
    raise exception 'RLS failure: variant update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.product_variants where product_id = 2000000000;
    raise exception 'RLS failure: variant delete allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
