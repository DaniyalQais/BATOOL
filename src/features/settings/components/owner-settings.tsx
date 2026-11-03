"use client";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { adminClient, accessPort } from "@/features/auth/model/browser-client";
import { ownerSettings } from "../model/owner-settings";
import { businessSettings, notificationSettings, settingsFailure, type BusinessSettings, type SettingsRecord } from "../model/settings";
import { parseShippingFeePKR, shippingFeePKR, type ShippingConfiguration } from "../model/shipping";
import styles from "./owner-settings.module.css";

type Resource<T> = { load(): Promise<SettingsRecord<T>>; save(record: SettingsRecord<T>, draft: T): Promise<SettingsRecord<T>> };
function useSettings<T>(resource: Resource<T>, validate: (value: unknown) => T) {
  const [record, setRecord] = useState<SettingsRecord<T> | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [blocked, setBlocked] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  async function load() {
    if (pending.current) return;
    pending.current = true;
    const token = ++generation.current;
    setBusy(true); setNotice(""); setBlocked(true);
    try {
      const loaded = await resource.load();
      if (token !== generation.current) return;
      setRecord(loaded); setDraft(loaded.settings); setBlocked(false);
    } catch {
      if (token === generation.current) setNotice("Unable to load current settings. Check Owner access and the settings migration, then reload. No default values were substituted.");
    } finally {
      if (token === generation.current) { pending.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    void load();
    return () => { generation.current++; pending.current = false; };
  }, [resource]); // Each authenticated Owner mount gets fresh database records.
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record || !draft || blocked || pending.current) return;
    let checked: T;
    try { checked = validate(draft); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Check the settings fields."); return; }
    const token = generation.current;
    pending.current = true; setBusy(true); setNotice("");
    try {
      const saved = await resource.save(record, checked);
      if (token !== generation.current) return;
      setRecord(saved); setDraft(saved.settings);
      setNotice("Saved to the database. Public settings require rebuilding and publishing. No checkout, payment verification, or notifications were enabled by this save.");
    } catch (error) {
      if (token !== generation.current) return;
      const failure = settingsFailure(error); setNotice(failure.message); setBlocked(failure.reload);
    } finally {
      if (token === generation.current) { pending.current = false; setBusy(false); }
    }
  }
  return { record, draft, setDraft, busy, notice, blocked, load, save };
}

