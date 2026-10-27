"use client";
import Link from "next/link";
import { useEffect, useReducer, useRef, useState, type CSSProperties, type Dispatch } from "react";
import { collectionHref } from "@/features/catalog/model/catalog";
import type { CampaignSlide } from "../model/slides";
import { canRotate, carouselReducer, initialCarouselState, ROTATION_MS, type CarouselAction } from "../model/carousel";
import styles from "./campaign-hero.module.css";

function CampaignPicture({ slide, index, dispatch }: {
  slide: CampaignSlide; index: number; dispatch: Dispatch<CarouselAction>;
}) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = ref.current!;
    let cancelled = false;
    const ready = async () => {
      try { await image.decode(); } catch { /* A successfully loaded image can still be shown. */ }
      if (!cancelled && image.naturalWidth > 0) dispatch({ type: "ready", index });
    };
    const failed = () => dispatch({ type: "failed", index });
    image.addEventListener("load", ready);
    image.addEventListener("error", failed);
    // Cached/pre-hydration image loads may finish before listeners are attached.
    if (image.complete) { if (image.naturalWidth > 0) void ready(); else failed(); }
    return () => {
      cancelled = true;
      image.removeEventListener("load", ready);
      image.removeEventListener("error", failed);
    };
  }, [dispatch, index]);
  return (
    <picture>
      <source media="(max-width: 600px)" srcSet={slide.mobile.srcSet} sizes="100vw" />
      {/* These are the pipeline's optimized WebP variants; picture selects one art direction. */}
      <img ref={ref} src={slide.desktop.src} srcSet={slide.desktop.srcSet}
        sizes="100vw"
        width={slide.desktop.width} height={slide.desktop.height} alt={slide.alt}
        fetchPriority={index === 0 ? "high" : "auto"} loading="eager" decoding="async" />
    </picture>
  );
}

export function CampaignHero({ slides, className = "" }: { slides: readonly CampaignSlide[]; className?: string }) {
  const [state, dispatch] = useReducer(carouselReducer, initialCarouselState);
  const [pageVisible, setPageVisible] = useState(false);
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    dispatch({ type: "initialize", reducedMotion: preference.matches });
    const motionChanged = () => { if (preference.matches) dispatch({ type: "pause" }); };
    const visibilityChanged = () => setPageVisible(document.visibilityState === "visible");
    visibilityChanged();
    preference.addEventListener("change", motionChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.1),
      { threshold: [0, 0.1] },
    );
    if (root.current) observer?.observe(root.current);
    if (!observer) setInView(true);
    return () => {
      preference.removeEventListener("change", motionChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
      observer?.disconnect();
    };
  }, []);

  const rotating = canRotate(state, { pageVisible, inView });
  useEffect(() => {
    if (!rotating || slides.length < 2) return;
    const timer = window.setTimeout(() => dispatch({
      type: "request", index: state.active + 1, manual: false, count: slides.length,
    }), ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, state.active, slides.length]);

  function navigate(index: number) {
    dispatch({ type: "request", index, manual: true, count: slides.length });
  }

  return (
    <section
      className={`${styles.hero} ${className}`}
      ref={root}
      aria-label="BATOOL campaigns"
      aria-roledescription="carousel"
      onFocusCapture={(event) => {
        // Keyboard users can inspect controls safely; explicit Play always resumes.
        if (event.target.matches(":focus-visible")) dispatch({ type: "pause" });
      }}
    >
      <div
        className={styles.stage}
        onTouchStart={(event) => {
          touch.current = event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
        }}
        onTouchCancel={() => { touch.current = null; }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start || !event.changedTouches[0]) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
            navigate((state.pending ?? state.active) + (dx < 0 ? 1 : -1));
        }}
      >
        {slides.map((slide, index) => {
          const active = state.active === index;
          const requested = state.pending === index;
          const showImage = active || requested || state.loaded.includes(index);
          return (
            <article
              key={slide.id}
              className={styles.slide}
              data-active={active}
              aria-hidden={!active}
              inert={!active}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}: ${slide.headline}`}
            >
              <div className={styles.copy}>
                <p className={styles.eyebrow}>{slide.eyebrow}</p>
                <h1 className={styles.headline}>{slide.headline}</h1>
                <p className={styles.supporting}>{slide.supporting}</p>
                <Link className={`button ${styles.cta}`} href={collectionHref()} tabIndex={active ? 0 : -1}>
                  {slide.cta} <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <div className={styles.visual} style={{
                  "--desktop-position": slide.desktop.position,
                  "--mobile-position": slide.mobile.position,
                } as CSSProperties}>
                  {showImage && (
                    <CampaignPicture slide={slide} index={index} dispatch={dispatch} />
                  )}
              </div>
            </article>
          );
        })}
      </div>
      <div className={styles.controls}>
        <button type="button" aria-label="Previous campaign" onClick={() => navigate((state.pending ?? state.active) - 1)}>←</button>
        <div className={styles.selectors} role="group" aria-label="Choose a campaign">
          {slides.map((slide, index) => (
            <button key={slide.id} type="button" aria-label={`Show ${slide.headline}, slide ${index + 1} of ${slides.length}`}
              aria-pressed={state.active === index} onClick={() => navigate(index)}>
              <span aria-hidden="true">0{index + 1}</span>
            </button>
          ))}
        </div>
        <button type="button" aria-label="Next campaign" onClick={() => navigate((state.pending ?? state.active) + 1)}>→</button>
        <button type="button" className={styles.playback}
          aria-label={state.paused ? "Play campaign slideshow" : "Pause campaign slideshow"}
          onClick={() => dispatch({ type: state.paused ? "play" : "pause" })}>
          <span aria-hidden="true">{state.paused ? "▷" : "Ⅱ"}</span> {state.paused ? "Play" : "Pause"}
        </button>
      </div>
      <p className={styles.disclosure}>BATOOL preview · Sample campaign imagery</p>
      <p className={styles.status} role="status">
        {state.error ? "Campaign image unavailable. Please choose another campaign." : ""}
      </p>
      <span className="sr-only">Slides advance every seven seconds. Pause stops rotation and Play resumes it. Keyboard focus pauses rotation until Play is selected.</span>
    </section>
  );
}
