"use client";
import { useEffect, useRef, useState } from "react";
import { adminClient } from "@/features/auth/model/browser-client";
import { CatalogImage } from "@/components/ui/catalog-image";
import { ImageValidationError } from "../../../../supabase/functions/_shared/image-policy";
import { attachProductImage, ImageFlowError, prepareProductImage, uploadProductImage, type PreparedImage } from "../model/product-image-upload";
import { editorFailure, type EditorProduct } from "../model/product-editor";
import styles from "./owner-products.module.css";

export function OwnerProductImage({ product, disabled, onBusy, onSaved }: {
  product: EditorProduct; disabled: boolean; onBusy: (busy: boolean) => void; onSaved: (product: EditorProduct) => void;
}) {
  const [prepared, setPrepared] = useState<PreparedImage>();
  const [alt, setAlt] = useState(product.uploadedImage?.alt ?? "");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const [validatedPath, setValidatedPath] = useState("");
  const mounted = useRef(true); const selection = useRef(0);
  const unavailable = useRef(disabled); unavailable.current = disabled;
  const previewUrl = useRef("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selection.current++; URL.revokeObjectURL(previewUrl.current); }; }, []);

  async function select(file: File | undefined) {
    const token = ++selection.current;
    URL.revokeObjectURL(previewUrl.current); previewUrl.current = ""; setPreview(""); setPrepared(undefined); setValidatedPath(""); setNotice("");
    if (!file) return;
    setBusy(true); onBusy(true);
    try {
      const result = await prepareProductImage(file);
      if (!mounted.current || token !== selection.current) return;
      const url = URL.createObjectURL(result.file); previewUrl.current = url; setPreview(url); setPrepared(result);
      setNotice("Preview prepared locally. Nothing has been uploaded or saved.");
    } catch (error) {
      if (mounted.current && token === selection.current) setNotice(error instanceof ImageValidationError ? error.message : "Image preparation failed. Nothing was uploaded.");
    } finally { if (mounted.current && token === selection.current) { setBusy(false); onBusy(false); } }
  }
  async function save(upload: boolean) {
    if (busy || disabled || reloadRequired || (upload && !prepared)) return;
    setBusy(true); onBusy(true); setNotice(upload ? "Uploading, validating and attaching the image…" : "Saving image alt text…");
    try {
      const client = adminClient();
      const saved = upload ? await uploadProductImage(client, product, prepared!, alt, () => mounted.current && !unavailable.current,
        image => { if (mounted.current) setValidatedPath(image.path); })
        : await attachProductImage(client, product, { ...product.uploadedImage!, alt });
      if (!mounted.current) return;
      if (unavailable.current) throw new ImageFlowError("attach");
      onSaved(saved); setAlt(saved.uploadedImage?.alt ?? ""); setPrepared(undefined); setPreview(""); URL.revokeObjectURL(previewUrl.current); previewUrl.current = "";
      setNotice("Image saved to the database. Rebuild and publish to update the storefront. Previous images were retained for existing exports.");
    } catch (error) {
      if (!mounted.current) return;
      const underlying = error instanceof ImageFlowError ? error.original : error;
      const failure = editorFailure(underlying);
      const message = error instanceof ImageValidationError ? error.message
        : error instanceof ImageFlowError && error.stage !== "attach" ? error.message
        : failure.kind === "uncertain" ? "Image attachment could not be confirmed. Reload before retrying; it may have reached the database. No retained image was deleted."
        : failure.kind === "setup" ? "Image attachment is not configured. Ask the administrator to check image migration 005 and reload. Uploaded objects were retained."
        : failure.kind === "validation" ? "The database rejected this image attachment. Check the validated product-specific image and alt text, then reload. Uploaded objects were retained."
        : `${failure.message} The previous product image was not replaced by this rejected request; uploaded objects were retained.`;
      setNotice(message); setReloadRequired(!(error instanceof ImageValidationError));
    } finally { if (mounted.current) { setBusy(false); onBusy(false); } }
  }

  if (!product.imageSchemaReady) return <p className={styles.notice}>Image uploads are not configured. Apply the reviewed image migration and configure its validator first. Existing product editing remains available.</p>;
  return <fieldset className={styles.imageFields} disabled={disabled || busy} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
    <legend>Main product image</legend>
    {product.uploadedImage && <CatalogImage src="" uploadedImage={product.uploadedImage} alt={product.uploadedImage.alt} width={160} height={200} style={{ objectFit: "contain" }} />}
    <label className={styles.field}>Choose replacement image (JPEG, PNG or WebP)
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={reloadRequired} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void select(file); }} />
    </label>
    <p className={styles.reference}>At least 384 × 384; maximum 12 MiB, 8192 pixels per side and 24 megapixels. Preview is compressed locally; the server independently decodes and validates it. No upload happens until you confirm.</p>
    {prepared && <>
      {/* Local blob preview, never passed to the local asset loader. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt={alt.trim() || "Selected image preview"} className={styles.imagePreview} />
      <p>Original: {prepared.originalWidth} × {prepared.originalHeight}, {(prepared.originalSize / 1024).toFixed(1)} KiB. Prepared: {prepared.width} × {prepared.height}, {(prepared.file.size / 1024).toFixed(1)} KiB.</p>
    </>}
    <label className={styles.field}>Image alt text (1–240 characters)
      <input value={alt} maxLength={480} onChange={event => setAlt(event.target.value)} placeholder="Describe the visible outfit and relevant visual details" />
    </label>
    <button className={styles.save} type="button" disabled={!prepared || reloadRequired} onClick={() => { void save(true); }}>Upload and save main image</button>
    {product.uploadedImage && !prepared && <button className={styles.reload} type="button" disabled={reloadRequired} onClick={() => { void save(false); }}>Save alt text only</button>}
    {notice && <p className={styles.notice} role="status" aria-live="polite">{notice}</p>}
    {validatedPath && reloadRequired && <p className={styles.reference}>Retained validated object for trusted administrative review: {validatedPath}. Reload before any retry; do not delete it automatically.</p>}
    {reloadRequired && <p role="alert">Use Reload products above before retrying. Reload discards unsaved text edits and this preview.</p>}
  </fieldset>;
}
