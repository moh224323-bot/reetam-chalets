import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KAPSO_API_KEY = Deno.env.get("KAPSO_API_KEY");
const KAPSO_PHONE_NUMBER_ID = Deno.env.get("KAPSO_PHONE_NUMBER_ID");
const KAPSO_META_BASE_URL = Deno.env.get("KAPSO_API_BASE_URL")
  ? `${Deno.env.get("KAPSO_API_BASE_URL")}/meta/whatsapp`
  : "https://api.kapso.ai/meta/whatsapp";
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v24.0";
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normPhone(p?: string | null): string | null {
  if (!p) return null;
  let d = p.replace(/[^0-9]/g, "");
  if (d.startsWith("0")) d = "966" + d.slice(1);
  if (d.length === 9 && d.startsWith("5")) d = "966" + d;
  return d.length >= 10 ? d : null;
}

// وقت الرياض (UTC+3، بدون توقيت صيفي)
function riyadhNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 3 * 60 * 60 * 1000);
}
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function sendTemplate(booking: Record<string, unknown>, dayLabel: string): Promise<void> {
  const phone = normPhone(booking.phone as string);
  if (!phone) throw new Error("لا يوجد رقم جوال صالح");
  const url = `${KAPSO_META_BASE_URL}/${META_GRAPH_VERSION}/${KAPSO_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: "pre_arrival_reminder",
      language: { code: "ar" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "guest_name", text: String(booking.guest || "") },
            { type: "text", parameter_name: "chalet_name", text: String(booking.chalet || "") },
            { type: "text", parameter_name: "day_label", text: dayLabel },
            { type: "text", parameter_name: "checkin_time", text: String(booking.checkin_time || "-") },
            { type: "text", parameter_name: "checkout_time", text: String(booking.checkout_time || "-") },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: String(booking.id) }],
        },
      ],
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "X-API-Key": KAPSO_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Kapso ${res.status}: ${errText}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (CRON_SECRET) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== CRON_SECRET) return json({ error: "غير مصرح" }, 401);
  }

  if (!KAPSO_API_KEY || !KAPSO_PHONE_NUMBER_ID) {
    return json({ error: "KAPSO_API_KEY أو KAPSO_PHONE_NUMBER_ID غير مضبوطين بعد" }, 500);
  }

  const admin = createClient(SUPA_URL, SERVICE_ROLE_KEY);
  const now = riyadhNow();
  const today = dateStr(now);
  const tomorrow = dateStr(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const sent: number[] = [];
  const failed: { id: number; error: string }[] = [];

  try {
    // ── رسالة قبل الوصول بيوم ──
    const { data: dayBefore } = await admin
      .from("bookings")
      .select("*")
      .eq("status", "confirmed")
      .eq("date_from", tomorrow)
      .eq("pre_arrival_sent", false);

    for (const b of dayBefore || []) {
      try {
        await sendTemplate(b, "غداً");
        await admin.from("bookings").update({ pre_arrival_sent: true }).eq("id", b.id);
        sent.push(b.id);
      } catch (e) {
        failed.push({ id: b.id, error: String(e) });
      }
    }

    // ── رسالة قبل الوصول بساعة ──
    const { data: candidates } = await admin
      .from("bookings")
      .select("*")
      .eq("status", "confirmed")
      .eq("date_from", today)
      .eq("pre_arrival_hour_sent", false)
      .not("checkin_time", "is", null);

    for (const b of candidates || []) {
      const [h, m] = String(b.checkin_time).split(":").map(Number);
      if (isNaN(h)) continue;
      const checkinAt = new Date(now);
      checkinAt.setHours(h, m || 0, 0, 0);
      const diffMin = (checkinAt.getTime() - now.getTime()) / 60000;
      if (diffMin <= 0 || diffMin > 60) continue;
      try {
        await sendTemplate(b, "اليوم");
        await admin.from("bookings").update({ pre_arrival_hour_sent: true }).eq("id", b.id);
        sent.push(b.id);
      } catch (e) {
        failed.push({ id: b.id, error: String(e) });
      }
    }

    return json({ sent, failed, checked_at: now.toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
