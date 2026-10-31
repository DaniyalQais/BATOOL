import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { editorProduct, type EditorProduct } from "./product-editor.ts";
import { assertImagePath, IMAGE_UPLOAD_BUCKET, IMAGE_TYPES, imageAlt, imageDimensions, imageHeader, MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES, newUploadPath, ImageValidationError, type UploadedProductImage } from "../../../../supabase/functions/_shared/image-policy.ts";

export interface PreparedImage { file: File; width: number; height: number; originalWidth: number; originalHeight: number; originalSize: number }
export async function prepareProductImage(file: File): Promise<PreparedImage> {
  if (!IMAGE_TYPES.some(type => type === file.type) || !file.size || file.size > MAX_SOURCE_BYTES) throw new ImageValidationError("Choose a JPEG, PNG or WebP file no larger than 12 MiB.");
  imageHeader(new Uint8Array(await file.arrayBuffer()), file.type);
  let decoded: ImageBitmap;
  try { decoded = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new ImageValidationError("The selected file could not be decoded as an image."); }
  try {
    imageDimensions(decoded.width, decoded.height);
    const scale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height));
    const width = Math.round(decoded.width * scale); const height = Math.round(decoded.height * scale);
    imageDimensions(width, height, true);
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageValidationError("Image preparation is unavailable in this browser.");
    context.drawImage(decoded, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .86));
    if (!blob || blob.type !== "image/webp" || blob.size > MAX_UPLOAD_BYTES) throw new ImageValidationError("Could not prepare a WebP image under 5 MiB. Choose a smaller image or use a supported browser.");
    return { file: new File([blob], "prepared.webp", { type: "image/webp" }), width, height,
      originalWidth: decoded.width, originalHeight: decoded.height, originalSize: file.size };
  } finally { decoded.close(); }
}

export class ImageFlowError extends Error {
  stage: "upload" | "validate" | "attach" | "interrupted";
  original?: unknown;
  constructor(stage: ImageFlowError["stage"], original?: unknown) {
    super(stage === "attach" ? "Attachment was not confirmed. Reload products before retrying; the request may have reached the database. Retained uploads were not deleted."
      : stage === "upload" ? "Upload was not confirmed. No image attachment was requested. Check Owner access, file limits and Storage configuration; an upload may have been retained."
      : stage === "validate" ? "Trusted image validation was not confirmed. No image attachment was requested. Check validator setup and Owner access. Uploaded files were retained for review."
      : "Access verification interrupted the operation. No further attachment was requested; reload products before retrying. Retained uploads were not deleted.");
    this.stage = stage; this.original = original;
  }
}
export async function attachProductImage(client: SupabaseClient<Database>, product: EditorProduct, image: UploadedProductImage) {
  const alt = imageAlt(image.alt); assertImagePath(image.path, product.id); imageDimensions(image.width, image.height, true);
  const { data, error } = await client.rpc("owner_attach_product_image", { p_product_id: product.id,
    p_expected_revision: product.revision, p_image_path: image.path, p_alt: alt });
  if (error) throw error;
  try {
    const saved = editorProduct(data);
    if (saved.id !== product.id || saved.revision <= product.revision || saved.uploadedImage?.path !== image.path || saved.uploadedImage.alt !== alt) throw new Error("Invalid confirmation");
    return saved;
  } catch {
    // A successful RPC with a bad response may already have committed.
    // Never classify response parsing as an input rejection / unchanged database.
    throw new Error("Image save confirmation invalid; outcome uncertain.");
  }
}
export async function uploadProductImage(client: SupabaseClient<Database>, product: EditorProduct, prepared: PreparedImage, altText: string,
  canContinue: () => boolean, onValidated: (image: UploadedProductImage) => void = () => {}) {
  const alt = imageAlt(altText);
  imageDimensions(prepared.width, prepared.height, true);
  if (prepared.file.type !== "image/webp" || !prepared.file.size || prepared.file.size > MAX_UPLOAD_BYTES) throw new ImageValidationError("Invalid prepared image.");
  const identity = await client.auth.getUser();
  if (identity.error || !identity.data.user || identity.data.user.is_anonymous) throw new ImageFlowError("upload");
  const path = newUploadPath(product.id, identity.data.user.id, crypto.randomUUID(), "image/webp");
  if (!canContinue()) throw new ImageFlowError("interrupted");
  try {
    const result = await client.storage.from(IMAGE_UPLOAD_BUCKET).upload(path, prepared.file, { contentType: "image/webp", upsert: false, cacheControl: "3600" });
    if (result.error) throw result.error;
  } catch { throw new ImageFlowError("upload"); }
  if (!canContinue()) throw new ImageFlowError("interrupted");
  let image: UploadedProductImage;
  try {
    const { data, error } = await client.functions.invoke("validate-product-image", { body: { productId: product.id, uploadPath: path } });
    if (error || !data || typeof data.path !== "string" || typeof data.width !== "number" || typeof data.height !== "number") throw new Error("Invalid receipt");
    image = { path: assertImagePath(data.path, product.id), width: data.width, height: data.height, alt };
    imageDimensions(image.width, image.height, true);
  } catch { throw new ImageFlowError("validate"); }
  onValidated(image);
  if (!canContinue()) throw new ImageFlowError("interrupted");
  try { return await attachProductImage(client, product, image); }
  catch (error) { throw new ImageFlowError("attach", error); }
}
