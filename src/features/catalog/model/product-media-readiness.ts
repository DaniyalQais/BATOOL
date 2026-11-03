import { IMAGE_VALIDATOR_CONTRACT } from "../../../../supabase/functions/_shared/image-policy.ts";
export function productMediaReleased(): boolean {
  return process.env.NEXT_PUBLIC_PRODUCT_MEDIA_RELEASE === "true";
}
export function trustedValidatorReady(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    (value as Record<string, unknown>).ready === true && (value as Record<string, unknown>).contract === IMAGE_VALIDATOR_CONTRACT;
}
