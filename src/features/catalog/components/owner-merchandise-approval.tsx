"use client";
import { useEffect, useRef, useState } from "react";
import { adminClient } from "@/features/auth/model/browser-client";
import { ownerCatalog } from "../model/owner-catalog";
import { availableSizes } from "../model/types";
import { editorFailure, type EditorProduct } from "../model/product-editor";
import styles from "./owner-products.module.css";

export function OwnerMerchandiseApproval({ product, enabled, disabled, dirty, onBusy, onSaved }: {
  product: EditorProduct; enabled: boolean; disabled: boolean; dirty: boolean;
  onBusy: (value: boolean) => void; onSaved: (product: EditorProduct) => void;
}) {
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [reload, setReload] = useState(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const missing = !product.uploadedImage || product.archived || !product.subcategory || !product.tag || !product.color ||
    availableSizes.some(size => product.stock[size] === null);
  async function approve() {
    if (!enabled || disabled || dirty || missing || !confirmed || busy || reload) return;
    setBusy(true); onBusy(true);
    try {
      const saved = await ownerCatalog(adminClient()).approveMerchandise(product);
      if (!mounted.current) return;
      onSaved(saved); setConfirmed(false); setNotice("Merchandise approval saved. Activate and save the product when ready; checkout still requires its separate release. Rebuild and publish public changes.");
    } catch (error) {
      if (mounted.current) { setNotice(editorFailure(error).message); setReload(true); }
    } finally { if (mounted.current) setBusy(false); onBusy(false); }
  }
  return <fieldset className={styles.imageFields} disabled={disabled || busy}>
    <legend>Approve real merchandise</legend>
    <p>A photo upload alone does not approve merchandise. Save the product details, collection, label, accent color and known S/M/L/XL quantities (zero means out of stock), then attach this product’s validated photo.</p>
    {dirty && <p>Save your current edits before approving merchandise.</p>}
    {!enabled && <p>Approval remains disabled until the reviewed media deployment is ready.</p>}
    <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={!enabled || missing || dirty || reload}
      onChange={event => setConfirmed(event.target.checked)} /> I approve this product and its current photo as genuine merchandise.</label>
    <button type="button" className={styles.save} disabled={!enabled || !confirmed || missing || dirty || reload} onClick={() => { void approve(); }}>Approve current merchandise and photo</button>
    <p>Replacing the main photo makes the product inactive and a sample until you approve and activate it again. Previous image files remain retained.</p>
    {notice && <p role="status">{notice}</p>}
    {reload && <p role="alert">Reload products and review the latest state before retrying.</p>}
  </fieldset>;
}
