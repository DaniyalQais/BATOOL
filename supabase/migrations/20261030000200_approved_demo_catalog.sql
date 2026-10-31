-- Approved stitched design-preview fixtures only: 6 products, 24 variants.
-- IDs 9 and 10 are reserved and must not be reused. All stock remains unknown.
-- No upserts: ID/slug conflicts must be reviewed rather than overwritten.
begin;
insert into public.products (id, slug, name, description, price_minor, currency, image_slug, image_note, card_position, card_zoom, category, piece_count, subcategory, color, tag, active, is_demo, sort_order) values
  (0, 'gulnaar', 'Gulnaar', '3-piece stitched ensemble · Dusty mauve.', 895000, 'PKR', 'gulnaar', null, '50% 6%', null, 'Stitched', 3, 'Daily Pret', '#b58995', '3-Piece Stitched', true, true, 0),
  (2, 'meher', 'Meher', '3-piece stitched formalwear · Deep plum.', 1495000, 'PKR', 'meher', null, '50% 7%', null, 'Stitched', 3, 'Festive Edit', '#59364d', '3-Piece Festive', true, true, 1),
  (3, 'saba', 'Saba', '3-piece stitched ensemble · Sage.', 745000, 'PKR', 'saba', null, '50% 5%', null, 'Stitched', 3, 'Daily Pret', '#a1ac95', 'Signature 3-Piece', true, true, 2),
  (8, 'noor', 'Noor', '3-piece stitched ensemble · Ivory.', 695000, 'PKR', 'noor', null, '50% 5%', null, 'Stitched', 3, 'Daily Pret', '#e7dfca', '3-Piece Stitched', true, true, 3),
  (7, 'mira', 'Mira', '3-piece stitched formalwear · Plum palette.', 1245000, 'PKR', 'mira', 'Reused Meher sample portrait with an editorial card zoom; not separate product photography.', '56% 28%', 1.7, 'Stitched', 3, 'Luxury Formals', '#59364d', '3-Piece Formal', true, true, 4),
  (11, 'zeenat', 'Zeenat', '3-piece stitched festive ensemble · Rose mauve.', 1095000, 'PKR', 'zeenat', 'Reused Gulnaar sample portrait for festive concept styling; not separate product photography.', '35% 43%', 1.6, 'Stitched', 3, 'Festive Edit', '#b58995', '3-Piece Festive', true, true, 5);

insert into public.product_variants (product_id, size, active, stock_quantity) values
  (0, 'S', true, null),
  (0, 'M', true, null),
  (0, 'L', true, null),
  (0, 'XL', true, null),
  (2, 'S', true, null),
  (2, 'M', true, null),
  (2, 'L', true, null),
  (2, 'XL', true, null),
  (3, 'S', true, null),
  (3, 'M', true, null),
  (3, 'L', true, null),
  (3, 'XL', true, null),
  (8, 'S', true, null),
  (8, 'M', true, null),
  (8, 'L', true, null),
  (8, 'XL', true, null),
  (7, 'S', true, null),
  (7, 'M', true, null),
  (7, 'L', true, null),
  (7, 'XL', true, null),
  (11, 'S', true, null),
  (11, 'M', true, null),
  (11, 'L', true, null),
  (11, 'XL', true, null);
commit;
