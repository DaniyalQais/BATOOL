"use client";
import { useEffect, useState } from "react";
import { LocalCheckout } from "./local-checkout";
import { availability, closedAvailability } from "../model/availability";
import { httpCheckoutTransport } from "../model/checkout-client";
export function ProductionCheckout({ endpoint, release, recovery }: { endpoint: string; release: boolean; recovery: boolean }) {
  const [ready, setReady] = useState(closedAvailability);
  const [feedback, setFeedback] = useState("Checking checkout availability.");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true; setReady(closedAvailability());
    if (release) void httpCheckoutTransport(endpoint)({ action: "availability" }).then(value => {
      const result = availability(value); if (current) { setReady(result); setFeedback(result.enabled ? "" : "New orders are unavailable."); }
    }).catch(() => { if (current) { setReady(closedAvailability()); setFeedback("Availability could not be confirmed. Your bag is preserved."); } });
    else setFeedback("New orders are unavailable.");
    return () => { current = false; };
  }, [endpoint, release, attempt]);
  return <>{feedback && <p role="status">{feedback}</p>}
    {release && <button onClick={() => setAttempt(n => n + 1)}>Refresh availability</button>}
    <LocalCheckout endpoint={endpoint} production methods={ready.methods} intake={release && ready.enabled} recovery={recovery} />
  </>;
}
