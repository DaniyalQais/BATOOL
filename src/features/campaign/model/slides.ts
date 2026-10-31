import type { Category } from "../../catalog/model/types.ts";

export interface CampaignImage {
  readonly src: string;
  readonly srcSet: string;
  readonly width: number;
  readonly height: number;
  readonly position: string;
}
export interface CampaignSlide {
  readonly id: string;
  readonly eyebrow: string;
  readonly headline: string;
  readonly supporting: string;
  readonly category: Category;
  readonly cta: string;
  readonly alt: string;
  readonly desktop: CampaignImage;
  readonly mobile: CampaignImage;
}
function sampleImage(slug: string, position: string): CampaignImage {
  return {
    src: `/images/${slug}-384.webp`,
    srcSet: `/images/${slug}-192.webp 192w, /images/${slug}-384.webp 384w`,
    width: 384,
    height: 1024,
    position,
  };
}
export type CampaignId = "everyday" | "moments" | "signature";
export type CampaignImages = Readonly<Record<CampaignId, {
  readonly desktop: CampaignImage;
  readonly mobile: CampaignImage;
}>>;

// Each number selects a different stitched outfit on both desktop and mobile.
// Keep the original portraits rather than reusing one collage for every slide.
export const campaignImages: CampaignImages = {
  everyday: {
    desktop: sampleImage("noor", "50% 5%"),
    mobile: sampleImage("noor", "50% 3%"),
  },
  moments: {
    desktop: sampleImage("meher", "50% 5%"),
    mobile: sampleImage("meher", "48% 3%"),
  },
  signature: {
    desktop: sampleImage("gulnaar", "50% 5%"),
    mobile: sampleImage("gulnaar", "53% 2%"),
  },
};

export function createCampaignSlides(images: CampaignImages = campaignImages): readonly CampaignSlide[] {
  const outfits = [
    { id: "everyday", alt: "Noor ivory stitched 3-piece ensemble. Sample editorial imagery." },
    { id: "moments", alt: "Meher deep plum stitched 3-piece ensemble. Sample editorial imagery." },
    { id: "signature", alt: "Gulnaar dusty mauve stitched 3-piece ensemble. Sample editorial imagery." },
  ] as const;
  return outfits.map(({ id, alt }) => ({
    id,
    eyebrow: "THE 3-PIECE EDIT",
    headline: "Your everyday. Beautifully dressed.",
    supporting: "Stitched 3-piece concepts in S–XL. Garment details await brand confirmation.",
    category: "Stitched",
    cta: "Shop 3-Piece",
    alt,
    ...images[id],
  }));
}

export const campaignSlides = createCampaignSlides();
