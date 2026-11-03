"use client";
import { useState } from "react";
import { httpCheckoutTransport } from "../model/checkout-client";
import { object, uuid } from "../model/contracts";
import styles from "@/app/checkout/checkout.module.css";

const storageKey = "batool-checkout-support-v1";

export function SupportRecovery({ endpoint, accept }: { endpoint: string; accept: (value: unknown) => void }) {
  const [reference, setReference] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(check: boolean, fresh = false) {
    if (busy) return;
    setBusy(true);
    setFeedback("");
    try {
      let saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if ((!saved || fresh) && !check) {
        const proof = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
        saved = { case_id: crypto.randomUUID(), proof };
        sessionStorage.setItem(storageKey, JSON.stringify(saved)); // Save BEFORE request; reuse on lost response.
      }
      if (!object(saved) || typeof saved.case_id !== "string" || !uuid.test(saved.case_id)
        || typeof saved.proof !== "string" || !/^[0-9a-f]{64}$/.test(saved.proof)) throw new Error("No usable support case in this tab. Keep existing references and contact support.");
      const reply = await httpCheckoutTransport(endpoint)({ action: check ? "support_result" : "support_open", case_id: saved.case_id, proof: saved.proof });
      setReference(saved.case_id);
      if (!object(reply)) throw new Error("Recovery unconfirmed. Keep this tab and retry the same case.");
      if (reply.state === "committed" || reply.state === "retired") {
        accept(reply);
        setFeedback("Recovery confirmed. Review the saved order or replacement quote above. Your bag is preserved unless the original purchase is confirmed.");
      } else {
        setFeedback(reply.state === "escalated"
          ? "Replacement is blocked. Support must reconcile the original purchase; do not place another order."
          : "Support must independently verify your request and resolve the original attempt. Keep this tab and check this same case again.");
      }
    } catch (error) {
      setFeedback(error instanceof TypeError
        ? "Recovery response was lost. Your bag and case are preserved. Retry this same case."
        : error instanceof Error ? error.message : "Recovery unavailable. Your bag is preserved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Checkout support recovery" className={styles.supportCard}>
      <h2 className={styles.supportTitle}>Recover a checkout with support</h2>
      <p className={styles.supportDesc}>
        Keep your bag and saved checkout. Use the contact page to arrange independent verification. Share only the case reference and original order or checkout reference; never share browser credentials, passwords, PINs or OTPs.
      </p>
      <p className={styles.supportDesc}>
        The case proof stays in this tab and is valid for 24 hours. If this tab or proof is lost, contact support before opening a replacement purchase.
      </p>
      <div className={styles.supportActions}>
        <button type="button" className={styles.supportBtn} disabled={busy} onClick={() => void request(false)}>
          Open or retry support case
        </button>
        <button type="button" className={styles.supportBtn} disabled={busy} onClick={() => void request(true)}>
          Check this support case
        </button>
      </div>
      <p className={styles.supportDesc} style={{ marginTop: "16px" }}>
        If this support case expires, a new case requires fresh independent verification. It does not close or replace your original checkout.
      </p>
      <div className={styles.supportActions}>
        <button type="button" className={styles.supportBtn} disabled={busy} onClick={() => void request(false, true)}>
          Open a new verification case
        </button>
      </div>
      {reference && (
        <p className={styles.supportStatusText}>
          Support case reference: <strong>{reference}</strong>
        </p>
      )}
      {feedback && <p role="status" className={styles.supportStatusText}>{feedback}</p>}
    </section>
  );
}
