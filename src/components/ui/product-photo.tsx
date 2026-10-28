import Image from "next/image";
import styles from "./product-photo.module.css";
export function ProductPhoto({
  slug,
  alt,
  className = "",
  priority = false,
  sizes = "(max-width: 560px) 44vw, (max-width: 900px) 43vw, 23vw",
  framing,
}: {
  slug: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  framing?: { position?: string; zoom?: number };
}) {
  return (
    <div className={`${styles.frame} ${className}`}>
      <Image
        src={slug}
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
