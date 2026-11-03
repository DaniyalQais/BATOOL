"use client";
import { useState } from "react";
import { adminClient } from "../../auth/model/browser-client";
import { object, uuid } from "../model/contracts";
type Case = { case_id: string; revision: number; state: string; expires_at: string; audit: { event: string; recorded_at: string }[] };
function recoveryCase(value: unknown): Case {
  if (!object(value) || typeof value.case_id !== "string" || !uuid.test(value.case_id)
    || !Number.isInteger(value.revision) || typeof value.state !== "string" || typeof value.expires_at !== "string" || !Array.isArray(value.audit)
    || value.audit.some(a => !object(a) || typeof a.event !== "string" || typeof a.recorded_at !== "string")) throw new Error("Recovery case unavailable.");
  return value as Case;
}
export function OwnerRecovery() {
  const [id, setId] = useState(""); const [quote, setQuote] = useState(""); const [order, setOrder] = useState("");
  const [evidence, setEvidence] = useState(""); const [verified, setVerified] = useState(false);
  const [saved, setSaved] = useState<Case | null>(null); const [feedback, setFeedback] = useState(""); const [busy, setBusy] = useState(false);
  async function run(action: "load" | "verify" | "escalate" | "resolve") {
    if (busy) return; setBusy(true); setFeedback("");
    try {
      if (!uuid.test(id) || (action !== "load" && saved?.case_id !== id)) throw new Error("Load the current case first.");
      const client = adminClient();
      const response = action === "load" ? await client.rpc("owner_recovery_case", { p_case: id })
        : action === "resolve" ? await client.rpc("owner_resolve_recovery", { p_case: id, p_revision: saved!.revision })
        : await client.rpc("owner_verify_recovery", { p_case: id, p_revision: saved!.revision, p_decision: action,
          p_quote: quote || null, p_order: order || null, p_evidence: evidence || null, p_independently_verified: verified });
      if (response.error) throw new Error("Action denied or unconfirmed. Check your live Owner session, approved verification setup and current revision; reload the same case before retrying.");
      setSaved(recoveryCase(response.data));
      setFeedback(action === "resolve" ? "Resolution saved. The requester must check this same support case in their original tab. No payment or stock status was changed by this action." : "Current case loaded. Replacement requires verified identity and committed resolution.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Recovery unavailable."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Owner operational recovery">
    <h2>Checkout recovery</h2>
    <p>Use only the approved independent requester-verification procedure. A case, order or checkout reference alone is not identity proof. Never enter customer details, tokens, PINs, OTPs or passwords here.</p>
    <label>Support case reference<input value={id} onChange={e => { setId(e.target.value.trim()); setSaved(null); setVerified(false); setEvidence(""); setQuote(""); setOrder(""); }} /></label>
    <button disabled={busy} onClick={() => void run("load")}>Load current case / retry lost response</button>
    {saved && <>
      <p>State: {saved.state} · Revision: {saved.revision} · Claim expires: {saved.expires_at}</p>
      {saved.state === "open" && <>
        <label>Original checkout reference (registered intent)<input value={quote} onChange={e => setQuote(e.target.value.trim())} /></label>
        <label>Or existing committed order reference<input value={order} onChange={e => setOrder(e.target.value.trim())} /></label>
        <label>Private verification evidence reference (UUID, no personal data)<input value={evidence} onChange={e => setEvidence(e.target.value.trim())} /></label>
        <label><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> I independently verified the requester under the approved procedure and linked the exact original purchase.</label>
        <button disabled={busy || !verified || !uuid.test(evidence) || (!!quote === !!order) || (!!quote && !uuid.test(quote)) || (!!order && !uuid.test(order))} onClick={() => void run("verify")}>Record verification</button>
        <button disabled={busy} onClick={() => void run("escalate")}>Identity unavailable — block and escalate</button>
      </>}
      {saved.state === "verified" && <button disabled={busy} onClick={() => void run("resolve")}>Resolve original attempt atomically</button>}
      {saved.state === "escalated" && <p>Replacement blocked. Reconcile through approved support; do not create a new purchase as a workaround.</p>}
      <ul>{saved.audit.map((event, index) => <li key={index}>{event.event} · {event.recorded_at}</li>)}</ul>
    </>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
