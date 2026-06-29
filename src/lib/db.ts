import { supabase } from "./supabase";

const SUPA_URL = process.env.EXPO_PUBLIC_SUPA_URL!;
const SUPA_KEY = process.env.EXPO_PUBLIC_SUPA_KEY!;

// owner_id of the signed-in tenant, set after login/session restore so every
// insert can be tagged automatically — required for the RLS WITH CHECK clauses
// added in supabase/migrations/0001_multi_tenant.sql to pass.
let currentOwnerId: string | null = null;
export function setCurrentOwnerId(id: string | null) {
  currentOwnerId = id;
}

const UNSCOPED_TABLES = new Set(["profiles", "subscriptions"]);

export async function db(
  table: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body: Record<string, unknown> | null = null,
  id: string | number | null = null
): Promise<Record<string, unknown>[] | null> {
  let url = `${SUPA_URL}/rest/v1/${table}`;

  if (method === "GET") {
    url += id ? `?${id}&select=*` : "?order=id&select=*";
  } else if (id !== null) {
    url += `?id=eq.${id}`;
  }

  if (method === "POST" && body && !("owner_id" in body) && currentOwnerId && !UNSCOPED_TABLES.has(table)) {
    body = { ...body, owner_id: currentOwnerId };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPA_KEY;

  const headers: Record<string, string> = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
  };

  if (method === "POST" || method === "PATCH") {
    headers.Prefer = "return=representation";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Supabase error:", method, table, id, err);
    return null;
  }

  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const today = () => new Date().toISOString().slice(0, 10);
export const formatDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("ar-SA") : "-";
export const nightsBetween = (from?: string, to?: string) =>
  !from || !to ? 0 : Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
