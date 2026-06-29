import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.EXPO_PUBLIC_SUPA_URL!;
const SUPA_KEY = process.env.EXPO_PUBLIC_SUPA_KEY!;

// Suppress the non-critical api.supabase.com metadata fetch that fails on Vercel
const safeFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : (input as Request).url;
  if (url.includes("api.supabase.com")) return Promise.resolve(new Response("{}", { status: 200 }));
  return fetch(input, init);
};

export const supabase = createClient(SUPA_URL, SUPA_KEY, {
  global: { fetch: safeFetch },
  realtime: { params: { eventsPerSecond: 10 } },
  auth: { persistSession: true, autoRefreshToken: true },
});
