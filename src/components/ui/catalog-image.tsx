"use client";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { publicImageUrl, type UploadedProductImage } from "../../../supabase/functions/_shared/image-policy";

interface Props {
  src: string; alt: string; uploadedImage?: UploadedProductImage; width?: number; height?: number;
  fill?: boolean; sizes?: string; preload?: boolean; className?: string; style?: CSSProperties;
}
/** Remote variants bypass the local-only Next loader entirely. No error fallback. */
export function CatalogImage({ uploadedImage: image, ...props }: Props) {
  const [failedPath, setFailedPath] = useState("");
  if (!image) return <Image {...props} />;
  const url = publicImageUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", image.path);
  const base = url.replace(/\/main\.webp$/, "");
  const alt = props.alt === "" ? "" : image.alt;
  const style: CSSProperties = { ...(props.fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : {}), ...props.style };
  if (failedPath === image.path) return <span className={props.className} style={style} role="img" aria-label={`${alt || "Product"}: image unavailable`}>Image unavailable</span>;
  const sources = [`${base}/192.webp 192w`, `${base}/384.webp 384w`];
  if (image.width > 384) sources.push(`${url} ${image.width}w`);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} srcSet={sources.join(", ")} sizes={props.sizes ?? `${props.width ?? image.width}px`}
    alt={alt} width={props.width ?? image.width} height={props.height ?? image.height} className={props.className}
    style={style} loading={props.preload ? "eager" : "lazy"} fetchPriority={props.preload ? "high" : "auto"}
    decoding="async" onError={() => setFailedPath(image.path)} />;
}