function BusinessForm({ resource }: { resource: Resource<BusinessSettings> }) {
  const state = useSettings(resource, businessSettings);
  const fieldId = useId();
  const [shippingFee, setShippingFee] = useState("");
  useEffect(() => {
    const shipping = state.record?.settings.shipping;
    setShippingFee(shipping?.mode === "flat_rate" && shipping.fee_minor !== null ? shippingFeePKR(shipping.fee_minor) : "");
  }, [state.record]);
  const d = state.draft;
  function update(update: Partial<BusinessSettings>) { state.setDraft(previous => previous ? { ...previous, ...update } : null); }
  const blank = (value: string) => value.trim() || null;
  return <form className={styles.form} onSubmit={event => { void state.save(event); }} aria-busy={state.busy}>
    <h3>Business settings</h3>
    <p>PKR · Ready stock · Delivery across Pakistan</p>
    <p>Public contacts and approved text appear on the storefront after rebuilding and publishing. Draft text is never public.</p>
    <button type="button" disabled={state.busy} onClick={() => { void state.load(); }}>Reload business settings (discards edits)</button>
    {d && <fieldset disabled={state.busy} className={styles.fields}>
      <legend>Public contact details</legend>
      <label>Public WhatsApp number (92 followed by 10 digits)
        <input type="tel" autoComplete="off" maxLength={12} value={d.public_whatsapp ?? ""} onChange={e => update({ public_whatsapp: blank(e.target.value) })} /></label>
      <label>Public support email
        <input type="email" autoComplete="off" maxLength={254} value={d.support_email ?? ""} onChange={e => update({ support_email: blank(e.target.value) })} /></label>
      <p>Blank contacts are omitted from public pages.</p>
      <fieldset className={styles.fields}>
        <legend>Pakistan-wide shipping</legend>
        <label htmlFor={`${fieldId}-shipping-mode`}>Shipping mode</label>
        <select id={`${fieldId}-shipping-mode`} value={d.shipping.mode} onChange={e => {
          const mode = e.target.value as ShippingConfiguration["mode"];
          setShippingFee("");
          update({ shipping: { country_code: "PK", currency: "PKR", mode, fee_minor: mode === "free" ? 0 : null } });
        }}>
          <option value="unconfigured">Unconfigured — no shipping fee set</option>
          <option value="free">Free delivery — PKR 0</option>
          <option value="flat_rate">Flat-rate delivery</option>
        </select>
        {d.shipping.mode === "flat_rate" && <>
          <label htmlFor={`${fieldId}-shipping-fee`}>Flat shipping fee (PKR)</label>
          <input id={`${fieldId}-shipping-fee`} type="text" inputMode="decimal" autoComplete="off" maxLength={20} value={shippingFee} onChange={e => {
            setShippingFee(e.target.value);
            let fee_minor: number | null = null;
            try { fee_minor = parseShippingFeePKR(e.target.value); } catch { /* Invalid/blank input must not become free delivery. */ }
            update({ shipping: { ...d.shipping, fee_minor } });
          }} />
          <p>Nonnegative PKR fee, up to two decimal places; maximum PKR 21474836.47. Enter 0 explicitly for a zero flat rate.</p>
        </>}
        <p>Shipping stays unconfigured until you choose and save a mode. Public shipping text requires rebuilding and publishing. This save cannot enable checkout.</p>
      </fieldset>
      <label className={styles.check}><input type="checkbox" checked={d.cod_enabled} onChange={e => update({ cod_enabled: e.target.checked })} />COD enabled in configuration</label>
      {(["easypaisa", "jazzcash"] as const).map(provider => <fieldset className={styles.fields} key={provider}>
        <legend>{provider === "easypaisa" ? "Easypaisa" : "JazzCash"}</legend>
        <label className={styles.check}><input type="checkbox" checked={d[`${provider}_enabled`]} onChange={e => update({ [`${provider}_enabled`]: e.target.checked })} />Enabled in configuration</label>
        <label>Account title<input autoComplete="off" maxLength={120} value={d[`${provider}_account_title`] ?? ""} onChange={e => update({ [`${provider}_account_title`]: e.target.value || null })} /></label>
        <label>Account number (7–24 digits)<input type="text" inputMode="numeric" autoComplete="off" maxLength={24} value={d[`${provider}_account_number`] ?? ""} onChange={e => update({ [`${provider}_account_number`]: e.target.value || null })} /></label>
      </fieldset>)}
      <p>All shopper payment methods remain unavailable while backend order and payment handling are pending. Enabled wallet configuration requires a title and number. Saving these details does not verify payments automatically. Enter account details only; never enter PINs, OTPs, passwords, or wallet login credentials.</p>
      {(["payment_instructions", "policy_text"] as const).map(field => {
        const approval = field === "policy_text" ? "policy_state" : "payment_instructions_state";
        return <fieldset className={styles.fields} key={field}>
          <legend>{field === "policy_text" ? "Policy text" : "Payment instructions"}</legend>
          <label htmlFor={`${fieldId}-${field}`}>Text</label>
          <textarea id={`${fieldId}-${field}`} rows={6} maxLength={8000} value={d[field]} onChange={e => update({ [field]: e.target.value, [approval]: "draft" })} />
          <label htmlFor={`${fieldId}-${approval}`}>Publication state</label>
          <select id={`${fieldId}-${approval}`} value={d[approval]} onChange={e => update({ [approval]: e.target.value as "draft" | "approved" })}>
            <option value="draft">Draft — private</option><option value="approved">Approved — public after rebuild/publish</option>
          </select>
          <p>Editing text returns it to draft. Approve only confirmed wording; no delivery times or exchange/refund terms have been supplied.</p>
        </fieldset>;
      })}
      <button type="submit" disabled={state.blocked}>Save business settings{state.record ? ` (revision ${state.record.revision})` : ""}</button>
    </fieldset>}
    {state.busy && <p role="status">Loading or saving business settings…</p>}
    {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
  </form>;
}

function NotificationsForm({ resource }: { resource: ReturnType<typeof ownerSettings>["notifications"] }) {
  const state = useSettings(resource, notificationSettings);
  const fieldId = useId();
  const [emails, setEmails] = useState("");
  const [phones, setPhones] = useState("");
  useEffect(() => {
    if (state.record) { setEmails(state.record.settings.emails.join("\n")); setPhones(state.record.settings.whatsapp_numbers.join("\n")); }
  }, [state.record]);
  const split = (value: string) => value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
  return <form className={styles.form} onSubmit={event => { void state.save(event); }} aria-busy={state.busy}>
    <h3>Private order-notification recipients</h3>
    <p>Owner only. These recipients are stored separately and never exported to the storefront. This form does not send messages. Up to 10 per channel; one per line or separated by commas.</p>
    <button type="button" disabled={state.busy} onClick={() => { void state.load(); }}>Reload private recipients (discards edits)</button>
    {state.draft && <fieldset disabled={state.busy} className={styles.fields}>
      <legend>Private recipients</legend>
      <label htmlFor={`${fieldId}-emails`}>Email recipients</label>
      <textarea id={`${fieldId}-emails`} autoComplete="off" rows={3} value={emails} onChange={e => { setEmails(e.target.value); state.setDraft(previous => previous ? { ...previous, emails: split(e.target.value) } : null); }} />
      <label htmlFor={`${fieldId}-phones`}>WhatsApp recipients (92 followed by 10 digits)</label>
      <textarea id={`${fieldId}-phones`} autoComplete="off" rows={3} value={phones} onChange={e => { setPhones(e.target.value); state.setDraft(previous => previous ? { ...previous, whatsapp_numbers: split(e.target.value) } : null); }} />
      <button type="submit" disabled={state.blocked}>Save private recipients{state.record ? ` (revision ${state.record.revision})` : ""}</button>
    </fieldset>}
    {state.busy && <p role="status">Loading or saving private recipients…</p>}
    {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
  </form>;
}

export function OwnerSettings() {
  const resources = useMemo(() => { const client = adminClient(); return ownerSettings(client, accessPort(client)); }, []);
  return <section className={styles.section} aria-labelledby="owner-settings-title">
    <h2 id="owner-settings-title">Owner business settings</h2>
    <BusinessForm resource={resources.business} />
    <NotificationsForm resource={resources.notifications} />
  </section>;
}
