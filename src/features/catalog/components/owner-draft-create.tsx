"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { adminClient } from "../../auth/model/browser-client";
import { ownerCatalog } from "../model/owner-catalog";
import { createDraftPayload, type Creation } from "../model/product-creation";
import { editorFailure, type EditorProduct, type ProductDraft } from "../model/product-editor";
import { availableSizes } from "../model/types";
import styles from "./owner-products.module.css";
const blank = (): ProductDraft => ({ name: "", description: "", price: "", active: false, stock: { S: null, M: null, L: null, XL: null } });

export function OwnerDraftCreate({ enabled, schemaReady, clear, onSaved, onBusy }: {
  enabled: boolean; schemaReady: boolean; clear: boolean;
  onSaved(product: EditorProduct): void; onBusy(value: boolean): void;
}) {
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState(false);
  const attempt = useRef<Creation | undefined>(undefined); const operation = useRef(0);
  const allowed = useRef(enabled); allowed.current = enabled;
  const pending = useRef(false);
  useEffect(() => {
    if (clear) { operation.current++; attempt.current = undefined; pending.current = false; setDraft(blank()); setNotice(""); setLocked(false); setBusy(false); onBusy(false); }
    // onBusy is a parent state callback; only explicit access clearing resets a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clear]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!enabled || !schemaReady || pending.current) return;
    try { attempt.current ??= createDraftPayload(draft, crypto.randomUUID()); }
    catch (error) { setNotice(editorFailure(error).message); return; }
    const token = operation.current; pending.current = true; setBusy(true); onBusy(true); setLocked(true);
    setNotice("Saving an inactive draft…");
    try {
      const product = await ownerCatalog(adminClient()).create(attempt.current);
      if (token !== operation.current) return;
      if (!allowed.current) { setNotice("Access was rechecked during creation. When Owner access returns, retry this same request to recover its result."); return; }
      onSaved(product); attempt.current = undefined; setLocked(false); setDraft(blank());
      setNotice("Draft request confirmed. A new draft starts inactive without an image. Saving does not publish a product or create a public route; rebuilding and deployment are required after activation.");
    } catch (error) {
      if (token !== operation.current) return;
      const failure = editorFailure(error);
      if (["validation", "setup", "denied"].includes(failure.kind)) { attempt.current = undefined; setLocked(false); }
      setNotice(`${failure.message}${failure.kind === "uncertain" ? " Use Retry draft creation in this tab; it reuses the same request and cannot create a second product. Before reloading or starting another request, review the current product list." : ""}`);
    } finally {
      if (token === operation.current) { pending.current = false; setBusy(false); onBusy(false); }
    }
  }
  return <form className={styles.product} onSubmit={event => { void create(event); }} aria-busy={busy}>
    <h3>Create an inactive draft</h3>
    <p>Stitched 3-piece, PKR, S/M/L/XL. No image is assigned. Drafts stay out of the next storefront build until activation requirements are met. Saving never deploys the storefront.</p>
    {!schemaReady && <p role="status" className={styles.notice}>Draft creation needs the reviewed product-drafts migration. Existing product editing remains available.</p>}
    <fieldset className={styles.fields} disabled={!enabled || !schemaReady || busy || locked}>
      <legend>New product</legend>
      <label className={styles.field}>Product name<input required maxLength={240} value={draft.name} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} /></label>
      <label className={styles.field}>Description<textarea required rows={3} value={draft.description} onChange={event => setDraft(previous => ({ ...previous, description: event.target.value }))} /></label>
      <label className={styles.field}>Price (PKR)<input required inputMode="decimal" value={draft.price} onChange={event => setDraft(previous => ({ ...previous, price: event.target.value }))} /></label>
      <fieldset className={styles.stock}><legend>Initial stock</legend>{availableSizes.map(size => <div key={size}>
        <strong>{size}</strong>
        <label className={styles.check}><input type="checkbox" checked={draft.stock[size] === null} onChange={event => setDraft(previous => ({ ...previous, stock: { ...previous.stock, [size]: event.target.checked ? null : "" } }))} />Unknown</label>
        <label className={styles.field}>Quantity ({size})<input inputMode="numeric" disabled={draft.stock[size] === null} required={draft.stock[size] !== null} value={draft.stock[size] ?? ""} onChange={event => setDraft(previous => ({ ...previous, stock: { ...previous.stock, [size]: event.target.value } }))} /></label>
      </div>)}</fieldset>
    </fieldset>
    <button className={styles.save} disabled={!enabled || !schemaReady || busy} type="submit">{busy ? "Creating draft…" : locked ? "Retry draft creation" : "Create inactive draft"}</button>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </form>;
}
