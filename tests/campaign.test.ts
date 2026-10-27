import { test } from "node:test";
import assert from "node:assert/strict";
import { canRotate, carouselReducer, initialCarouselState } from "../src/features/campaign/model/carousel.ts";
import { campaignImages, campaignSlides, createCampaignSlides, type CampaignImages } from "../src/features/campaign/model/slides.ts";
import { collectionHref, selectProducts } from "../src/features/catalog/model/catalog.ts";
import { products } from "../src/features/catalog/model/products.ts";
import { existsSync } from "node:fs";

const visible = { pageVisible: true, inView: true };
function started(reducedMotion = false) {
  const initialized = carouselReducer(initialCarouselState, { type: "initialize", reducedMotion });
  return carouselReducer(initialized, { type: "ready", index: 0 });
}

test("rotation waits for initialization and image readiness; reduced motion starts paused", () => {
  assert.equal(canRotate(initialCarouselState, visible), false);
  const initialized = carouselReducer(initialCarouselState, { type: "initialize", reducedMotion: false });
  assert.equal(canRotate(initialized, visible), false);
  assert.equal(canRotate(started(), visible), true);
  assert.equal(canRotate(started(true), visible), false);
  assert.equal(canRotate(carouselReducer(started(true), { type: "play" }), visible), true);
});

test("hidden tabs and offscreen heroes suspend rotation without losing play/pause intent", () => {
  const state = started();
  for (const conditions of [
    { ...visible, pageVisible: false }, { ...visible, inView: false },
  ]) assert.equal(canRotate(state, conditions), false);
  assert.equal(canRotate(state, visible), true);
  const paused = carouselReducer(state, { type: "pause" });
  assert.equal(canRotate(paused, visible), false);
});

test("manual navigation preserves playback intent and only shows a ready image", () => {
  let state = carouselReducer(started(), { type: "request", index: 1, count: 3, manual: true });
  assert.equal(state.active, 0);
  assert.equal(state.pending, 1);
  assert.equal(state.paused, false);
  state = carouselReducer(state, { type: "ready", index: 1 });
  assert.equal(state.active, 1);
  assert.equal(canRotate(state, visible), true);
  state = carouselReducer(state, { type: "pause" });
  state = carouselReducer(state, { type: "request", index: 1, count: 3, manual: true });
  assert.equal(state.paused, true);
  state = carouselReducer(state, { type: "play" });
  assert.equal(canRotate(state, visible), true);
});

test("Pause cancels pending automatic transitions and ignores an already queued timer", () => {
  let state = carouselReducer(started(), { type: "request", index: 1, count: 3, manual: false });
  assert.equal(state.pending, 1);
  state = carouselReducer(state, { type: "pause" });
  state = carouselReducer(state, { type: "ready", index: 1 });
  assert.equal(state.active, 0);
  assert.equal(state.pending, null);
  assert.equal(state.paused, true);
  assert.equal(carouselReducer(state, { type: "request", index: 1, count: 3, manual: false }), state);
  state = carouselReducer(state, { type: "request", index: 1, count: 3, manual: true });
  assert.equal(state.active, 1);
  assert.equal(state.paused, true);
});

test("rapid navigation ignores stale readiness and handles cached images and wrapping", () => {
  let state = carouselReducer(started(), { type: "request", index: 1, count: 3, manual: true });
  state = carouselReducer(state, { type: "request", index: 2, count: 3, manual: true });
  state = carouselReducer(state, { type: "ready", index: 1 });
  assert.equal(state.active, 0);
  assert.equal(state.pending, 2);
  state = carouselReducer(state, { type: "ready", index: 2 });
  assert.equal(state.active, 2);
  state = carouselReducer(state, { type: "request", index: 3, count: 3, manual: true });
  assert.equal(state.active, 0);
  assert.equal(state.pending, null);
  state = carouselReducer(state, { type: "request", index: -1, count: 3, manual: true });
  assert.equal(state.active, 2);
});

test("failed images keep the previous campaign and pause; another destination can recover", () => {
  let state = carouselReducer(started(), { type: "request", index: 1, count: 3, manual: false });
  state = carouselReducer(state, { type: "failed", index: 2 });
  assert.equal(state.error, false);
  state = carouselReducer(state, { type: "failed", index: 1 });
  assert.equal(state.active, 0);
  assert.equal(state.error, true);
  assert.equal(canRotate(state, visible), false);
  state = carouselReducer(state, { type: "request", index: 2, count: 3, manual: true });
  state = carouselReducer(state, { type: "ready", index: 2 });
  assert.equal(state.active, 2);
  assert.equal(state.error, false);
});

test("three campaigns select distinct stitched outfit images and share the requested copy", () => {
  assert.deepEqual(campaignSlides.map(slide => slide.id), ["everyday", "moments", "signature"]);
  assert.equal(new Set(campaignSlides.map(slide => slide.desktop.src)).size, 3);
  assert.equal(new Set(campaignSlides.map(slide => slide.mobile.src)).size, 3);
  assert.deepEqual(campaignSlides.map(slide => slide.desktop.src), ["/images/noor-384.webp", "/images/meher-384.webp", "/images/gulnaar-384.webp"]);
  for (const slide of campaignSlides) {
    assert.equal(slide.headline, "Your everyday. Beautifully dressed.");
    assert.equal(slide.eyebrow, campaignSlides[0].eyebrow);
    assert.equal(slide.supporting, campaignSlides[0].supporting);
    assert.equal(slide.cta, campaignSlides[0].cta);
    for (const source of [slide.mobile, slide.desktop]) {
      for (const path of [source.src, ...source.srcSet.split(",").map((entry) => entry.trim().split(/\s+/)[0])]) {
        assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), `Missing campaign asset: ${path}`);
      }
    }
    const url = new URL(collectionHref(), "https://batool.example");
    assert.equal(url.hash, "#collection");
    assert.equal(url.search, "");
    assert.equal(slide.category, "Stitched");
    assert.ok(selectProducts(products, "", "featured").length);
  }
});

test("each campaign receives its own configured desktop and mobile image without changing routes", () => {
  // Existing preview assets exercise configuration wiring; they are not replacement photographs.
  const images: CampaignImages = {
    everyday: {
      desktop: { src: "/images/campaign-stitched-576.webp", srcSet: "/images/campaign-stitched-576.webp 576w", width: 576, height: 384, position: "60% 40%" },
      mobile: campaignImages.moments.mobile,
    },
    moments: {
      desktop: { ...campaignImages.moments.desktop, position: "80% 60%" },
      mobile: campaignImages.everyday.mobile,
    },
    signature: {
      desktop: { ...campaignImages.signature.desktop, position: "75% 20%" },
      mobile: campaignImages.signature.mobile,
    },
  };
  const slides = createCampaignSlides(images);
  for (const [index, id] of (["everyday", "moments", "signature"] as const).entries()) {
    assert.equal(slides[index].desktop, images[id].desktop);
    assert.equal(slides[index].mobile, images[id].mobile);
    assert.equal(slides[index].category, campaignSlides[index].category);
    assert.equal(slides[index].id, campaignSlides[index].id);
  }
  assert.equal(campaignSlides[0].desktop, campaignImages.everyday.desktop);
});
