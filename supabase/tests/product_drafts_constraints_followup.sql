-- Focused correction of postflight row 08; never rerun migration 007.
-- New constraint-trigger entries are excluded from retained constraints.
-- Their full definitions were already returned in postflight row 07.
-- Expected definition MD5 values come from the original preflight CSV (28).
begin transaction isolation level repeatable read, read only;
with expected(table_name,constraint_name,constraint_type,definition_md5,validated,index_valid) as (values
 ('dashboard_roles','dashboard_roles_pkey','p','0a0db78b5fb70bf8475b3bd434e6842b',true,true),
 ('dashboard_roles','dashboard_roles_role_check','c','4b11c9b6407cd1eea12e9343ab720143',true,null),
 ('dashboard_roles','dashboard_roles_user_id_fkey','f','85d8b2f5f0c0f6b4dcb854efb61a8cb1',true,true),
 ('order_items','order_items_complete','t','aac6dc9e89c94dfced18fa2e02f5e5bc',true,null),
 ('order_items','order_items_line_number_check','c','377a36d7037c00172730760fd0f9c944',true,null),
 ('order_items','order_items_order_id_fkey','f','b4935826460068aeb13a4495db51191d',true,true),
 ('order_items','order_items_order_id_product_id_selected_size_key','u','5f7dbf83bc34da3c2c215731ddb11123',true,true),
 ('order_items','order_items_pkey','p','a1f0f2b70c8dd68b6efadc520e34c60e',true,true),
 ('order_items','order_items_product_id_selected_size_fkey','f','45730d9677ef8563f8dee86e9f20749a',true,true),
 ('order_items','order_items_product_name_check','c','098960143257d613bd24b6136570655f',true,null),
 ('order_items','order_items_quantity_check','c','3b3dcc7b57a261b25388a7de881077a3',true,null),
 ('order_items','order_items_selected_size_check','c','9fc5b77a357acec19ae103c6fdbc3a79',true,null),
 ('order_items','order_items_unit_price_minor_check','c','0190470cfa170d2069f434fa75da0b50',true,null),
 ('product_image_assets','product_image_assets_byte_size_check','c','d8756630568647ca3cbae2cb390fca07',true,null),
 ('product_image_assets','product_image_assets_height_check','c','8599b2f251cd7d7394756903c41e10ad',true,null),
 ('product_image_assets','product_image_assets_pkey','p','888f9570307d459c252caf35931d9d85',true,true),
 ('product_image_assets','product_image_assets_product_id_fkey','f','d2aeb635b2992b1b30f91dbde2b80598',true,true),
 ('product_image_assets','product_image_assets_sha256_check','c','c294edbecbbf522ce8f57ec2f6dfa160',true,null),
 ('product_image_assets','product_image_assets_uploaded_by_fkey','f','c2f3cc018337a7baedf19932b32af5e6',true,true),
 ('product_image_assets','product_image_assets_width_check','c','b4d3d8823f22920cbe9478331089bfd0',true,null),
 ('product_variants','product_variants_pkey','p','73c9bfe236c2741b7028c8e79ba83be2',true,true),
 ('product_variants','product_variants_product_id_fkey','f','d2aeb635b2992b1b30f91dbde2b80598',true,true),
 ('product_variants','product_variants_size_check','c','525eae09ca2fe5dcbcb92512c8f4e2fa',true,null),
 ('product_variants','product_variants_stock_quantity_check','c','5949bfcddc01e0979b45425fe37a1962',true,null),
 ('products','products_card_zoom_check','c','4fe3df2d92454994d4a0331807789dd9',true,null),
 ('products','products_category_check','c','41a24633d1887fd7972606dc7af15557',true,null),
 ('products','products_color_check','c','9a05c049dce07e5c77ba8deff957f54d',true,null),
 ('products','products_currency_check','c','59e3dcefcc212b1743c882e5d7879829',true,null),
 ('products','products_description_check','c','d1291332fd849dfdf984be0a5a57c732',true,null),
 ('products','products_edit_revision_check','c','866b713f77925dd5285c3344b291b377',true,null),
 ('products','products_editor_description_length','c','383b7b0fe9cabfaf39c611984bb68d2e',true,null),
 ('products','products_editor_name_length','c','0a2cdb940c9da310b470112bdda8b5a7',true,null),
 ('products','products_id_check','c','2c0c8899f3c0b77af8a4b56f7fc5bd16',true,null),
 ('products','products_image_slug_check','c','d3fbfdc4135e5add84fdf8436d42daa0',true,null),
 ('products','products_main_image_path_fkey','f','549e466da4fddbf7132508887cd773cd',true,true),
 ('products','products_main_image_valid','c','e95c12854b1a71112da54596f399b3a6',true,null),
 ('products','products_name_check','c','ca8e115e9dd2c3d582b1a7191fa08bdb',true,null),
 ('products','products_piece_count_check','c','fb28a1d9ca0efc7f92639dc665903bd7',true,null),
 ('products','products_pkey','p','4c6419b3704337bbfe50f018842a9ad3',true,true),
 ('products','products_price_minor_check','c','ce4f4dc62f8c61cfedba20d373828bdf',true,null),
 ('products','products_slug_check','c','e63ea9ab2686235875db28cb73ee7bbf',true,null),
 ('products','products_slug_key','u','687397275d0e852fb2a4b50394adffee',true,true),
 ('products','products_sort_order_check','c','bf4b30f02b5c4d9058a91dd5ce3bc423',true,null),
 ('products','products_subcategory_check','c','d390efb47308118a7606466b3cc64cad',true,null),
 ('products','products_tag_check','c','325813591e53b272fb8d1ede6904df99',true,null)),
actual as (
 select c.conrelid::regclass::text as table_name,c.conname::text as constraint_name,
   c.contype::text as constraint_type,md5(pg_get_constraintdef(c.oid)) as definition_md5,
   c.convalidated as validated,i.indisvalid as index_valid,pg_get_constraintdef(c.oid) as definition
 from pg_constraint c left join pg_index i on i.indexrelid=c.conindid
 where c.conrelid in ('public.products'::regclass,'public.product_variants'::regclass,
   'public.product_image_assets'::regclass,'public.dashboard_roles'::regclass,'public.order_items'::regclass)
 and c.conname not in ('product_image_asset_path','products_permanent_ids','products_draft_identity',
   'products_slug_length','products_tag_length','products_complete_draft','variants_complete_draft')
), differences as (
 select coalesce(e.table_name,a.table_name) as table_name,
   coalesce(e.constraint_name,a.constraint_name) as constraint_name,
   case when e.constraint_name is null then 'unexpected'
        when a.constraint_name is null then 'missing' else 'changed' end as difference,
   to_jsonb(e) as expected,to_jsonb(a) as actual
 from expected e full outer join actual a using (table_name,constraint_name)
 where e.constraint_name is null or a.constraint_name is null
   or row(e.constraint_type,e.definition_md5,e.validated,e.index_valid)
      is distinct from row(a.constraint_type,a.definition_md5,a.validated,a.index_valid)
)
select '08_retained_constraints_followup' as check_name,
 'expected_count 45; actual_count 45; retained_matches_preflight true; differences []' as expected,
 jsonb_build_object('read_only',current_setting('transaction_read_only'),
   'expected_count',(select count(*) from expected),
   'actual_count',(select count(*) from actual),
   'retained_matches_preflight',not exists(select 1 from differences),
   'differences',coalesce((select jsonb_agg(to_jsonb(d) order by table_name,constraint_name) from differences d),'[]'::jsonb)) as actual;
rollback;
