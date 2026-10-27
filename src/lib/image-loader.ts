"use client";
import type { ImageLoaderProps } from "next/image";
/** Static hosting has no image server. Variants are generated during the build. */
export default function imageLoader({ src, width }: ImageLoaderProps) {
  return `/images/${src}-${width <= 192 ? 192 : 384}.webp`;
}
