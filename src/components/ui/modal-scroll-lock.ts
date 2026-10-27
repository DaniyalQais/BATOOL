const locks = new WeakMap<Document, { count: number; restore: () => void }>();

/** Shared by native dialogs; the final release restores only the styles we own. */
export function lockPageScroll(page: Document, view: Window): () => void {
  let lock = locks.get(page);
  if (!lock) {
    const body = page.body.style;
    const root = page.documentElement.style;
    const x = view.scrollX;
    const y = view.scrollY;
    const gap = Math.max(0, view.innerWidth - page.documentElement.clientWidth);
    const padding = parseFloat(view.getComputedStyle(page.body).paddingRight) || 0;
    const owned = [
      [root, "overflow"], [body, "position"], [body, "top"], [body, "left"],
      [body, "width"], [body, "overflow"], [body, "padding-right"],
    ] as const;
    const previous = owned.map(([style, property]) => ({
      style, property, value: style.getPropertyValue(property), priority: style.getPropertyPriority(property),
    }));
    root.setProperty("overflow", "hidden");
    body.setProperty("position", "fixed");
    body.setProperty("top", `${-y}px`);
    body.setProperty("left", `${-x}px`);
    body.setProperty("width", "100%");
    body.setProperty("overflow", "hidden");
    if (gap) body.setProperty("padding-right", `${padding + gap}px`);
    lock = { count: 0, restore() {
      for (const { style, property, value, priority } of previous) {
        if (value) style.setProperty(property, value, priority);
        else style.removeProperty(property);
      }
      view.scrollTo({ left: x, top: y, behavior: "instant" });
    } };
    locks.set(page, lock);
  }
  const current = lock;
  current.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--current.count === 0) {
      locks.delete(page);
      current.restore();
    }
  };
}
