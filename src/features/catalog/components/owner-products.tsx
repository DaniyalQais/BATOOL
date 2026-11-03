"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { adminClient } from "@/features/auth/model/browser-client";
import { ownerCatalog } from "../model/owner-catalog";
import { editorFailure, productDraft, type EditorProduct, type ProductDraft } from "../model/product-editor";
import { availableSizes } from "../model/types";
import { OwnerProductImage } from "./owner-product-image";
import { OwnerDraftCreate } from "./owner-draft-create";
import { activationRequirements } from "../model/product-creation";
import { productMediaReleased, trustedValidatorReady } from "../model/product-media-readiness";
import { OwnerMerchandiseApproval } from "./owner-merchandise-approval";
import styles from "./owner-products.module.css";

type Notice = { kind: "saving" | "success" | "error"; text: string; reloadRequired?: boolean };
type EditorState = {
  account: string; products: EditorProduct[]; drafts: Record<number, ProductDraft>;
  notices: Record<number, Notice>; loading: boolean; error: string;
  imageGeneration: number;
};
const empty = (): EditorState => ({ account: "", products: [], drafts: {}, notices: {}, loading: false, error: "", imageGeneration: 0 });

// This component stays mounted during session rechecks, retaining drafts only in
// memory for the same verified Owner. Its content is hidden until access is ready.
export function OwnerProducts({ enabled, account, clear }: { enabled: boolean; account: string; clear: boolean }) {
  const [state, setState] = useState<EditorState>(empty);
  const [imageBusy, setImageBusy] = useState<Record<number, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  useEffect(() => {
    let current = true; setMediaReady(false);
    if (enabled && productMediaReleased()) void adminClient().functions.invoke("validate-product-image", { method: "GET" })
      .then(({ data, error }) => { if (current) setMediaReady(!error && trustedValidatorReady(data)); })
      .catch(() => { if (current) setMediaReady(false); });
    return () => { current = false; };
  }, [enabled, account, state.imageGeneration]);
  const current = useRef(state); current.current = state;
  const generation = useRef(0);
  const pending = useRef(new Map<number, number>());
  const active = useRef(false);

  async function load(accountKey: string) {
    const token = ++generation.current;
    setState(previous => ({ ...previous, loading: true, error: "" }));
    try {
      const products = await ownerCatalog(adminClient()).list();
      if (token !== generation.current || !active.current) return;
      setImageBusy({});
      setState({ account: accountKey, products, drafts: Object.fromEntries(products.map(p => [p.id, productDraft(p)])), notices: {}, loading: false, error: "", imageGeneration: token });
    } catch (error) {
      if (token !== generation.current || !active.current) return;
      const failure = editorFailure(error);
      setState(previous => ({ ...previous, account: accountKey, loading: false,
        error: failure.kind === "uncertain" ? "Could not load current database products. Check your connection and Owner access, then retry. No demo fallback was used." : failure.message }));
    }
  }
  useEffect(() => {
    active.current = enabled;
    generation.current++;
    if (clear) { setState(empty()); setImageBusy({}); }
    else if (enabled && account) {
      if (current.current.account !== account || !current.current.products.length) void load(account);
    }
    return () => {
      active.current = false;
      generation.current++;
      if (pending.current.size) {
        pending.current.clear();
        setState(previous => ({ ...previous, notices: Object.fromEntries(Object.entries(previous.notices).map(([id, notice]) => [id,
          notice.kind === "saving" ? { kind: "error", text: "Save confirmation was interrupted. Reload the latest products before retrying.", reloadRequired: true } : notice])) }));
      }
    };
  }, [enabled, account, clear]); // Draft edits must not trigger a new database read.

  function change(id: number, update: Partial<ProductDraft>) {
    setState(previous => ({ ...previous, drafts: { ...previous.drafts, [id]: { ...previous.drafts[id], ...update } },
      notices: { ...previous.notices, [id]: previous.notices[id]?.reloadRequired ? previous.notices[id] : { kind: "error", text: "" } } }));
  }
  async function save(event: FormEvent, product: EditorProduct) {
    event.preventDefault();
    if (!enabled || imageBusy[product.id] || pending.current.has(product.id) || current.current.notices[product.id]?.reloadRequired) return;
    const token = generation.current;
    const draft = current.current.drafts[product.id];
    pending.current.set(product.id, token);
    setState(previous => ({ ...previous, notices: { ...previous.notices, [product.id]: { kind: "saving", text: "Saving to the database…" } } }));
    try {
      const saved = await ownerCatalog(adminClient()).save(product, draft);
      if (token !== generation.current || !active.current) return;
      setState(previous => ({ ...previous, products: previous.products.map(p => p.id === saved.id ? saved : p),
        drafts: { ...previous.drafts, [saved.id]: productDraft(saved) },
        notices: { ...previous.notices, [saved.id]: { kind: "success", text: "Saved to the database. Storefront changes require rebuilding and publishing; the published storefront has not been updated by this save." } } }));
    } catch (error) {
      if (token !== generation.current || !active.current) return;
      const failure = editorFailure(error);
      setState(previous => ({ ...previous, notices: { ...previous.notices, [product.id]: { kind: "error", text: failure.message,
        reloadRequired: failure.kind === "conflict" || failure.kind === "uncertain" } } }));
    } finally { if (pending.current.get(product.id) === token) pending.current.delete(product.id); }
  }

  const loading = state.loading || state.account !== account;
  const saving = creating || Object.values(state.notices).some(n => n.kind === "saving") || Object.values(imageBusy).some(Boolean);
  return <section hidden={!enabled} className={styles.section} aria-labelledby="owner-products-title">
    <h2 id="owner-products-title">Products</h2>
    <p>Current database values, including inactive products. Unknown stock is unconfirmed; zero means explicitly out of stock. The catalog does not reserve stock. Secure checkout validates known per-size stock and deducts it only when an order commits.</p>
    <OwnerDraftCreate enabled={enabled && !loading} clear={clear} schemaReady={state.products.length > 0 && state.products.every(product => product.draftSchemaReady)} onBusy={setCreating}
      onSaved={product => setState(previous => ({ ...previous, products: [product, ...previous.products.filter(p => p.id !== product.id)],
        drafts: { ...previous.drafts, [product.id]: productDraft(product) } }))} />
    <button className={styles.reload} disabled={loading || saving} onClick={() => { if (!pending.current.size) void load(account); }}>Reload products (discards unsaved edits)</button>
    {loading && <p role="status">Loading current database products…</p>}
    {state.error && <p role="alert" className={styles.notice}>{state.error}</p>}
    {state.products.map(product => {
      const draft = state.drafts[product.id];
      const notice = state.notices[product.id];
      const busy = notice?.kind === "saving";
      const missing = activationRequirements(product, draft);
      return <form key={product.id} hidden={loading} className={styles.product} onSubmit={event => { void save(event, product); }} aria-busy={busy || imageBusy[product.id]}>
        <h3>{product.name}</h3>
        <p>{product.archived ? "Archived (inactive)" : product.active ? "Active for the next build" : "Inactive draft"}. Saving does not publish; new public routes require rebuilding and deployment.</p>
        <p className={styles.reference}>/{product.slug}/ · {product.isDemo ? "Demo product" : "Catalog product"}</p>
        {product.imageNote && <p className={styles.reference}>{product.imageNote}</p>}
        <fieldset className={styles.fields} disabled={busy || imageBusy[product.id] || loading || !enabled}>
          <legend className={styles.legend}>Edit {product.slug}</legend>
          <label className={styles.field}>Product name<input value={draft.name} required onChange={e => change(product.id, { name: e.target.value })} /></label>
          <label className={styles.field}>Description<textarea value={draft.description} required rows={4} onChange={e => change(product.id, { description: e.target.value })} /></label>
          <label className={styles.field}>Price (PKR)<input value={draft.price} required inputMode="decimal" placeholder="8950.00" onChange={e => change(product.id, { price: e.target.value })} /></label>
          {product.draftSchemaReady && <>
            <label className={styles.field}>Collection<select value={draft.subcategory ?? ""} onChange={event => change(product.id, { subcategory: event.target.value || null })}>
              <option value="">Not selected</option>{["Daily Pret", "Festive Edit", "Luxury Formals"].map(value => <option key={value}>{value}</option>)}
            </select></label>
            <label className={styles.field}>Card label<input value={draft.tag ?? ""} maxLength={80} onChange={event => change(product.id, { tag: event.target.value || null })} /></label>
            <label className={styles.field}>Card accent color (#RRGGBB)<input value={draft.color ?? ""} placeholder="#51343f" onChange={event => change(product.id, { color: event.target.value || null })} /></label>
            <label className={styles.check}><input type="checkbox" checked={draft.archived ?? false} onChange={event => change(product.id, { archived: event.target.checked, ...(event.target.checked ? { active: false } : {}) })} /> Archive (keep inactive; retain product and images)</label>
          </>}
          {missing.length > 0 && <div className={styles.notice}><p>Before activation:</p><ul>{missing.map(message => <li key={message}>{message}</li>)}</ul></div>}
          <label className={styles.check}><input type="checkbox" disabled={!draft.active && missing.length > 0} checked={draft.active} onChange={e => change(product.id, { active: e.target.checked })} /> Active in the next storefront build</label>
          <fieldset className={styles.stock}><legend>Stock by size</legend>
            {availableSizes.map(size => <div key={size} className={styles.size}>
              <strong>{size}</strong>
              <label className={styles.check}><input type="checkbox" checked={draft.stock[size] === null}
                onChange={e => change(product.id, { stock: { ...draft.stock, [size]: e.target.checked ? null : "" } })} /> Unknown</label>
              <label className={styles.field}>Quantity ({size})<input inputMode="numeric" disabled={draft.stock[size] === null}
                value={draft.stock[size] ?? ""} placeholder={draft.stock[size] === null ? "Unknown" : "0"}
                required={draft.stock[size] !== null} onChange={e => change(product.id, { stock: { ...draft.stock, [size]: e.target.value } })} /></label>
            </div>)}
          </fieldset>
          <button className={styles.save} type="submit" disabled={notice?.reloadRequired}>{busy ? "Saving…" : "Save product"}</button>
        </fieldset>
        <OwnerProductImage key={`${product.id}-${state.imageGeneration}`} product={product} uploadAvailable={mediaReady}
          disabled={busy || loading || !enabled || Boolean(notice?.reloadRequired)}
          onBusy={value => setImageBusy(previous => ({ ...previous, [product.id]: value }))}
          onSaved={saved => {
            if (!active.current) return;
            // Keep unsaved detail drafts; the new shared revision protects subsequent saves.
            setState(previous => ({ ...previous, products: previous.products.map(p => p.id === saved.id ? saved : p),
              drafts: { ...previous.drafts, [saved.id]: { ...previous.drafts[saved.id], active: saved.active } } }));
          }} />
        <OwnerMerchandiseApproval key={`${account}-${product.id}-${state.imageGeneration}`} product={product} enabled={mediaReady}
          disabled={busy || loading || !enabled || Boolean(imageBusy[product.id]) || Boolean(notice?.reloadRequired)}
          dirty={JSON.stringify(draft) !== JSON.stringify(productDraft(product))}
          onBusy={value => setImageBusy(previous => ({ ...previous, [product.id]: value }))}
          onSaved={saved => { if (active.current) setState(previous => ({ ...previous, products: previous.products.map(p => p.id === saved.id ? saved : p) })); }} />
        {notice?.text && <p className={styles.notice} role={notice.kind === "error" ? "alert" : "status"} aria-live="polite">{notice.text}</p>}
      </form>;
    })}
  </section>;
}
