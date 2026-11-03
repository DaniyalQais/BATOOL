// NEW hosted acceptance only. Never loads production credentials into a client.
// No migrations, deployments, emails, fixture-suite replay or raw provider logs.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadTarget, postgresEnvironment } from './hosted-verification-guard.mjs';

const env = process.env;
const credentialNames = ['BATOOL_HOSTED_CONFIRM_REF', 'BATOOL_HOSTED_PUBLISHABLE_KEY', 'BATOOL_HOSTED_SERVICE_KEY', 'BATOOL_HOSTED_DB_PASSWORD', 'BATOOL_PLAYWRIGHT_MODULE'];
const results = [];
let stage = 'prerequisites';
function need(value) { if (!value) throw new Error('Assertion failed'); }
function pass(label) { results.push({ check: label, result: 'PASS' }); console.log(`PASS ${label}`); }

async function check(file) {
  let missing = false;
  for (const name of credentialNames) { const present = !!env[name]; console.log(`${name}: ${present ? 'present' : 'missing'}`); if (!present) missing = true; }
  if (!file) { console.log('Disposable target manifest: missing (use scripts/hosted-verification-target.example.json)'); missing = true; }
  else { try { await loadTarget(file); console.log('Disposable target exclusion/binding: PASS'); } catch { console.log('Disposable target exclusion/binding: NOT READY'); missing = true; } }
  const psql = env.BATOOL_HOSTED_PSQL || 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
  try { await access(psql, constants.F_OK); console.log('PostgreSQL client: present'); } catch { console.log('PostgreSQL client: missing'); missing = true; }
  if (env.BATOOL_PLAYWRIGHT_MODULE) { try { await access(env.BATOOL_PLAYWRIGHT_MODULE); console.log('Playwright module: present'); } catch { console.log('Playwright module: missing'); missing = true; } }
  console.log('No network, database, Auth, deployment or fixture action performed.');
  return !missing;
}

