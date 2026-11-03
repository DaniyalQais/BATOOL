"use client";
import { useEffect, useState } from "react";
import { LocalCheckout } from "./local-checkout";
import { availability, closedAvailability } from "../model/availability";
import { httpCheckoutTransport } from "../model/checkout-client";
import styles from "@/app/checkout/checkout.module.css";

export function ProductionCheckout({ endpoint, release, recovery }: { endpoint: string; release: boolean; recovery: boolean }) {
  const [ready, setReady] = useState(closedAvailability);
  const [feedback, setFeedback] = useState("Checking checkout availability.");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setReady(closedAvailability());
    if (release) {
      void httpCheckoutTransport(endpoint)({ action: "availability" }).then(value => {
        const result = availability(value);
        if (current) {
          setReady(result);
          setFeedback(result.enabled ? "" : "New orders are unavailable.");
        }
      }).catch(() => {
        if (current) {
          setReady(closedAvailability());
          setFeedback("Availability could not be confirmed. Your bag is preserved.");
        }
      });
    } else {
      setFeedback("New orders are unavailable.");
    }
    return () => { current = false; };
  }, [endpoint, release, attempt]);

  return (
    <>
      {feedback && <p role="status" className={styles.feedbackBanner}>{feedback}</p>}
      {release && (
        <div className={styles.refreshBar}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => setAttempt(n => n + 1)}
            title="Recheck current checkout availability"
          >
            ↻ Refresh availability
          </button>
        </div>
      )}
      <LocalCheckout endpoint={endpoint} production methods={ready.methods} intake={release && ready.enabled} recovery={recovery} />
    </>
  );
}
