import { CatalogImage } from "./catalog-image";
import type { UploadedProductImage } from "../../../supabase/functions/_shared/image-policy";
import styles from "./product-photo.module.css";
export function ProductPhoto({
  slug,
  alt,
  className = "",
  priority = false,
  sizes = "(max-width: 560px) 44vw, (max-width: 900px) 43vw, 23vw",
  framing,
  uploadedImage,
}: {
  slug: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  framing?: { position?: string; zoom?: number };
  uploadedImage?: UploadedProductImage;
}) {
  return (
    <div className={`${styles.frame} ${className}`}>
      <CatalogImage
        src={slug}
        uploadedImage={uploadedImage}
        alt={alt}
        fill
        sizes={sizes}
        preload={priority}
        className={styles.image}
        style={framing ? {
          objectPosition: framing.position,
          transform: `scale(${framing.zoom ?? 1})`,
          transformOrigin: framing.position ?? "center",
        } : undefined}
      />
    </div>
  );
}
