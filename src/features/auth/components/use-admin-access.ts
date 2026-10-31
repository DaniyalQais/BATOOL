"use client";
import { useEffect, useRef, useState } from "react";
import { createAccessController, type AccessState } from "../model/access.ts";
import { accessPort, adminClient } from "../model/browser-client.ts";

export function useAdminAccess() {
  const [state, setState] = useState<AccessState>({ status: "loading" });
  const controller = useRef<ReturnType<typeof createAccessController> | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let client;
    try { client = adminClient(); }
    catch { setState({ status: "error", message: "Authentication setup is unavailable. Configure the Supabase build variables and rebuild." }); return; }
    const access = createAccessController(accessPort(client), setState);
    controller.current = access;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const { data } = client.auth.onAuthStateChange((event, session) => {
      // The callback must stay synchronous: SDK calls here can deadlock its lock.
      if (event === "SIGNED_OUT") access.signedOut();
      else if (session) {
        const timer = setTimeout(() => { timers.delete(timer); void access.refresh(); }, 0);
        timers.add(timer);
      }
    });
    const focus = () => { if (document.visibilityState === "visible") void access.refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    void access.refresh();
    return () => {
      controller.current = null;
      access.stop();
      timers.forEach(clearTimeout);
      data.subscription.unsubscribe();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [attempt]);
  return {
    state,
    refresh: () => controller.current ? controller.current.refresh() : setAttempt(value => value + 1),
    signOut: () => controller.current?.signOut(),
  };
}