async function run(file, resume = false) {
  // No request or write is possible until all target and tool checks succeed.
  const target = await loadTarget(file);
  for (const name of credentialNames) need(env[name]);
  const { chromium } = await import(pathToFileURL(resolve(env.BATOOL_PLAYWRIGHT_MODULE)).href);
  const pgEnv = postgresEnvironment(target);
  const psql = env.BATOOL_HOSTED_PSQL || 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
  await access(psql);
  const runId = randomUUID();
  let markerId = runId;
  const dir = new URL(`../.tmp/hosted-acceptance/${runId}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  function sql(text) {
    return new Promise((done, fail) => {
      const child = spawn(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { env: pgEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', () => {}); // Never persist raw SQL/provider diagnostics.
      child.on('error', () => fail(new Error('Database client unavailable')));
      child.on('close', code => code === 0 ? done(output.trim()) : fail(new Error('Database operation failed')));
      child.stdin.on('error', () => {}); child.stdin.end(text);
    });
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) }) } };
  const admin = createClient(target.projectUrl, env.BATOOL_HOSTED_SERVICE_KEY, options);
  const accounts = [];
  let seeded = false, completed = false, browser, server, forbiddenServer;
  const dbStats = async () => JSON.parse(await sql(`begin read only;
    select json_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),
      'customers',(select count(*) from public.order_customer_details),'keys',(select count(*) from public.order_creation_keys),
      'history',(select count(*) from public.order_status_history),'contexts',(select count(*) from public.order_checkout_details),
      'stock',(select stock_quantity from public.product_variants where product_id=0 and size='M'),
      'unpaid',(select count(*) from public.orders where payment_status='unpaid'));
    rollback;`));
  async function assertCounts(n) { const s = await dbStats(); need(s.orders === n && s.items === n && s.customers === n && s.keys === n && s.contexts === n && s.history === n * 2 && s.stock === 5 - n && s.unpaid === n); }
  async function api(path, token, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(`${target.projectUrl}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { apikey: env.BATOOL_HOSTED_PUBLISHABLE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    let data; try { data = await response.json(); } catch { data = null; }
    return { status: response.status, data };
  }
  async function denial(path, token, body, method) { const r = await api(path, token, body, method); need([401, 403].includes(r.status) && r.data?.code === '42501'); }
  async function rows(table, token, count, select = 'order_id') { const r = await api(`/rest/v1/${table}?select=${select}&limit=20`, token); need(r.status === 200 && Array.isArray(r.data) && r.data.length === count); return r.data; }
  try {
    stage = 'trusted deferred commit checker prerequisite';
    need(await sql(`begin read only; select exists(select 1 from pg_proc where oid=to_regprocedure('batool_order_internal.check_complete_order()') and prosecdef and pg_get_userbyid(proowner)='postgres' and proconfig @> array['search_path=""'] and md5(regexp_replace(prosrc,'[[:space:]]+','','g'))='14fec757168512bb7397e8b03eba05db')::text; rollback;`) === 'true');
    if (resume) {
      stage = 'owned zero-order continuation prerequisites';
      const marker = JSON.parse(await sql(`begin read only; select json_build_object('id',(select id from batool_acceptance.run limit 1),'matches',(select count(*)=1 and bool_and(project_ref='${target.projectRef}' and finished) from batool_acceptance.run),'empty_auth',not exists(select 1 from auth.users),'empty_roles',not exists(select 1 from public.dashboard_roles),'catalog',(select count(*)=1 and bool_and(id=0 and slug='hosted-acceptance-only' and price_minor=100001 and active and not is_demo) from public.products),'variants',(select count(*)=4 and bool_and(product_id=0 and active and stock_quantity=5) from public.product_variants),'closed',(select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)); rollback;`));
      need(marker.matches && marker.empty_auth && marker.empty_roles && marker.catalog && marker.variants && marker.closed && /^[0-9a-f-]{36}$/.test(marker.id));
      const previous = JSON.parse(await readFile(new URL(`../.tmp/hosted-acceptance/${marker.id}/results.json`, import.meta.url), 'utf8'));
      need(previous.complete === false && previous.lastStage === 'browser real Edge and PostgREST integration'
        && previous.results.some(r => r.check === 'public settings allowlist and service-only RPC restrictions' && r.result === 'PASS')
        && previous.results.some(r => r.check === 'disposable gates closed and run-created Auth identities removed' && r.result === 'PASS'));
      await assertCounts(0);
      markerId = marker.id;
      await sql(`update batool_acceptance.run set finished=false where id='${markerId}';`);
      seeded = true;
      console.log('Owned zero-order continuation accepted; completed setup/settings/RPC cases skipped.');
    } else {
    stage = 'empty disposable database prerequisites';
    need(await sql(`begin read only; select (current_user='postgres' and
      to_regprocedure('public.checkout_resolve(uuid,uuid,uuid)') is not null and
      to_regprocedure('batool_checkout_internal.create_order_v009(uuid,uuid,uuid,jsonb)') is not null and
      not exists(select 1 from auth.users) and not exists(select 1 from public.products) and
      not exists(select 1 from public.orders) and not exists(select 1 from public.dashboard_roles) and
      not exists(select 1 from batool_checkout_internal.quotes) and
      not exists(select 1 from batool_checkout_internal.intent_resolutions) and
      to_regnamespace('batool_acceptance') is null and
      (select count(*)=1 and bool_and(settings->'shipping'='{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null}'::jsonb
        and settings->'public_whatsapp'='null'::jsonb and settings->'support_email'='null'::jsonb
        and settings->'cod_enabled'='false'::jsonb and settings->'easypaisa_enabled'='false'::jsonb and settings->'jazzcash_enabled'='false'::jsonb
        and settings->'easypaisa_account_title'='null'::jsonb and settings->'easypaisa_account_number'='null'::jsonb
        and settings->'jazzcash_account_title'='null'::jsonb and settings->'jazzcash_account_number'='null'::jsonb
        and settings->>'payment_instructions_state'='draft' and settings->>'payment_instructions'=''
        and settings->>'policy_state'='draft' and settings->>'policy_text'='') from public.business_settings) and
      (select count(*)=1 and bool_and(settings='{"emails":[],"whatsapp_numbers":[]}'::jsonb) from public.order_notification_settings) and
      (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)
      )::text; rollback;`) === 'true');
    pass(stage);

    stage = 'single-run disposable marker and catalog';
    await sql(`begin;
      create schema batool_acceptance;
      revoke all on schema batool_acceptance from public,anon,authenticated,service_role;
      create table batool_acceptance.run(id uuid primary key, project_ref text not null, finished boolean not null default false);
      insert into batool_acceptance.run values('${runId}','${target.projectRef}',false);
      insert into public.products(id,slug,name,description,price_minor,image_slug,subcategory,color,tag,is_demo,active)
        values(0,'hosted-acceptance-only','Synthetic acceptance garment','Disposable hosted fixture',100001,'gulnaar','Daily Pret','#123456','Fixture',false,false);
      insert into public.product_variants(product_id,size,active,stock_quantity)
        select 0,size,true,5 from unnest(array['S','M','L','XL']) size;
      update public.products set active=true where id=0;
      commit;`);
    seeded = true;
    pass(stage);
    }

    stage = 'real Auth account creation and password sessions';
    for (const role of ['owner', 'partner', 'unassigned', 'revoked']) {
      const password = randomBytes(32).toString('base64url') + 'aA1!';
      const email = `${runId}-${role}@example.invalid`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'owner' } });
      need(!created.error && created.data.user);
      const account = { id: created.data.user.id, role };
      need(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(account.id));
      accounts.push(account); // Track before login so failure cleanup still deletes it.
      const client = createClient(target.projectUrl, env.BATOOL_HOSTED_PUBLISHABLE_KEY, options);
      const login = await client.auth.signInWithPassword({ email, password });
      need(!login.error && login.data.session && login.data.user.id === account.id);
      const verified = await client.auth.getUser(); need(!verified.error && verified.data.user.id === account.id && !verified.data.user.is_anonymous);
      account.client = client; account.token = login.data.session.access_token; account.refresh = login.data.session.refresh_token;
      if (role !== 'unassigned') await sql(`insert into public.dashboard_roles(user_id,role) values('${account.id}','${role === 'partner' ? 'partner' : 'owner'}');`);
    }
    const anonClient = createClient(target.projectUrl, env.BATOOL_HOSTED_PUBLISHABLE_KEY, options);
    const anonLogin = await anonClient.auth.signInAnonymously();
    need(!anonLogin.error && anonLogin.data.user?.is_anonymous && anonLogin.data.session);
    const anonymous = { id: anonLogin.data.user.id, role: 'anonymous-auth', client: anonClient, token: anonLogin.data.session.access_token };
    need(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(anonymous.id));
    accounts.push(anonymous);
    const anonVerified = await anonClient.auth.getUser(); need(!anonVerified.error && anonVerified.data.user.is_anonymous);
    // Even an erroneous mapping cannot give an anonymous Auth identity Owner access.
    await sql(`insert into public.dashboard_roles(user_id,role) values('${anonymous.id}','owner');`);
    if (!resume) pass(stage); else console.log('Fresh temporary sessions prepared only for pending authorization checks.');

    const owner = accounts.find(a => a.role === 'owner');
    let settings, saved, ns;
    if (resume) {
      stage = 'restore owned fixture configuration for pending checkout';
      await sql(`update public.business_settings set settings=settings||'{"cod_enabled":true}'::jsonb;`);
      const current = await rows('business_settings', owner.token, 1, 'revision,settings');
      settings = current[0].settings; saved = { data: { revision: current[0].revision } };
      ns = { data: { revision: (await rows('order_notification_settings', owner.token, 1, 'revision'))[0].revision } };
      need(settings.shipping.mode === 'flat_rate' && settings.shipping.fee_minor === 25001 && settings.payment_instructions === 'SYNTHETIC ACCEPTANCE COD ONLY' && settings.policy_text === 'SYNTHETIC ACCEPTANCE POLICY ONLY');
    } else {
    stage = 'actual Owner revision-checked settings and private-recipient save';
    const business = await rows('business_settings', owner.token, 1, 'revision,settings');
    settings = { ...business[0].settings, cod_enabled: true,
      shipping: { country_code: 'PK', currency: 'PKR', mode: 'flat_rate', fee_minor: 25001 },
      payment_instructions: 'SYNTHETIC ACCEPTANCE COD ONLY', payment_instructions_state: 'approved',
      policy_text: 'SYNTHETIC ACCEPTANCE POLICY ONLY', policy_state: 'approved' };
    const save = { p_expected_revision: business[0].revision, p_settings: settings };
    saved = await api('/rest/v1/rpc/owner_save_business_settings', owner.token, save); need(saved.status === 200 && saved.data.revision === business[0].revision + 1);
    const stale = await api('/rest/v1/rpc/owner_save_business_settings', owner.token, save); need(stale.status === 409 && stale.data?.code === 'PT409');
    const notifications = await rows('order_notification_settings', owner.token, 1, 'revision');
    ns = await api('/rest/v1/rpc/owner_save_notification_settings', owner.token, { p_expected_revision: notifications[0].revision, p_settings: { emails: ['private-acceptance@example.invalid'], whatsapp_numbers: [] } }); need(ns.status === 200);
    for (const account of accounts.filter(a => ['partner', 'unassigned', 'anonymous-auth'].includes(a.role))) {
      await denial('/rest/v1/rpc/owner_save_business_settings', account.token, { p_expected_revision: saved.data.revision, p_settings: settings });
      await denial('/rest/v1/rpc/owner_save_notification_settings', account.token, { p_expected_revision: ns.data.revision, p_settings: { emails: [], whatsapp_numbers: [] } });
    }
    for (const account of accounts) {
      await denial('/rest/v1/business_settings?id=eq.true', account.token, { settings }, 'PATCH');
      await denial('/rest/v1/dashboard_roles?user_id=eq.' + account.id, account.token, { role: 'owner' }, 'PATCH');
    }
    pass(stage);

    stage = 'public settings allowlist and service-only RPC restrictions';
    const publicSettings = await api('/rest/v1/rpc/get_public_business_settings', undefined, {});
    const allowed = ['public_whatsapp','support_email','currency','stock_model','shipping','payment_instructions','policy_text','checkout_enabled','available_payment_methods'];
    need(publicSettings.status === 200 && Object.keys(publicSettings.data).sort().join() === allowed.sort().join()
      && publicSettings.data.checkout_enabled === false && publicSettings.data.available_payment_methods.length === 0);
    const zero = '00000000-0000-4000-8000-000000000000';
    const rpc = [ ['checkout_admit', { p_bucket: 'a'.repeat(64) }], ['checkout_quote', { p_scope: zero, p_cart: [], p_method: 'cod' }],
      ['checkout_create', { p_scope: zero, p_key: zero, p_quote: zero, p_customer: {} }], ['checkout_recover', { p_scope: zero, p_key: zero }],
      ['checkout_resolution', { p_scope: zero, p_key: zero, p_quote: zero }], ['checkout_resolve', { p_scope: zero, p_key: zero, p_quote: zero }],
      ['checkout_replacement_quote', { p_scope: zero, p_resolution: zero, p_cart: [], p_method: 'cod' }] ];
    for (const token of [undefined, ...accounts.map(a => a.token)]) for (const [name, args] of rpc) await denial('/rest/v1/rpc/' + name, token, args);
    pass(stage);
    }

    stage = 'disposable COD readiness only';
    await sql(`update batool_checkout_internal.readiness set enabled=true,cod_ready=true,zero_tax_reviewed=true where id;
      do $$ begin if exists(select 1 from batool_checkout_internal.readiness where easypaisa_manual_ready or jazzcash_manual_ready)
      then raise exception 'Wallet gate changed'; end if; end $$;`);
    if (!resume) pass(stage);

    stage = 'browser real Edge and PostgREST integration';
    const modules = new Map();
    for (const name of ['checkout-client', 'contracts']) modules.set(`/${name}.ts`, stripTypeScriptTypes(await readFile(new URL(`../src/features/checkout/model/${name}.ts`, import.meta.url), 'utf8')));
    const serve = (req, res) => {
      if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); return res.end('<!doctype html><title>Disposable acceptance harness</title><p>Automation only. No credentials are rendered.</p>'); }
      if (modules.has(req.url)) { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); return res.end(modules.get(req.url)); }
      res.writeHead(404).end();
    };
    server = createServer(serve); await new Promise((yes, no) => { server.once('error', no); server.listen(43871, '127.0.0.1', yes); });
    forbiddenServer = createServer(serve); await new Promise((yes, no) => { forbiddenServer.once('error', no); forbiddenServer.listen(0, '127.0.0.1', yes); });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    let scriptErrors = 0;
    page.on('pageerror', () => { scriptErrors++; });
    // No Playwright routing/mocks. Browser fetches the real hosted endpoint directly.
    async function initialize() {
      await page.goto(target.origin);
      await page.evaluate(async endpoint => {
        const { checkoutClient, httpCheckoutTransport } = await import('/checkout-client.ts');
        window.endpoint = endpoint;
        const wire = httpCheckoutTransport(endpoint);
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const response = await nativeFetch(input, init);
          if (String(input) === endpoint) {
            const action = JSON.parse(init?.body ?? '{}').action;
            const data = await response.clone().json().catch(() => null);
            const categories = ['invalid_request','quote_or_stock_changed','rate_limited','checkout_unavailable','invalid_backend_response','commit_unconfirmed','resolution_unconfirmed','scope_expired_or_invalid'];
            window.wireDiagnostic = { action: ['scope','quote','create','recover','resolve','replacement_quote'].includes(action) ? action : 'unknown', status: response.status, category: categories.includes(data?.error) ? data.error : (response.ok ? 'success' : 'unclassified') };
          }
          return response;
        };
        window.bag = JSON.parse(sessionStorage.getItem('acceptance-bag') ?? '[{"id":0,"size":"M","quantity":1}]');
        window.completed = 0; window.drop = null;
        window.transport = async body => {
          const response = await wire(body);
          if (window.drop === body.action) { window.drop = null; window.discarded = response; throw new Error('Deliberately discarded real response'); }
          return response;
        };
        window.client = checkoutClient(window.transport, { read: () => sessionStorage.getItem('acceptance-intent'), write: value => sessionStorage.setItem('acceptance-intent', value), remove: () => sessionStorage.removeItem('acceptance-intent') }, () => {
          window.completed++; window.bag = []; sessionStorage.setItem('acceptance-bag', '[]');
        });
        window.client.restore();
        window.customer = { recipient_name: 'Synthetic acceptance customer', phone: '923000000000', email: null, address_line1: 'Synthetic fixture address', address_line2: null, city: 'Synthetic city', region: null, postal_code: null, country_code: 'PK' };
      }, target.endpoint);
    }
    const evaluate = async fn => {
      try { need(await page.evaluate(fn)); }
      catch {
        const d = await page.evaluate(() => window.wireDiagnostic ?? { action: 'none', status: 0, category: 'no_response' }).catch(() => ({ action: 'none', status: 0, category: 'no_response' }));
        console.log(`Unconfirmed browser step: ${stage}; action=${d.action}; status=${d.status}; category=${d.category}`);
        throw new Error('Browser step unconfirmed');
      }
    };
    await initialize();
    stage = 'hosted trusted quote';
    await evaluate(async () => { window.q = await window.client.quote(window.bag, 'cod'); return window.q.subtotal_minor === '100001' && window.q.shipping_minor === '25001' && window.q.total_minor === '125002'; });
    stage = 'hosted creation with discarded response';
    await evaluate(async () => { window.drop = 'create'; try { await window.client.place(window.q, window.customer); return false; } catch { return window.drop === null && window.discarded?.confirmed === true && window.bag.length === 1 && !!sessionStorage.getItem('acceptance-intent') && window.completed === 0; } });
    await assertCounts(1); pass('hosted commit survives discarded response; cart retained until confirmation');
    await initialize();
    await evaluate(async () => { const receipt = await window.client.recover(); return receipt.payment_status === 'unpaid' && window.bag.length === 0 && window.completed === 1; });
    await evaluate(async () => {
      const p = window.client.pending();
      const copies = await Promise.all([1,2,3].map(() => window.transport({ action: 'create', scope: p.scope, key: p.key, quote_id: p.quote.quote_id, customer: window.customer })));
      const resolved = await window.transport({ action: 'resolve', scope: p.scope, key: p.key, quote_id: p.quote.quote_id });
      const foreign = await window.transport({ action: 'scope' });
      const hidden = await window.transport({ action: 'recover', scope: foreign.scope, key: p.key });
      return copies.every(x => x.receipt.order_id === p.receipt.order_id) && resolved.resolution.status === 'committed' && resolved.resolution.receipt.order_id === p.receipt.order_id && hidden.confirmed === false;
    });
    await assertCounts(1); pass('concurrent hosted retries and committed resolution preserve one order/deduction; foreign scope isolated');
    await initialize();
    await evaluate(async () => { await window.client.recover(); return window.completed === 0 && window.bag.length === 0; });
    pass('reload of confirmed receipt does not consume cart again');

    await evaluate(async () => { window.client.startAnother(); window.bag = [{ id: 0, size: 'M', quantity: 1 }]; sessionStorage.setItem('acceptance-bag', JSON.stringify(window.bag)); window.q = await window.client.quote(window.bag, 'cod'); return true; });
    const expiredQuote = await page.evaluate(() => window.q.quote_id);
    need(/^[0-9a-f-]{36}$/.test(expiredQuote));
    await sql(`update batool_checkout_internal.quotes set expires_at=clock_timestamp()-interval '1 second' where id='${expiredQuote}' and order_id is null;`);
    await evaluate(async () => { try { await window.client.place(window.q, window.customer); return false; } catch { return window.bag.length === 1 && !!window.client.pending(); } });
    await evaluate(() => { window.retiredAttempt = window.client.pending(); return !!window.retiredAttempt; });
    await assertCounts(1);
    await evaluate(async () => { window.drop = 'resolve'; try { await window.client.resolve(); return false; } catch { return !!window.client.pending() && window.bag.length === 1; } });
    await evaluate(async () => { const result = await window.client.resolve(); const saved = JSON.parse(sessionStorage.getItem('acceptance-intent')); return result.status === 'retired' && window.bag.length === 1 && saved.resolution_id === window.discarded.resolution.resolution_id && saved.replacement_key === window.discarded.resolution.replacement_key; });
    await evaluate(async () => {
      const p = window.retiredAttempt;
      for (const key of [p.key, crypto.randomUUID()]) {
        const r = await fetch(window.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', scope: p.scope, key, quote_id: p.quote.quote_id, customer: window.customer }) });
        if (r.status !== 409 || (await r.json()).error !== 'quote_or_stock_changed') return false;
      }
      return window.bag.length === 1 && window.client.restarting();
    });
    await assertCounts(1); pass('expired intent retirement and lost resolve retry keep same durable replacement identity');
    await evaluate(async () => { window.drop = 'replacement_quote'; try { await window.client.quote(window.bag, 'cod'); return false; } catch { return window.client.restarting() && window.bag.length === 1; } });
    await evaluate(async () => { window.q = await window.client.quote(window.bag, 'cod'); return window.q.quote_id === window.discarded.quote.quote_id; });
    await evaluate(async () => {
      const p = window.client.pending();
      const copies = await Promise.all([1,2,3].map(() => window.transport({ action: 'create', scope: p.scope, key: p.key, quote_id: p.quote.quote_id, customer: window.customer })));
      window.drop = 'create'; try { await window.client.place(window.q, window.customer); return false; } catch { return window.bag.length === 1 && copies.every(x => x.receipt.order_id === copies[0].receipt.order_id); }
    });
    await assertCounts(2);
    await initialize();
    await evaluate(async () => { const r = await window.client.recover(); return r.payment_status === 'unpaid' && window.bag.length === 0 && window.completed === 1; });
    await assertCounts(2); pass('pinned replacement quote, concurrent creation and lost replacement response produce one additional order/deduction');

    stage = 'real browser CORS boundary';
    const allowedPreflight = await fetch(target.endpoint, { method: 'OPTIONS', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Origin: target.origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    need(allowedPreflight.status === 204 && allowedPreflight.headers.get('access-control-allow-origin') === target.origin && allowedPreflight.headers.get('access-control-allow-methods')?.split(/,\s*/).includes('POST') && allowedPreflight.headers.get('access-control-allow-headers')?.split(/,\s*/).includes('content-type'));
    const rejected = await context.newPage();
    await rejected.goto(`http://127.0.0.1:${forbiddenServer.address().port}`);
    need(await rejected.evaluate(async endpoint => { try { await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"scope"}' }); return false; } catch { return true; } }, target.endpoint));
    for (const method of ['OPTIONS', 'POST']) {
      const r = await fetch(target.endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Origin: 'https://not-allowed.invalid', 'Content-Type': 'application/json', ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST' } : {}) }, ...(method === 'POST' ? { body: '{"action":"scope"}' } : {}) });
      need(r.status === 403 && !r.headers.has('access-control-allow-origin'));
    }
    need(scriptErrors === 0); pass(stage);

    stage = 'populated actual-session authorization matrix';
    for (const account of accounts) {
      const isOwner = ['owner', 'revoked'].includes(account.role), isPartner = account.role === 'partner';
      await rows('dashboard_roles', account.token, isOwner || isPartner ? 1 : 0, 'user_id,role');
      const reports = await rows('orders', account.token, isOwner || isPartner ? 2 : 0, 'id,currency,subtotal_minor,shipping_minor,total_minor,fulfillment_status,payment_status');
      need(reports.every(r => Object.keys(r).sort().join() === ['id','currency','subtotal_minor','shipping_minor','total_minor','fulfillment_status','payment_status'].sort().join()));
      for (const [table, count] of [['order_items',2],['order_customer_details',2],['order_status_history',4],['order_checkout_details',2]]) {
        const detail = await rows(table, account.token, isOwner ? count : 0,
          table === 'order_customer_details' ? 'order_id,recipient_name,phone,address_line1' : 'order_id');
        if (isOwner && table === 'order_customer_details') need(detail.every(r => r.recipient_name === 'Synthetic acceptance customer' && r.phone === '923000000000' && r.address_line1 === 'Synthetic fixture address'));
      }
      for (const table of ['business_settings','order_notification_settings']) await rows(table, account.token, isOwner ? 1 : 0, 'id');
      await denial('/rest/v1/order_creation_keys?select=order_id', account.token);
      await denial('/rest/v1/orders?id=not.is.null', account.token, { fulfillment_status: 'confirmed' }, 'PATCH');
      const embed = await api('/rest/v1/orders?select=id,order_customer_details(order_id),order_items(order_id),order_checkout_details(order_id)', account.token);
      need(embed.status === 200 && Array.isArray(embed.data) && embed.data.length === (isOwner || isPartner ? 2 : 0));
      if (isPartner) need(embed.data.every(r => ['order_customer_details','order_items','order_checkout_details'].every(k => r[k] === null || (Array.isArray(r[k]) && r[k].length === 0))));
      pass(`actual ${account.role}: populated report/private/settings isolation and direct write denial`);
    }
    for (const table of ['orders','order_items','order_customer_details','order_status_history','order_checkout_details','order_creation_keys','business_settings','order_notification_settings']) await denial(`/rest/v1/${table}?select=${['orders','business_settings','order_notification_settings'].includes(table) ? 'id' : 'order_id'}`);
    pass('no-session anonymous object denials (distinct from actual anonymous Auth session)');

    stage = 'actual revoked session, refresh revocation and residual JWT boundary';
    const revoked = accounts.find(a => a.role === 'revoked');
    const logout = await revoked.client.auth.signOut({ scope: 'local' }); need(!logout.error);
    const refreshed = await api('/auth/v1/token?grant_type=refresh_token', undefined, { refresh_token: revoked.refresh });
    need([400,401,403].includes(refreshed.status) && ['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired'].includes(refreshed.data?.error_code ?? refreshed.data?.code));
    // Supabase logout revokes refresh sessions, not already issued JWTs. Record
    // residual access honestly, then prove immediate database-role revocation.
    const residual = await api('/rest/v1/orders?select=id&limit=20', revoked.token);
    need(residual.status === 200 && residual.data.length === 2);
    pass('signed-out temporary session cannot refresh; existing JWT still accesses mapped role until expiry');
    await sql(`delete from public.dashboard_roles where user_id='${revoked.id}' and role='owner';`);
    await rows('orders', revoked.token, 0, 'id');
    for (const table of ['business_settings','order_notification_settings']) await rows(table, revoked.token, 0, 'id');
    for (const table of ['order_items','order_customer_details','order_status_history','order_checkout_details']) await rows(table, revoked.token, 0);
    await denial('/rest/v1/rpc/owner_save_business_settings', revoked.token, { p_expected_revision: saved.data.revision, p_settings: settings });
    await denial('/rest/v1/rpc/owner_save_notification_settings', revoked.token, { p_expected_revision: ns.data.revision, p_settings: { emails: [], whatsapp_numbers: [] } });
    pass('role revocation immediately denies retained JWT private access and settings saves');
    stage = 'hosted recovery while database intake is disabled';
    await sql('update batool_checkout_internal.readiness set enabled=false,cod_ready=false,zero_tax_reviewed=false where id;');
    await evaluate(async () => {
      const p = window.client.pending();
      const recovered = await window.transport({ action: 'recover', scope: p.scope, key: p.key });
      const r = await fetch(window.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'quote', scope: p.scope, cart: p.cart, method: 'cod' }) });
      return r.status === 503 && (await r.json()).error === 'checkout_unavailable' && recovered.confirmed === true && recovered.receipt.order_id === p.receipt.order_id;
    });
    pass(stage);
    await assertCounts(2);
    pass('final hosted counts: two complete unpaid orders, two stock deductions');
    completed = true;
  } finally {
    // Immutable order fixtures deliberately remain. Delete the whole disposable
    // project after evidence review; never disable triggers to clean records.
    let cleanupOK = true;
    if (seeded) {
      try {
        await sql(`begin; update batool_checkout_internal.readiness set enabled=false,cod_ready=false,easypaisa_manual_ready=false,jazzcash_manual_ready=false,zero_tax_reviewed=false;
          update public.business_settings set settings=settings||'{"cod_enabled":false,"easypaisa_enabled":false,"jazzcash_enabled":false}'::jsonb;
          update batool_acceptance.run set finished=true where id='${markerId}'; commit;`);
        const closed = await sql(`begin read only; select (select bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)::text; rollback;`);
        need(closed === 'true');
      } catch { cleanupOK = false; }
    }
    for (const account of accounts) {
      // A sign-out failure must not prevent the separate owned-user deletion.
      try { if (account.client) { const out = await account.client.auth.signOut({ scope: 'local' }); need(!out.error); } } catch { cleanupOK = false; }
      try { const deleted = await admin.auth.admin.deleteUser(account.id); need(!deleted.error); } catch { cleanupOK = false; }
    }
    if (browser) await browser.close().catch(() => { cleanupOK = false; });
    for (const s of [server, forbiddenServer]) if (s?.listening) await new Promise(yes => { s.closeAllConnections(); s.close(yes); });
    results.push({ check: 'disposable gates closed and run-created Auth identities removed', result: cleanupOK ? 'PASS' : 'UNCONFIRMED: operator must close disposable intake and remove run-created identities' });
    // Only fixed check labels/statuses, never IDs, tokens, rows, bodies or headers.
    await writeFile(new URL('results.json', dir), JSON.stringify({ scope: 'disposable hosted HTTP / actual Auth sessions', complete: completed && cleanupOK, ...(resume ? { continuationOf: markerId } : {}), results, lastStage: stage, productionTouched: false }, null, 2));
    console.log(cleanupOK ? 'Cleanup: disposable database gates closed; temporary identities removed. Immutable fixtures retained for project deletion.' : 'Cleanup UNCONFIRMED: disable disposable Edge intake and inspect owned fixture identities before continuing.');
    if (!cleanupOK) process.exitCode = 1;
  }
}

try {
  const [mode = '--check', file, ...extra] = process.argv.slice(2);
  if (extra.length || !['--check','--run','--resume-pending'].includes(mode) || (mode !== '--check' && !file)) throw new Error('Usage');
  if (mode === '--check') { if (!await check(file)) process.exitCode = 2; }
  else await run(file, mode === '--resume-pending');
} catch {
  // Do not print Error/stack: third-party errors may include credentials or rows.
  console.error(`NOT COMPLETE: ${stage}. No authorization or integration pass inferred. Raw diagnostics suppressed.`);
  process.exitCode = 1;
}
