"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../catalog/model/database.types.ts";
import { assignedRole, type AccessPort } from "../../auth/model/access.ts";
import { businessSettings, notificationSettings, settingsRecord, type SettingsRecord } from "./settings.ts";

export function ownerSettings(client: SupabaseClient<Database>, access: AccessPort) {
  async function verify(subject?: string) {
    const identity = await access.identity();
    if (!identity || identity.expiresAt <= Date.now() || (subject && identity.id !== subject) ||
        assignedRole(await access.role(identity.id), identity.id) !== "owner") throw Object.assign(new Error("Owner access required."), { code: "42501" });
    return identity.id;
  }
  function resource<T>(table: "business_settings" | "order_notification_settings", rpc: "owner_save_business_settings" | "owner_save_notification_settings", parse: (value: unknown) => T) {
    return {
      async load(): Promise<SettingsRecord<T>> {
        const subject = await verify();
        const { data, error } = await client.from(table).select("revision,settings").eq("id", true).abortSignal(AbortSignal.timeout(20_000)).single();
        if (error) throw error;
        await verify(subject);
        return settingsRecord(data, parse);
      },
      async save(record: SettingsRecord<T>, draft: T): Promise<SettingsRecord<T>> {
        const checked = settingsRecord({ revision: record.revision, settings: draft }, parse);
        const subject = await verify();
        const { data, error } = await client.rpc(rpc, { p_expected_revision: checked.revision, p_settings: checked.settings as Json });
        if (error) throw error;
        await verify(subject);
        const saved = settingsRecord(data, parse);
        if (saved.revision !== checked.revision + 1) throw new Error("Unconfirmed settings save.");
        return saved;
      },
    };
  }
  return {
    business: resource("business_settings", "owner_save_business_settings", businessSettings),
    notifications: resource("order_notification_settings", "owner_save_notification_settings", notificationSettings),
  };
}
