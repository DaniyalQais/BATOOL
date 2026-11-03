// New recovery suites only, called by the owned loopback/disposable harness.
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
export async function recoveryDatabaseTests({ run, psql, root, directory }) {
  async function review(file) {
    const result = await run("psql", [...psql, "-A", "-t", "-F", "\t", "-f", join(root, "supabase/tests", file)]);
    await writeFile(join(directory, file + ".log"), result.output);
    if (/\t(?:STOP|REVIEW)\s*$/m.test(result.output)) throw new Error("New recovery review failed; see local log");
  }
  await review("checkout_recovery_preflight.sql");
  await run("psql", [...psql, "-f", join(root, "supabase/migrations/20261102001000_checkout_intent_recovery.sql")]);
  await review("checkout_recovery_postflight.sql");
  const batch = await run("psql", psql, "set batool.test_disposable='yes';\n\\i supabase/tests/checkout_intent_recovery.sql\n");
  await writeFile(join(directory, "recovery-batch.log"), batch.output);
  if (!batch.output.includes("PASS recovery expiry") || !batch.output.includes("ROLLBACK")) throw new Error("New recovery SQL marker missing");
  await run("psql", psql, `do $$ begin
    if exists(select 1 from public.orders) or exists(select 1 from public.products) or exists(select 1 from auth.users)
      or exists(select 1 from batool_checkout_internal.quotes) or exists(select 1 from batool_checkout_internal.intent_resolutions)
      or (select enabled from batool_checkout_internal.readiness) then raise exception 'Recovery fixture rollback incomplete'; end if; end; $$;`);
  console.log("PASS: new recovery SQL batch and verified fixture rollback; synthetic roles only.");
  await run("psql", psql, "\\i supabase/tests/secure_checkout_fixtures.sql\nupdate public.product_variants set stock_quantity=20 where product_id=2;\n");
  async function sql(input, allowFailure = false) { return run("psql", [...psql, "-A", "-t"], input, allowFailure); }
  async function json(statement) {
    const result = await sql(statement);
    return JSON.parse(result.output.trim());
  }
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const customer = `'{"recipient_name":"Synthetic","phone":"923000000000","email":null,"address_line1":"Synthetic","address_line2":null,"city":"Synthetic","region":null,"postal_code":null,"country_code":"PK"}'::jsonb`;
  const cart = `'[{"id":2,"size":"S","quantity":1}]'`;
  const quote = scope => json(`select public.checkout_quote('${scope}',${cart},'cod');`);
  const create = (scope, key, q) => `select public.checkout_create('${scope}','${key}','${q.quote_id}',${customer});`;
  const resolveIntent = (scope, key, q) => `select public.checkout_resolve('${scope}','${key}','${q.quote_id}');`;
  const replacement = (scope, closed) => `select public.checkout_replacement_quote('${scope}','${closed.resolution_id}',${cart},'cod');`;
  async function totals(orders, stock) {
    await sql(`do $$ begin if (select count(*) from public.orders)<>${orders}
      or (select stock_quantity from public.product_variants where product_id=2 and size='S')<>${stock}
      then raise exception 'Unexpected recovery order/stock count'; end if; end; $$;`);
  }
  let serial = 11000;
  async function race(first, second, end = "commit") {
    const marker = ++serial; const name = `recovery_waiter_${marker}`;
    const running = sql(`begin; ${first} select pg_advisory_xact_lock(${marker}); select pg_sleep(2); ${end};`, true);
    let ready = false;
    for (let n = 0; n < 100; n++) {
      if ((await sql(`select exists(select 1 from pg_locks where locktype='advisory' and objid=${marker} and granted);`)).output.trim() === "t") { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!ready) { await running; throw new Error("Recovery race holder barrier absent"); }
    const waiting = sql(`set application_name='${name}'; ${second}`, true);
    let blocked = false;
    for (let n = 0; n < 100; n++) {
      if ((await sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event_type='Lock');`)).output.trim() === "t") { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const results = await Promise.all([running, waiting]);
    if (!blocked) throw new Error("Second recovery session did not demonstrably wait on a lock");
    return results;
  }
  function succeeded(results) { if (results.some(result => result.code !== 0)) throw new Error("Recovery race unexpectedly failed; synthetic diagnostics stay local"); }
  // Creator commits before resolver obtains the SAME original scope/key lock.
  const scopeA = id(1101), keyA = id(1111), quoteA = await quote(scopeA);
  succeeded(await race(create(scopeA, keyA, quoteA), resolveIntent(scopeA, keyA, quoteA)));
  const committed = await json(resolveIntent(scopeA, keyA, quoteA));
  if (committed.status !== "committed") throw new Error("Committed race retired an order");
  await totals(1, 19);
  console.log("PASS: in-flight creator commits; waiting resolver recovers it without retirement or another stock deduction.");
  // Resolver commits first; waiting old creator cannot create afterwards.
  const scopeB = id(1102), keyB = id(1112), quoteB = await quote(scopeB);
  const retiredFirst = await race(resolveIntent(scopeB, keyB, quoteB), create(scopeB, keyB, quoteB));
  if (retiredFirst[0].code !== 0 || retiredFirst[1].code === 0 || !retiredFirst[1].output.includes("Intent closed")) throw new Error("Retirement failed to exclude old creator");
  await totals(1, 19);
  const closedB = await json(resolveIntent(scopeB, keyB, quoteB));
  // Parallel/lost resolve responses all preserve one replacement identity.
  const resolveRetries = await Promise.all([json(resolveIntent(scopeB, keyB, quoteB)), json(resolveIntent(scopeB, keyB, quoteB))]);
  if (resolveRetries.some(result => result.resolution_id !== closedB.resolution_id || result.replacement_key !== closedB.replacement_key)) throw new Error("Resolution retries forked replacements");
  const quoteRetries = await Promise.all([json(replacement(scopeB, closedB)), json(replacement(scopeB, closedB))]);
  if (quoteRetries[0].quote_id !== quoteRetries[1].quote_id) throw new Error("Replacement quote requests forked");
  const nextB = quoteRetries[0];
  succeeded(await race(create(scopeB, closedB.replacement_key, nextB), create(scopeB, closedB.replacement_key, nextB)));
  await totals(2, 18);
  console.log("PASS: retirement excludes a waiting creator; concurrent/lost resolve, quote and replacement-create responses retain one order/key/quote/decrement.");
  // A failed creator's uncommitted writes disappear before resolution proceeds.
  const scopeC = id(1103), keyC = id(1113), quoteC = await quote(scopeC);
  succeeded(await race(create(scopeC, keyC, quoteC), resolveIntent(scopeC, keyC, quoteC), "rollback"));
  const closedC = await json(resolveIntent(scopeC, keyC, quoteC));
  if (closedC.status !== "retired") throw new Error("Rolled-back creator left an order");
  await totals(2, 18);
  const nextC = await json(replacement(scopeC, closedC));
  await sql(create(scopeC, closedC.replacement_key, nextC)); // Intentionally discard a committed response.
  const recoveredC = await json(`select public.checkout_recover('${scopeC}','${closedC.replacement_key}');`);
  const retriedC = await json(create(scopeC, closedC.replacement_key, nextC));
  if (recoveredC.order_id !== retriedC.order_id) throw new Error("Lost replacement response duplicated an order");
  await totals(3, 17);
  console.log("PASS: in-flight creator rolls back; resolver safely retires, and replacement lost-response recovery returns one committed order.");
  // Rolled-back retirement must NOT permit release of the old browser intent.
  const scopeD = id(1104), keyD = id(1114), quoteD = await quote(scopeD);
  succeeded(await race(resolveIntent(scopeD, keyD, quoteD), create(scopeD, keyD, quoteD), "rollback"));
  const resolvedD = await json(resolveIntent(scopeD, keyD, quoteD));
  if (resolvedD.status !== "committed") throw new Error("Uncommitted retirement invalidated an order");
  await totals(4, 16);
  console.log("PASS: retirement rolls back; waiting original creator commits, then resolution recovers it.");
  // Different key sharing a quote is serialized by the QUOTE row lock as well.
  const scopeE = id(1105), keyE = id(1115), quoteE = await quote(scopeE);
  const otherKey = await race(resolveIntent(scopeE, keyE, quoteE), create(scopeE, id(1199), quoteE));
  if (otherKey[0].code !== 0 || otherKey[1].code === 0) throw new Error("Different key bypassed quote retirement");
  await totals(4, 16);
  console.log("PASS: another key cannot race a retired quote into an additional order.");
  console.log(`Recovery logs: ${directory}. No completed 009 preflight/postflight or old fixture suites repeated.`);
}
