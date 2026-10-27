"use client";
import { useSyncExternalStore } from "react";
import { browserCartEnvironment, createCartStore } from "./cart-store.ts";

const store = createCartStore(browserCartEnvironment);
// Only actual consumers subscribe. No page-wide provider or client boundary.
export const useCartItems = () =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
export const useCartCount = () =>
  useSyncExternalStore(store.subscribe, store.getCount, store.getServerCount);
export const cartActions = store.actions;
