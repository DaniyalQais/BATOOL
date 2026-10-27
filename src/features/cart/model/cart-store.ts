import {
  addLine,
  changeQuantity,
  cartCount,
  parseCart,
  type CartLine,
} from "./cart.ts";
import type { Size } from "../../catalog/model/types.ts";

const KEY = "batool-bag";
const EMPTY: readonly CartLine[] = [];
interface CartEnvironment {
  read(): string | null;
  write(value: string): void;
  listen(notify: (event: { key: string | null }) => void): () => void;
}

// React and the Node tests use this same store; browser access stays lazy for SSR.
export function createCartStore(environment: CartEnvironment) {
  let snapshot = EMPTY;
  let memoryOnly = false;
  let stopListening: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((notify) => notify());
  function restore() {
    if (memoryOnly) return;
    try {
      const next = parseCart(environment.read());
      if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
        snapshot = next;
        emit();
      }
    } catch {
      // Reads may be unavailable; mutations can still use the current snapshot.
    }
  }
  function commit(next: readonly CartLine[]) {
    if (next === snapshot) return;
    snapshot = next;
    if (!memoryOnly) {
      try {
        environment.write(JSON.stringify(next));
      } catch {
        // Never restore stale storage over unsaved changes during this session.
        // No retries: these changes cannot survive a full page reload.
        memoryOnly = true;
      }
    }
    emit();
  }
  return {
    subscribe(notify: () => void) {
      listeners.add(notify);
      if (listeners.size === 1) {
        restore();
        stopListening = environment.listen((event) => {
          if (event.key === KEY || event.key === null) restore();
        });
      }
      return () => {
        listeners.delete(notify);
        if (!listeners.size) {
          stopListening?.();
          stopListening = undefined;
        }
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY,
    getCount: () => cartCount(snapshot),
    getServerCount: () => 0,
    actions: {
      add(id: number, size: Size) {
        restore();
        const next = addLine(snapshot, id, size);
        if (next === snapshot) return false;
        commit(next);
        return true;
      },
      change(id: number, size: Size, delta: number) {
        commit(changeQuantity(snapshot, id, size, delta));
      },
      remove(id: number, size: Size) {
        commit(snapshot.filter((x) => x.id !== id || x.size !== size));
      },
    },
  };
}

export const browserCartEnvironment: CartEnvironment = {
  read: () => localStorage.getItem(KEY),
  write: (value) => localStorage.setItem(KEY, value),
  listen(notify) {
    window.addEventListener("storage", notify);
    return () => window.removeEventListener("storage", notify);
  },
};
