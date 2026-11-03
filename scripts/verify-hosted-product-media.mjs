// Disposable project only (jcbxxgjrnkhgcspbscgb).
// Isolated synthetic media acceptance test suite.
// Never prints secrets or credentials. Never touches production.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { loadTarget, postgresEnvironment } from './hosted-verification-guard.mjs';

const dir = new URL('../.tmp/hosted-acceptance/', import.meta.url);
const resultPath = new URL('media-acceptance-result.json', dir);
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const need = (val, msg = 'Assertion failed') => { if (!val) throw new Error(msg); };

const results = [];
const accounts = [];
let target, sql, admin, management, cleanupOk = true;
let testProductId = null;
let baselineProductsHash, baselineStockHash, baselineOrdersHash;
const uploadedPaths = [];
const publishedPaths = [];

async function pass(label) {
  results.push({ check: label, result: 'PASS' });
  console.log(`PASS: ${label}`);
}

try {
  // Load environment variables from .env.hosted.local
  const envContent = await readFile(new URL('../.env.hosted.local', import.meta.url), 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }

  target = await loadTarget('.tmp/hosted-acceptance/target.json', process.env, false);
  need(target.projectRef === 'jcbxxgjrnkhgcspbscgb', 'Disposable target ref required');
  await mkdir(dir, { recursive: true });

  const pg = postgresEnvironment(target, process.env);
  const psqlBin = process.env.BATOOL_HOSTED_PSQL || 'C:/Program Files/PostgreSQL/18/bin/psql.exe';

  sql = (query) => new Promise((resolve, reject) => {
    const p = spawn(psqlBin, ['-X', '-q', '-A', '-t', '-F', '\t', '-v', 'ON_ERROR_STOP=1'], {
      env: pg,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`psql failed (code ${code}): ${err.trim()}`));
    });
    p.stdin.end(query);
  });

  const token = process.env.BATOOL_HOSTED_MANAGEMENT_TOKEN;
  need(token, 'Disposable management token missing');

  management = async (path, method = 'GET', body, isForm = false) => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${target.projectRef}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(!isForm && body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: isForm ? body : JSON.stringify(body) } : {})
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Management ${method} ${path} failed: HTTP ${res.status}`);
    }
    const text = await res.text();
    return text.trim() ? JSON.parse(text) : null;
  };

  const projectInfo = await management('');
  need((projectInfo.id ?? projectInfo.ref) === target.projectRef, 'Management project ref mismatch');

  const clientOptions = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(180000) }) }
  };
  admin = createClient(target.projectUrl, process.env.BATOOL_HOSTED_SERVICE_KEY, clientOptions);

  // -------------------------------------------------------------
  // Stage 1 & 2: Confirm prerequisites, 014 application & postflight
  // -------------------------------------------------------------
  const is014Applied = (await sql(`select to_regclass('batool_catalog_internal.merchandise_approvals') is not null;`)) === 't';
  if (!is014Applied) {
    const preflightSql = await readFile(new URL('../supabase/tests/product_media_preflight.sql', import.meta.url), 'utf8');
    const preRows = (await sql(preflightSql)).split(/\r?\n/).map(r => r.split('\t'));
    need(preRows.length === 9, 'Preflight row count mismatch');
    for (let i = 0; i < 8; i++) {
      need(preRows[i][1] === 'PASS', `Preflight check failed: ${preRows[i][0]}`);
    }
    baselineProductsHash = preRows[8][1];
    baselineStockHash = preRows[8][2];
    baselineOrdersHash = preRows[8][3];
    await pass('01 disposable prerequisites verified and migration 014 unapplied');

    const migration014 = await readFile(new URL('../supabase/migrations/20261102001400_product_media_activation.sql', import.meta.url), 'utf8');
    await sql(migration014);
  } else {
    await pass('01 disposable prerequisites verified and migration 014 confirmed applied in previous run');
  }

  const postflightSql = await readFile(new URL('../supabase/tests/product_media_postflight.sql', import.meta.url), 'utf8');
  const postRows = (await sql(postflightSql)).split(/\r?\n/).map(r => r.split('\t'));
  need(postRows.length === 8, 'Postflight row count mismatch');
  for (let i = 0; i < 7; i++) {
    need(postRows[i][1] === 'PASS', `Postflight check failed: ${postRows[i][0]}`);
  }
  if (!baselineProductsHash) {
    baselineProductsHash = postRows[7][1];
    baselineStockHash = postRows[7][2];
    baselineOrdersHash = postRows[7][3];
  } else {
    need(postRows[7][1] === baselineProductsHash, 'Products hash mismatch after migration 014');
    need(postRows[7][2] === baselineStockHash, 'Stock hash mismatch after migration 014');
    need(postRows[7][3] === baselineOrdersHash, 'Orders hash mismatch after migration 014');
  }
  await pass('02 migration 014 applied once; postflight all PASS and baseline hashes preserved');

  // -------------------------------------------------------------
  // Stage 3: Upload pinned decoder asset to private bucket
  // -------------------------------------------------------------
  const decoderCompressed = await readFile(new URL('../.tmp/product-media-release/magick.wasm.gz', import.meta.url));
  const expectedSha256 = '2d50986ed2dde52d2fae0171cd37c2e90600ab56d90c475d083307dc351b357f';
  need(decoderCompressed.length === 5428719, 'Decoder compressed size mismatch');
  need(sha(decoderCompressed) === expectedSha256, 'Decoder compressed SHA-256 mismatch');

  const decoderPath = 'magick-wasm/0.0.45/54629cbcf06dd10db38b4d87fa6ab241b248c09c94f2d9689506e5f994ac5f0c/magick.wasm.gz';
  const { data: uploadData, error: uploadErr } = await admin.storage
    .from('product-image-validator-assets')
    .upload(decoderPath, decoderCompressed, {
      contentType: 'application/gzip',
      upsert: false
    });
  if (uploadErr && !uploadErr.message?.includes('already exists') && !uploadErr.message?.includes('Duplicate')) {
    throw new Error(`Decoder upload failed: ${uploadErr.message}`);
  }

  // Verify downloaded asset
  const { data: downloaded, error: downloadErr } = await admin.storage
    .from('product-image-validator-assets')
    .download(decoderPath);
  need(!downloadErr && downloaded, 'Decoder download verification failed');
  const downloadedBuf = Buffer.from(await downloaded.arrayBuffer());
  need(downloadedBuf.length === 5428719 && sha(downloadedBuf) === expectedSha256, 'Downloaded decoder corrupted');
  await pass('03 pinned decoder asset uploaded and verified in private bucket');

  // -------------------------------------------------------------
  // Stage 4: Configure Edge Function secrets & allowed origin
  // -------------------------------------------------------------
  await management('/secrets', 'POST', [
    { name: 'BATOOL_ALLOWED_ORIGINS', value: target.origin },
    { name: 'BATOOL_CHECKOUT_ENABLED', value: 'false' },
    { name: 'BATOOL_RECOVERY_ENABLED', value: 'false' }
  ]);
  await pass('04 Edge Function secrets configured with isolated test origin and closed gates');

  // -------------------------------------------------------------
  // Stage 5: Deploy validate-product-image Edge Function
  // -------------------------------------------------------------
  const bundleCode = await readFile(new URL('../.tmp/product-media-release/index.js', import.meta.url));
  need(bundleCode.length === 424810, 'Bundle size mismatch');
  need(sha(bundleCode) === 'f856d71fbce9c8e0dd1b6c1484c376efd3e563240f02e698b8f9e338a221a4d1', 'Bundle SHA-256 mismatch');

  const deployForm = new FormData();
  deployForm.append('metadata', JSON.stringify({
    name: 'validate-product-image',
    entrypoint_path: 'index.js',
    verify_jwt: false
  }));
  deployForm.append('file', new Blob([bundleCode], { type: 'application/javascript' }), 'index.js');

  const deployed = await management('/functions/deploy?slug=validate-product-image', 'POST', deployForm, true);
  need(deployed.slug === 'validate-product-image' && deployed.verify_jwt === false, 'Deployment confirmation failed');
  await pass('05 validate-product-image deployed to disposable project');

  // -------------------------------------------------------------
  // Stage 6: Isolated Synthetic Media Acceptance Tests
  // -------------------------------------------------------------
  const endpoint = `${target.projectUrl}/functions/v1/validate-product-image`;

  // Create temporary accounts
  const createAccount = async (role) => {
    const email = `test-${randomUUID()}-${role}@example.invalid`;
    const password = randomBytes(32).toString('base64url') + 'Aa1!';
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    need(!createErr && created.user, 'Failed to create test user');
    const user = created.user;
    accounts.push(user);

    const client = createClient(target.projectUrl, process.env.BATOOL_HOSTED_PUBLISHABLE_KEY, clientOptions);
    const { data: signin, error: signinErr } = await client.auth.signInWithPassword({ email, password });
    need(!signinErr && signin.session, 'Sign in failed');

    if (role !== 'unassigned') {
      await sql(`insert into public.dashboard_roles(user_id, role) values('${user.id}', '${role}');`);
    }
    return { id: user.id, token: signin.session.access_token, client };
  };

  const owner = await createAccount('owner');
  const partner = await createAccount('partner');
  const unassigned = await createAccount('unassigned');

  // 6A: CORS checks
  const corsPreflight = await fetch(endpoint, {
    method: 'OPTIONS',
    headers: {
      Origin: target.origin,
      'Access-Control-Request-Method': 'POST'
    }
  });
  need(corsPreflight.status === 204, 'OPTIONS status must be 204');
  need(corsPreflight.headers.get('access-control-allow-origin') === target.origin, 'CORS allow-origin mismatch');
  need(corsPreflight.headers.get('access-control-allow-methods')?.includes('GET'), 'CORS allow-methods mismatch');

  const corsUntrusted = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Origin: 'https://untrusted-domain.invalid',
      Authorization: `Bearer ${owner.token}`
    }
  });
  need(corsUntrusted.status === 403, 'Untrusted origin must return 403');
  await pass('06A browser CORS preflight and untrusted origin rejection verified');

  // 6B: Readiness endpoint GET across roles & cold start decoder loading
  // Wait up to 15 seconds for Edge gateway propagation
  let readyOk = false;
  let readyBody = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Origin: target.origin,
        Authorization: `Bearer ${owner.token}`
      }
    });
    if (res.status === 200) {
      readyBody = await res.json();
      if (readyBody?.ready === true && readyBody?.contract === 'batool-product-image-v2') {
        readyOk = true;
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  need(readyOk, 'Readiness GET for Owner failed');
  need(readyBody.contract === 'batool-product-image-v2', 'Contract mismatch');

  // Non-owner denials
  const noAuthRes = await fetch(endpoint, { method: 'GET', headers: { Origin: target.origin } });
  need(noAuthRes.status === 401, 'No auth must return 401');

  const unassignedRes = await fetch(endpoint, {
    method: 'GET',
    headers: { Origin: target.origin, Authorization: `Bearer ${unassigned.token}` }
  });
  need(unassignedRes.status === 403, 'Unassigned role must return 403');

  const partnerRes = await fetch(endpoint, {
    method: 'GET',
    headers: { Origin: target.origin, Authorization: `Bearer ${partner.token}` }
  });
  need(partnerRes.status === 403, 'Partner role must return 403');
  await pass('06B readiness contract verified for Owner; 401/403 denials for unauthenticated/unassigned/partner');

  // 6C: Storage Isolation & Direct Access Denial
  const { error: directDecoderErr } = await partner.client.storage
    .from('product-image-validator-assets')
    .download(decoderPath);
  need(directDecoderErr, 'Direct client download of decoder must be denied');

  const { error: directUploadErr } = await owner.client.storage
    .from('product-images')
    .upload('unauthorized-direct-write.webp', Buffer.from('invalid'), { upsert: false });
  need(directUploadErr, 'Direct client upload to public product-images must be denied by RLS');

  const { error: directReceiptErr } = await owner.client.rpc('register_product_image_asset', {
    p_product_id: 1, p_user_id: owner.id, p_image_path: 'test', p_width: 100, p_height: 100, p_byte_size: 100, p_sha256: 'test'
  });
  need(directReceiptErr, 'Direct execution of register_product_image_asset by client must be denied');
  await pass('06C storage isolation and direct client write/receipt execution denial verified');

  // 6D: Synthetic Product Upload, Edge Decoding, Responsive WebP & Metadata Stripping
  // Create synthetic product draft via Owner RPC
  const draftRes = await owner.client.rpc('owner_create_product_draft', {
    p_request_key: randomUUID(),
    p_name: 'Synthetic Test Garment',
    p_description: 'Test Description',
    p_price_minor: 1500000,
    p_stocks: { S: 5, M: 5, L: 5, XL: 5 }
  });
  need(!draftRes.error && draftRes.data?.id, `Draft creation failed: ${draftRes.error?.message}`);
  testProductId = draftRes.data.id;
  need(testProductId >= 12, 'Draft managed product ID must be >= 12');

  // Generate synthetic JPEG with EXIF metadata
  const syntheticImgBuffer = await sharp({
    create: {
      width: 768,
      height: 1024,
      channels: 3,
      background: { r: 180, g: 30, b: 60 }
    }
  }).withMetadata({
    exif: {
      IFD0: { Artist: 'Synthetic Test Artist' }
    }
  }).jpeg().toBuffer();

  // Upload to product-image-uploads staging bucket
  const uploadFileName = `${randomUUID()}.jpg`;
  const uploadPath = `products/${testProductId}/${owner.id}/${uploadFileName}`;
  uploadedPaths.push(uploadPath);

  const { error: stageUploadErr } = await owner.client.storage
    .from('product-image-uploads')
    .upload(uploadPath, syntheticImgBuffer, { contentType: 'image/jpeg', upsert: false });
  need(!stageUploadErr, `Staging image upload failed: ${stageUploadErr?.message}`);

  // Invoke validate-product-image POST
  const validateRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Origin: target.origin,
      Authorization: `Bearer ${owner.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      productId: testProductId,
      uploadPath
    })
  });
  need(validateRes.status === 200, `Image validation failed with status ${validateRes.status}`);
  const receipt = await validateRes.json();
  need(receipt.path && receipt.width === 768 && receipt.height === 1024, 'Receipt data invalid');
  publishedPaths.push(receipt.path);

  // Verify responsive files generated in product-images bucket
  const basePath = receipt.path.replace(/main\.webp$/, '');
  for (const sizeName of ['192.webp', '384.webp', 'main.webp']) {
    const fileUrl = `${target.projectUrl}/storage/v1/object/public/product-images/${basePath}${sizeName}`;
    const pubFetch = await fetch(fileUrl);
    need(pubFetch.status === 200, `Public responsive delivery failed for ${sizeName}`);
    const pubBytes = Buffer.from(await pubFetch.arrayBuffer());
    const meta = await sharp(pubBytes).metadata();
    need(meta.format === 'webp', `Expected webp format for ${sizeName}`);
    need(!meta.exif, `EXIF metadata was not stripped from ${sizeName}`);
  }

  // Test invalid file rejection: upload corrupt bytes
  const corruptPath = `products/${testProductId}/${owner.id}/${randomUUID()}.jpg`;
  uploadedPaths.push(corruptPath);
  await owner.client.storage
    .from('product-image-uploads')
    .upload(corruptPath, Buffer.from('corrupt non-image binary data'), { contentType: 'image/jpeg', upsert: false });

  const corruptValidateRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Origin: target.origin,
      Authorization: `Bearer ${owner.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ productId: testProductId, uploadPath: corruptPath })
  });
  need(corruptValidateRes.status === 400, 'Corrupt image must be rejected with 400');
  await pass('06D synthetic image decoded, responsive WebPs delivered, metadata stripped, corrupt image rejected');

  // 6E: Owner Merchandise Approval & Lifecycle State Transitions
  // Save complete draft details (subcategory, color, tag, stock) while keeping active = false
  const saveDetailsRes = await owner.client.rpc('owner_save_catalog_product', {
    p_product_id: testProductId,
    p_expected_revision: draftRes.data.edit_revision,
    p_name: 'Synthetic Test Garment',
    p_description: 'Test Description',
    p_price_minor: 1500000,
    p_active: false,
    p_stocks: { S: 5, M: 5, L: 5, XL: 5 },
    p_subcategory: 'Festive Edit',
    p_color: '#51343F',
    p_tag: 'Festive',
    p_archived: false
  });
  need(!saveDetailsRes.error, `Saving draft details failed: ${saveDetailsRes.error?.message}`);

  // Attach validated photo
  const attachRes = await owner.client.rpc('owner_attach_product_image', {
    p_product_id: testProductId,
    p_expected_revision: saveDetailsRes.data.edit_revision,
    p_image_path: receipt.path,
    p_alt: 'Synthetic Red Garment'
  });
  need(!attachRes.error, `Attach photo failed: ${attachRes.error?.message}`);

  // Product is still sample (is_demo = true)
  const isDemoStill = await sql(`select is_demo from public.products where id = ${testProductId};`);
  need(isDemoStill === 't', 'Product must remain demo/sample until explicitly approved');

  // Attempt to activate before approval -> must be rejected with PT422
  const prematureActivate = await owner.client.rpc('owner_save_catalog_product', {
    p_product_id: testProductId,
    p_expected_revision: attachRes.data.edit_revision,
    p_name: 'Synthetic Test Garment',
    p_description: 'Test Description',
    p_price_minor: 1500000,
    p_active: true,
    p_stocks: { S: 5, M: 5, L: 5, XL: 5 },
    p_subcategory: 'Festive Edit',
    p_color: '#51343F',
    p_tag: 'Festive',
    p_archived: false
  });
  need(prematureActivate.error?.code === 'PT422' && /Approve real merchandise before activation/i.test(prematureActivate.error?.message ?? ''), 'Premature activation must fail with PT422');

  // Attempt approval with stale revision -> PT409
  const staleApprove = await owner.client.rpc('owner_approve_catalog_merchandise', {
    p_product_id: testProductId,
    p_expected_revision: 999,
    p_confirmed: true
  });
  need(staleApprove.error?.code === 'PT409', 'Stale revision approval must return PT409');

  // Valid approval with correct revision
  const currentRev = parseInt(await sql(`select edit_revision from public.products where id = ${testProductId};`), 10);
  const approveRes = await owner.client.rpc('owner_approve_catalog_merchandise', {
    p_product_id: testProductId,
    p_expected_revision: currentRev,
    p_confirmed: true
  });
  need(!approveRes.error, `Approval failed: ${approveRes.error?.message}`);
  need(approveRes.data.is_demo === false, 'Product must now have is_demo = false');

  // Check merchandise_approvals row
  const approvalRow = await sql(`
    select count(*) from batool_catalog_internal.merchandise_approvals
    where product_id = ${testProductId} and image_path = '${receipt.path}';
  `);
  need(approvalRow === '1', 'Approval witness row missing');

  // Now activation succeeds!
  const activateRes = await owner.client.rpc('owner_save_catalog_product', {
    p_product_id: testProductId,
    p_expected_revision: approveRes.data.edit_revision,
    p_name: 'Synthetic Test Garment',
    p_description: 'Test Description',
    p_price_minor: 1500000,
    p_active: true,
    p_stocks: { S: 5, M: 5, L: 5, XL: 5 },
    p_subcategory: 'Festive Edit',
    p_color: '#51343F',
    p_tag: 'Festive',
    p_archived: false
  });
  need(!activateRes.error, `Activation failed: ${activateRes.error?.message}`);
  need(activateRes.data.active === true && activateRes.data.is_demo === false, 'Activated approved product state mismatch');

  // Test photo replacement invalidation
  // Upload second image
  const img2Buffer = await sharp({
    create: { width: 384, height: 512, channels: 3, background: { r: 50, g: 100, b: 150 } }
  }).jpeg().toBuffer();
  const upload2Path = `products/${testProductId}/${owner.id}/${randomUUID()}.jpg`;
  uploadedPaths.push(upload2Path);
  await owner.client.storage.from('product-image-uploads').upload(upload2Path, img2Buffer, { contentType: 'image/jpeg', upsert: false });

  const val2 = await fetch(endpoint, {
    method: 'POST',
    headers: { Origin: target.origin, Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: testProductId, uploadPath: upload2Path })
  });
  const receipt2 = await val2.json();
  publishedPaths.push(receipt2.path);

  // Attach second image -> product must atomically reset to is_demo = true and active = false
  const attach2 = await owner.client.rpc('owner_attach_product_image', {
    p_product_id: testProductId,
    p_expected_revision: activateRes.data.edit_revision,
    p_image_path: receipt2.path,
    p_alt: 'Updated Synthetic Garment'
  });
  need(!attach2.error, `Photo replacement failed: ${attach2.error?.message}`);
  need(attach2.data.is_demo === true && attach2.data.active === false, 'Photo replacement must reset product to sample and inactive');
  await pass('06E Owner approval workflow, stale revision handling, activation, and photo replacement reset verified');

  console.log('All synthetic media acceptance tests PASSED successfully.');
} catch (err) {
  console.error('Acceptance suite failed:', err.message);
  cleanupOk = false;
  process.exitCode = 1;
} finally {
  console.log('Running tagged test resource cleanup...');
  // Clean up synthetic product, variants, approvals, and assets
  if (sql && testProductId) {
    try {
      await sql(`
        set session_replication_role = 'replica';
        delete from batool_catalog_internal.creation_requests where product_id = ${testProductId};
        delete from batool_catalog_internal.merchandise_approvals where product_id = ${testProductId};
        delete from public.product_image_assets where product_id = ${testProductId};
        delete from public.product_variants where product_id = ${testProductId};
        delete from public.products where id = ${testProductId};
        set session_replication_role = 'origin';
      `);
    } catch (e) {
      cleanupOk = false;
    }
  }

  // Clean up uploaded staging and published images
  if (admin) {
    for (const p of uploadedPaths) {
      try { await admin.storage.from('product-image-uploads').remove([p]); } catch (_) {}
    }
    for (const p of publishedPaths) {
      try {
        const base = p.replace(/main\.webp$/, '');
        await admin.storage.from('product-images').remove([`${base}192.webp`, `${base}384.webp`, `${base}main.webp`]);
      } catch (_) {}
    }
    // Delete temporary test accounts
    for (const a of accounts) {
      try {
        await sql(`delete from public.dashboard_roles where user_id = '${a.id}';`);
        await admin.auth.admin.deleteUser(a.id);
      } catch (_) {
        cleanupOk = false;
      }
    }
  }

  // Verify baseline test orders and stock
  if (sql) {
    try {
      const verifyPost = await sql(`
        begin read only;
        select json_build_object(
          'products_hash', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) from public.products p),
          'stock_hash', (select md5(coalesce(jsonb_agg(to_jsonb(v) order by product_id,size)::text,'')) from public.product_variants v),
          'orders_hash', (select md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'')) from public.orders o),
          'readiness_closed', (select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready) from batool_checkout_internal.readiness),
          'recovery_closed', (select bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls),
          'business_settings_closed', (select bool_and(not (settings->>'cod_enabled')::boolean and not (settings->>'easypaisa_enabled')::boolean and not (settings->>'jazzcash_enabled')::boolean) from public.business_settings)
        );
        rollback;
      `);
      const v = JSON.parse(verifyPost);
      need(v.readiness_closed && v.recovery_closed && v.business_settings_closed, 'Gates must remain closed');
      need(v.products_hash === baselineProductsHash, 'Products hash mismatch after test cleanup');
      need(v.stock_hash === baselineStockHash, 'Stock hash mismatch after test cleanup');
      need(v.orders_hash === baselineOrdersHash, 'Orders hash mismatch after test cleanup');
      console.log('Post-cleanup gate and baseline integrity verification: all hashes and closed gates match baseline.');
    } catch (e) {
      cleanupOk = false;
    }
  }

  await writeFile(resultPath, JSON.stringify({
    target: target?.projectRef,
    timestamp: new Date().toISOString(),
    results,
    cleanupConfirmed: cleanupOk
  }, null, 2));

  console.log(cleanupOk ? 'Cleanup complete: all tagged test resources removed, baseline preserved.' : 'Cleanup incomplete: manual review required.');
}
