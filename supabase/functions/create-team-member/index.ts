import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = ["admin", "staff", "chalet_manager"];
const ADMIN_ROLES = ["platform_admin", "owner", "admin"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "طريقة غير مدعومة" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "غير مصرح" }, 401);

    const admin = createClient(SUPA_URL, SERVICE_ROLE_KEY);

    const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller) return json({ error: "جلسة غير صالحة، سجّل الدخول من جديد" }, 401);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("owner_id, role")
      .eq("id", caller.id)
      .single();

    if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role)) {
      return json({ error: "صلاحياتك لا تسمح بإدارة المستخدمين" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { userId, email, password, name, username, role, chalet } = body || {};

    if (!name || !role) return json({ error: "بيانات ناقصة" }, 400);
    if (!ALLOWED_ROLES.includes(role)) return json({ error: "دور غير صالح" }, 400);
    if (password && String(password).length < 6) {
      return json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, 400);
    }

    // ── تعديل مستخدم موجود ──
    if (userId) {
      if (password) {
        const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
        if (pwErr) return json({ error: pwErr.message }, 400);
      }
      const { error: updErr } = await admin
        .from("profiles")
        .update({ name, username: username || null, role, chalet: chalet || null })
        .eq("id", userId);
      if (updErr) return json({ error: updErr.message }, 400);
      return json({ success: true, id: userId });
    }

    // ── إنشاء مستخدم جديد ──
    if (!email || !password) return json({ error: "الإيميل وكلمة المرور مطلوبان لحساب جديد" }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message || "تعذر إنشاء الحساب" }, 400);
    }

    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      owner_id: callerProfile.owner_id,
      role,
      name,
      username: username || null,
      email,
      chalet: chalet || null,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: profileErr.message }, 400);
    }

    return json({ success: true, id: created.user.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
