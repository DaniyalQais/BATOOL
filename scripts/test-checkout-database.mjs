// Called only by the disposable local cluster runner, never accepts a DB URL.
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
export async function checkoutDatabaseTests({ run, psql, root, directory }) {
  async function review(file) {
    const result = await run("psql", [...psql, "-A", "-t", "-F", "\t", "-f", join(root, "supabase/tests", file)]);
    await writeFile(join(directory, file + ".log"), result.output);
    if (/\t(?:STOP|REVIEW)\s*$/m.test(result.output)) throw new Error("Checkout read-only review needs attention; see local log");
  }
  await review("secure_checkout_preflight.sql");
  await run("psql", [...psql, "-f", join(root, "supabase/migrations/20261102000900_secure_checkout.sql")]);
  await review("secure_checkout_postflight.sql");
  const batch = await run("psql", psql, "set batool.test_disposable='yes';\n\\i supabase/tests/secure_checkout.sql\n");
  await writeFile(join(directory, "checkout-batch.log"), batch.output);
  if (!batch.output.includes("PASS secure checkout") || !batch.output.includes("ROLLBACK")) throw new Error("Checkout batch marker missing");
  await run("psql", psql, `do $$ begin
    if exists(select 1 from public.orders) or exists(select 1 from public.products) or exists(select 1 from auth.users)
      or exists(select 1 from batool_checkout_internal.quotes) or (select enabled from batool_checkout_internal.readiness)
      then raise exception 'Checkout fixture rollback incomplete'; end if; end; $$;`);
  console.log("PASS: new checkout SQL batch and fixture rollback (synthetic roles/claims only).");
  // Fixtures for true independent-session concurrency commits stay in this owned
  // throwaway cluster, which is stopped in finally. No immutable rows are deleted.
  await run("psql", psql, "\\i supabase/tests/secure_checkout_fixtures.sql\n");
  const scope = "00000000-0000-4000-8000-000000000931";
  const key = "00000000-0000-4000-8000-000000000941";
  const customer = `'{"recipient_name":"Synthetic","phone":"923000000000","email":null,"address_line1":"Synthetic","address_line2":null,"city":"Synthetic","region":null,"postal_code":null,"country_code":"PK"}'::jsonb`;
  async function sql(input, allowFailure = false) { return run("psql", [...psql, "-A", "-t"], input, allowFailure); }
  async function quote(size) {
    const result = await sql(`select public.checkout_quote('${scope}','[{"id":0,"size":"${size}","quantity":1}]','cod')->>'quote_id';`);
    const id = result.output.trim();
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Quote ID missing");
    return id;
  }
  const create = (quoteId, retryKey = key) => `select public.checkout_create('${scope}','${retryKey}','${quoteId}',${customer});`;
  // A coordinator advisory lock is the barrier: session two is launched only
  // after session one has completed checkout while holding its transaction open.
  // Poll pg_locks rather than assuming a delay means lock acquisition.
  async function pair(first, second, barrier) {
    const running = sql(`begin; ${first} select pg_advisory_xact_lock(${barrier}); select pg_sleep(2); commit;`, true);
    let observed = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const ready = await sql(`select exists(select 1 from pg_locks where locktype='advisory' and objid=${barrier} and granted);`);
      if (ready.output.trim() === "t") { observed = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!observed) { await running; throw new Error("Concurrency barrier not reached"); }
    const waiting = sql(second, true);
    const results = await Promise.all([running, waiting]);
    return results;
  }
  await sql("update public.product_variants set stock_quantity=1 where product_id=0 and size='S';");
  const first = await quote("S"), second = await quote("S");
  const purchase = await pair(create(first), create(second, "00000000-0000-4000-8000-000000000942"), 9001);
  if (purchase[0].code !== 0 || purchase[1].code === 0 || !purchase[1].output.includes("Stock is unavailable")) throw new Error("Last-unit concurrency failed");
  await sql("do $$ begin if (select count(*) from public.orders)<>1 or (select stock_quantity from public.product_variants where product_id=0 and size='S')<>0 then raise exception 'Oversold'; end if; end; $$;");
  console.log("PASS: two independent sessions compete for the last unit; one commits, one is rejected.");
  const retryQuote = await quote("M");
  const retryKey = "00000000-0000-4000-8000-000000000943";
  const retries = await pair(create(retryQuote, retryKey), create(retryQuote, retryKey), 9002);
  if (retries.some(result => result.code !== 0)) throw new Error("Concurrent retries failed");
  await sql("do $$ begin if (select count(*) from public.orders)<>2 or (select stock_quantity from public.product_variants where product_id=0 and size='M')<>4 then raise exception 'Retry duplicated'; end if; end; $$;");
  console.log("PASS: simultaneous identical retries commit one order and one stock decrement.");
  const rollbackQuote = await quote("L");
  const rollbackKey = "00000000-0000-4000-8000-000000000944";
  const rolled = await pair(`${create(rollbackQuote, rollbackKey)} rollback; begin;`, create(rollbackQuote, rollbackKey), 9003);
  if (rolled.some(result => result.code !== 0)) throw new Error("Rollback retry failed");
  await sql("do $$ begin if (select count(*) from public.orders)<>3 or (select stock_quantity from public.product_variants where product_id=0 and size='L')<>4 then raise exception 'Rollback retry counts incorrect'; end if; end; $$;");
  console.log("PASS: rolled-back attempt can be retried without orphan rows or extra stock consumption.");
  console.log(`New checkout logs: ${directory}. Prior completed suites were not rerun.`);
}
