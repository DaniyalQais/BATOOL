"use client";

/**
 * Creates an elegant fly-to-cart animation from the source product image
 * to the cart icon in the header.
 */
export function flyToCart(
  sourceEl: HTMLElement | null,
  imageSlug?: string | null,
  onComplete?: () => void
) {
  if (typeof window === "undefined") {
    onComplete?.();
    return;
  }

  // Check if user prefers reduced motion
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.dispatchEvent(new CustomEvent("batool:cart-bounce"));
    onComplete?.();
    return;
  }

  // Find the closest img inside sourceEl or use sourceEl if it is an img
  const imgEl = sourceEl
    ? ((sourceEl instanceof HTMLImageElement ? sourceEl : sourceEl.querySelector("img")) as HTMLImageElement | null)
    : imageSlug === null ? null : (document.querySelector(imageSlug ? `img[src*="${imageSlug}"]` : "main img") as HTMLImageElement | null);

  const imageSrc =
    imgEl?.currentSrc ||
    imgEl?.src ||
    (imageSlug ? `/images/${imageSlug}-384.webp` : undefined);

  if (!imageSrc) {
    window.dispatchEvent(new CustomEvent("batool:cart-bounce"));
    onComplete?.();
    return;
  }

  const rawRect = imgEl?.getBoundingClientRect();
  const sourceRect = sourceEl?.getBoundingClientRect();
  const startRect =
    rawRect && rawRect.width > 0 && rawRect.height > 0
      ? rawRect
      : sourceRect && sourceRect.width > 0 && sourceRect.height > 0
      ? sourceRect
      : {
          top: window.innerHeight / 2 - 120,
          left: window.innerWidth / 2 - 90,
          width: 180,
          height: 240,
        };

  // Find target cart trigger button in the top-right
  const cartTarget =
    document.getElementById("cart-trigger-btn") ||
    document.querySelector("[data-cart-target]") ||
    document.querySelector('button[aria-label^="Open shopping bag"]');

  if (!cartTarget) {
    onComplete?.();
    return;
  }

  const targetRect = cartTarget.getBoundingClientRect();

  // Create flyer element
  const flyer = document.createElement("div");
  flyer.setAttribute("aria-hidden", "true");
  flyer.className = "batool-flying-product";

  const startX = startRect.left;
  const startY = startRect.top;
  const startW = Math.max(startRect.width, 100);
  const startH = Math.max(startRect.height, 120);

  const targetX = targetRect.left + targetRect.width / 2 - 16;
  const targetY = targetRect.top + targetRect.height / 2 - 16;

  // Parabolic control point: arc upwards slightly towards top-right
  const midX = startX + (targetX - startX) * 0.45;
  const midY = Math.max(14, Math.min(startY, targetY) - 45);

  Object.assign(flyer.style, {
    position: "fixed",
    zIndex: "99999",
    top: `${startY}px`,
    left: `${startX}px`,
    width: `${startW}px`,
    height: `${startH}px`,
    backgroundImage: `url("${imageSrc}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderRadius: "2px",
    boxShadow: "0 16px 36px rgba(48, 37, 41, 0.28)",
    pointerEvents: "none",
    transformOrigin: "center center",
    willChange: "transform, opacity, top, left, width, height",
  });

  document.body.appendChild(flyer);

  // Web Animations API for 60fps/120fps hardware-accelerated parabolic arc
  const keyframes = [
    {
      top: `${startY}px`,
      left: `${startX}px`,
      width: `${startW}px`,
      height: `${startH}px`,
      opacity: 1,
      transform: "scale(1) rotate(0deg)",
      borderRadius: "2px",
    },
    {
      top: `${midY}px`,
      left: `${midX}px`,
      width: `${startW * 0.55}px`,
      height: `${startH * 0.55}px`,
      opacity: 0.9,
      transform: "scale(0.85) rotate(-4deg)",
      borderRadius: "8px",
      offset: 0.4,
    },
    {
      top: `${targetY}px`,
      left: `${targetX}px`,
      width: "32px",
      height: "32px",
      opacity: 0.1,
      transform: "scale(0.25) rotate(12deg)",
      borderRadius: "50%",
      offset: 1,
    },
  ];

  const animation = flyer.animate(keyframes, {
    duration: 680,
    easing: "cubic-bezier(0.2, 0.8, 0.25, 1)",
    fill: "forwards",
  });

  const cleanup = () => {
    flyer.remove();
    // Dispatch cart bounce event when the product reaches the cart icon
    window.dispatchEvent(new CustomEvent("batool:cart-bounce"));
    onComplete?.();
  };

  animation.onfinish = cleanup;
  // Fallback timer in case animation is cancelled
  setTimeout(() => {
    if (document.body.contains(flyer)) cleanup();
  }, 750);
}
