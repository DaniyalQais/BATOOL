import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
const source = "assets/source/stitched-editorial.png";
const { width, height } = await sharp(source).metadata();
await mkdir("public/images", { recursive: true });
const names = ["gulnaar", "meher", "saba", "noor"];
const original = await stat(source);
let sourceBytes = original.size;
let bytes = 0;
let variants = 0;
for (const [index, name] of names.entries()) {
  for (const size of [192, 384]) {
    const target = `public/images/${name}-${size}.webp`;
    const result = await sharp(source)
      .extract({ left: index * (width / names.length), top: 0, width: width / names.length, height })
      .resize({ width: size })
      .webp({ quality: 82 })
      .toFile(target);
    bytes += result.size;
    variants++;
  }
}
// Mira and Zeenat reuse full sample portraits, disclosed in product data.
// Preserve the head and portrait proportions instead of extracting a garment detail.
for (const { name, panel } of [
  { name: "mira", panel: 1 },
  { name: "zeenat", panel: 0 },
]) {
  for (const size of [192, 384]) {
    const result = await sharp(source)
      .extract({ left: panel * (width / names.length), top: 0, width: width / names.length, height })
      .resize({ width: size, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(`public/images/${name}-${size}.webp`);
    bytes += result.size;
    variants++;
  }
}
// Restored styling concepts support the stitched velvet/silk formal previews.
for (const name of ["amanah", "layal"]) {
  const formalSource = `assets/source/${name}-formal-concept.png`;
  sourceBytes += (await stat(formalSource)).size;
  for (const size of [192, 384]) {
    const result = await sharp(formalSource)
      .resize({ width: size, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(`public/images/${name}-${size}.webp`);
    bytes += result.size;
    variants++;
  }
}
// Desktop previews contain only the retained stitched outfits.
for (const width of [576, 864, 1152]) {
  const result = await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(`public/images/campaign-stitched-${width}.webp`);
  bytes += result.size;
  variants++;
}
console.log(
  `Image assets: ${sourceBytes} source bytes → ${bytes} bytes across ${variants} WebP variants.`,
);
