// خانة "صفحة الهبوط" في لوحة التحكم:
// أونلاين / أوفلاين، الشعار والاسم، حسابات التواصل، نصوص الصفحة،
// ومتابعة طلبات الضيوف والحجوزات اللي جات من الصفحة.
import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";
import { Booking } from "../lib/types";
import { Icon, Pill, SAR, PageHead, Kpi, Seg, CardHead, Empty } from "./ds";

const SUPA_URL = process.env.EXPO_PUBLIC_SUPA_URL!;
const SUPA_KEY = process.env.EXPO_PUBLIC_SUPA_KEY!;

interface SiteSettings {
  landing_enabled?: boolean; landing_owner_id?: string | null;
  landing_name?: string; landing_logo?: string | null;
  landing_tagline?: string; landing_about?: string;
  contact_phone?: string; contact_whatsapp?: string;
  instagram_url?: string; tiktok_url?: string; snapchat_url?: string; x_url?: string;
  location_text?: string; location_url?: string;
}
interface GuestRequest { id: number; chalet: string; room: string; type: string; note: string; created_at: string; resolved: boolean; booking_id?: number | null; source?: string }

const TEXT_FIELDS: (keyof SiteSettings)[] = [
  "landing_name", "landing_tagline", "landing_about",
  "contact_phone", "contact_whatsapp", "instagram_url", "tiktok_url", "snapchat_url", "x_url",
  "location_text", "location_url",
];
const WEB_NOTE = "حجز من صفحة الموقع";

async function patchSettings(body: Partial<SiteSettings>) {
  const r = await fetch(`${SUPA_URL}/rest/v1/business_settings?id=eq.1`, {
    method: "PATCH",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return r.ok;
}

/** يصغّر الشعار إلى 320px كحد أقصى ويحفظه PNG (يحافظ على الشفافية) */
function logoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = ev => {
      const img = new Image();
      img.onerror = () => reject(new Error("img"));
      img.onload = () => {
        const scale = Math.min(1, 320 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const ctx = c.getContext("2d");
        if (!ctx) { reject(new Error("ctx")); return; }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** يقبل اسم المستخدم أو الرابط كامل ويحوّله لرابط صحيح */
function normalizeSocial(kind: "instagram" | "tiktok" | "snapchat" | "x", v: string): string {
  const t = (v || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  const u = t.replace(/^@/, "");
  if (kind === "instagram") return "https://instagram.com/" + u;
  if (kind === "tiktok") return "https://www.tiktok.com/@" + u;
  if (kind === "snapchat") return "https://www.snapchat.com/add/" + u;
  return "https://x.com/" + u;
}

export default function WebsiteTab({ bookings, ownerId, onReload, onOpenBooking, onStatus }: {
  bookings: Booking[]; ownerId: string | null; onReload: () => void | Promise<void>;
  onOpenBooking: (b: Booking) => void; onStatus?: (online: boolean) => void;
}) {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [draft, setDraft] = useState<SiteSettings>({});
  const [reqs, setReqs] = useState<GuestRequest[]>([]);
  const [view, setView] = useState<"control" | "requests" | "bookings">("control");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const siteUrl = origin + "/?site";

  async function load() {
    const r = await fetch(`${SUPA_URL}/rest/v1/business_settings?id=eq.1&select=*`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }).then(x => x.json()).catch(() => null);
    if (r?.[0]) { setS(r[0]); setDraft(r[0]); }
    const rq = await db("room_requests", "GET", null, "source=eq.landing&order=created_at.desc&limit=200");
    setReqs((rq || []) as unknown as GuestRequest[]);
  }
  useEffect(() => { load(); }, []);

  const online = !!s?.landing_enabled;
  const webBookings = useMemo(() => bookings.filter(b => (b.note || "").startsWith(WEB_NOTE)).sort((a, b) => b.id - a.id), [bookings]);
  const pendingWeb = webBookings.filter(b => b.status === "pending");
  const ym = new Date().toISOString().slice(0, 7);
  const monthWeb = webBookings.filter(b => b.status !== "cancelled" && (b.date_from || "").startsWith(ym));
  const openReqs = reqs.filter(r => !r.resolved);
  const shown = filter === "open" ? openReqs : reqs;
  const bookingById = useMemo(() => { const m = new Map<number, Booking>(); bookings.forEach(b => m.set(b.id, b)); return m; }, [bookings]);
  const dirty = TEXT_FIELDS.some(k => ((draft[k] as string) || "") !== (((s && s[k]) as string) || ""));

  async function setOnline(next: boolean) {
    if (!s || next === online) return;
    setToggling(true);
    const body: Partial<SiteSettings> = { landing_enabled: next, ...(next && ownerId ? { landing_owner_id: ownerId } : {}) };
    const ok = await patchSettings(body);
    setToggling(false);
    if (ok) { setS({ ...s, ...body }); onStatus?.(next); }
  }
  async function saveTexts() {
    setSaving(true);
    const body: Partial<SiteSettings> = {};
    TEXT_FIELDS.forEach(k => {
      let v = ((draft[k] as string) || "").trim();
      if (k === "instagram_url") v = normalizeSocial("instagram", v);
      if (k === "tiktok_url") v = normalizeSocial("tiktok", v);
      if (k === "snapchat_url") v = normalizeSocial("snapchat", v);
      if (k === "x_url") v = normalizeSocial("x", v);
      (body as Record<string, unknown>)[k] = v || null;
    });
    const ok = await patchSettings(body);
    setSaving(false);
    if (ok) { const merged = { ...(s || {}), ...body }; setS(merged); setDraft(merged); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }
  async function uploadLogo(file?: File) {
    if (!file) return;
    setLogoErr("");
    if (!file.type.startsWith("image/")) { setLogoErr("اختر صورة (PNG أو JPG أو SVG)"); return; }
    setLogoBusy(true);
    try {
      const url = await logoToDataUrl(file);
      const ok = await patchSettings({ landing_logo: url });
      if (ok) { setS(p => ({ ...(p || {}), landing_logo: url })); setDraft(p => ({ ...p, landing_logo: url })); }
      else setLogoErr("ما انحفظ الشعار، حاول مرة ثانية");
    } catch { setLogoErr("ما قدرنا نقرأ الصورة، جرّب صورة ثانية"); }
    setLogoBusy(false);
  }
  async function removeLogo() {
    setLogoBusy(true);
    const ok = await patchSettings({ landing_logo: null });
    setLogoBusy(false);
    if (ok) { setS(p => ({ ...(p || {}), landing_logo: null })); setDraft(p => ({ ...p, landing_logo: null })); }
  }
  async function resolve(r: GuestRequest) {
    await db("room_requests", "PATCH", { resolved: true }, r.id);
    setReqs(p => p.map(x => x.id === r.id ? { ...x, resolved: true } : x));
    onReload();
  }
  async function confirmBooking(b: Booking) {
    await db("bookings", "PATCH", { status: "confirmed" }, b.id);
    await onReload();
  }
  const guestWa = (b?: Booking) => { const p = (b?.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "966"); return p ? `https://wa.me/${p}` : null; };
  const ago = (t: string) => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? "الآن" : m < 60 ? `منذ ${m} د` : m < 1440 ? `منذ ${Math.round(m / 60)} س` : new Date(t).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn"); };
  const kindIcon = (t: string) => t === "صيانة" ? "wrench" : t === "نظافة" ? "broom" : "receipt";
  const kindTone = (t: string): "bad" | "info" | "warn" => t === "صيانة" ? "bad" : t === "نظافة" ? "info" : "warn";

  const field = (k: keyof SiteSettings, label: string, opts?: { area?: boolean; ltr?: boolean; ph?: string; full?: boolean; icon?: string }) => (
    <div style={{ gridColumn: opts?.full ? "1 / -1" : undefined, minWidth: 0 }}>
      <label className="lbl" htmlFor={"ws_" + k} style={{ display: "flex", alignItems: "center", gap: 6 }}>{opts?.icon && <Icon n={opts.icon} s={15}/>}{label}</label>
      {opts?.area
        ? <textarea id={"ws_" + k} className="x-input" style={{ minHeight: 110, padding: "10px 12px", resize: "vertical" }} value={(draft[k] as string) || ""} placeholder={opts?.ph} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}/>
        : <input id={"ws_" + k} className={"x-input" + (opts?.ltr ? " x-mono" : "")} dir={opts?.ltr ? "ltr" : undefined} style={opts?.ltr ? { textAlign: "left" } : undefined} value={(draft[k] as string) || ""} placeholder={opts?.ph} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}/>}
    </div>
  );
  const socialStatus = (v?: string) => v ? <Pill tone="ok">مربوط</Pill> : <Pill tone="muted">غير مربوط</Pill>;

  return (
    <div className="x-page">
      <PageHead title="صفحة الهبوط" sub="تحكم بالصفحة اللي يشوفها الضيوف: الحالة، الهوية، الحسابات، والطلبات">
        <a className="btn bo" href={siteUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><Icon n="globe"/>{online ? "فتح الصفحة" : "معاينة"}</a>
      </PageHead>

      {/* ── الحالة: أونلاين / أوفلاين ── */}
      <div className="x-card x-pad" style={{ display: "flex", flexDirection: "column", gap: 16, background: online ? "var(--k-green-bg)" : "var(--surface)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", background: online ? "#1E9A57" : "var(--text3)", boxShadow: online ? "0 0 0 6px rgba(30,154,87,.18)" : "none", flex: "none" }}/>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: online ? "var(--k-green)" : "var(--text)" }}>{s === null ? "جاري التحميل..." : online ? "أونلاين" : "أوفلاين"}</div>
              <div className="x-muted" style={{ fontSize: 14 }}>{online ? "الصفحة ظاهرة للعامة: يشوفون الشاليهات ويحجزون ويتابعون حجوزاتهم" : "الصفحة مخفية عن الزوار، تقدر تعاينها أنت بس"}</div>
            </div>
          </div>
          <div className="x-seg" role="group" aria-label="حالة صفحة الهبوط" style={{ padding: 4 }}>
            <button type="button" aria-pressed={online} disabled={!s || toggling} onClick={() => setOnline(true)} style={{ minHeight: 42, padding: "0 20px", fontSize: 15 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1E9A57" }}/>أونلاين
            </button>
            <button type="button" aria-pressed={!online} disabled={!s || toggling} onClick={() => setOnline(false)} style={{ minHeight: 42, padding: "0 20px", fontSize: 15 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text3)" }}/>أوفلاين
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="x-muted" style={{ fontSize: 13 }}>الرابط:</span>
          <span className="x-mono" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 13, userSelect: "all", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{siteUrl}</span>
          <button type="button" className="btn bo bsm" onClick={async () => { try { await navigator.clipboard.writeText(siteUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ } }}><Icon n="link" s={15}/>{copied ? "تم النسخ" : "نسخ"}</button>
          {online && <span className="x-muted" style={{ fontSize: 13 }}>والرابط الرئيسي للموقع يفتحها للزوار، ودخول الإدارة من أسفلها.</span>}
        </div>
      </div>

      <div className="x-kpis">
        <Kpi c={openReqs.length ? "amber" : "green"} label="طلبات الضيوف المفتوحة" value={openReqs.length} sub="مستلزمات ونظافة وصيانة"/>
        <Kpi c={pendingWeb.length ? "amber" : "teal"} label="حجوزات تنتظر التأكيد" value={pendingWeb.length} sub="بانتظار التحويل"/>
        <Kpi c="blue" label="حجوزات الصفحة هذا الشهر" value={monthWeb.length}/>
        <Kpi c="green" label="قيمتها" value={<SAR v={monthWeb.reduce((t, b) => t + Number(b.price || 0), 0)}/>}/>
      </div>

      <Seg label="الأقسام" value={view} onChange={setView} options={[
        { v: "control", l: "التحكم والهوية" },
        { v: "requests", l: "طلبات الضيوف", c: openReqs.length },
        { v: "bookings", l: "حجوزات الصفحة", c: pendingWeb.length },
      ]}/>

      {view === "control" && (
        <>
          {/* ── الهوية: الشعار والاسم ── */}
          <div className="x-card">
            <CardHead icon="image" title="الهوية" sub="الشعار والاسم اللي يظهرون أعلى الصفحة وأسفلها"/>
            <div className="x-pad" style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                <div style={{ width: 112, height: 112, borderRadius: 24, background: "#3B2A1C", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid var(--border)" }}>
                  {s?.landing_logo
                    ? <img src={s.landing_logo} alt="الشعار الحالي" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 10 }}/>
                    : <Icon n="image" s={36} style={{ color: "#C9A36A" }}/>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <label className="btn bo bsm" style={{ cursor: logoBusy ? "wait" : "pointer" }}>
                    <Icon n="camera" s={15}/>{logoBusy ? "جاري..." : s?.landing_logo ? "تغيير" : "رفع شعار"}
                    <input type="file" accept="image/*" style={{ display: "none" }} disabled={logoBusy} onChange={e => { uploadLogo(e.target.files?.[0]); e.currentTarget.value = ""; }}/>
                  </label>
                  {s?.landing_logo && <button type="button" className="btn bd bsm" aria-label="حذف الشعار" disabled={logoBusy} onClick={removeLogo}><Icon n="trash" s={15}/></button>}
                </div>
                {logoErr && <div className="x-neg" style={{ fontSize: 13 }}>{logoErr}</div>}
              </div>
              <div style={{ flex: "1 1 280px", display: "grid", gap: 14, minWidth: 0 }}>
                {field("landing_name", "اسم المنشأة", { ph: "مجموعة ريتام" })}
                {field("landing_tagline", "النص تحت العنوان الرئيسي", { ph: "شاليهات عائلية بمسابح خاصة وتصميم يجمع روح الأحساء وراحة اليوم..." })}
                <div className="x-muted" style={{ fontSize: 13 }}>الأفضل شعار بخلفية شفافة (PNG). يتصغّر تلقائياً.</div>
              </div>
            </div>
          </div>

          {/* ── حسابات التواصل الاجتماعي ── */}
          <div className="x-card">
            <CardHead icon="share" title="حسابات التواصل" sub="تقدر تكتب اسم الحساب بس، والرابط يتكوّن تلقائياً"/>
            <div className="x-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 14 }}>
              {([
                ["instagram_url", "إنستقرام", "@reetam"],
                ["tiktok_url", "تيك توك", "@reetam"],
                ["snapchat_url", "سناب شات", "reetam"],
                ["x_url", "X (تويتر)", "@reetam"],
                ["contact_whatsapp", "واتساب", "05XXXXXXXX"],
                ["contact_phone", "رقم الاتصال", "05XXXXXXXX"],
              ] as [keyof SiteSettings, string, string][]).map(([k, l, ph]) => (
                <div key={k} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <label className="lbl" htmlFor={"ws_" + k} style={{ margin: 0 }}>{l}</label>
                    {socialStatus((draft[k] as string) || "")}
                  </div>
                  <input id={"ws_" + k} className="x-input x-mono" dir="ltr" style={{ textAlign: "left" }} value={(draft[k] as string) || ""} placeholder={ph} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}/>
                </div>
              ))}
            </div>
          </div>

          {/* ── المحتوى والموقع ── */}
          <div className="x-card">
            <CardHead icon="edit" title="المحتوى والموقع"/>
            <div className="x-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 14 }}>
              {field("landing_about", "نص «من نحن» (كل سطر فقرة)", { area: true, full: true, ph: "مجموعة ريتام شاليهات عائلية في الأحساء..." })}
              {field("location_text", "الموقع (نص)", { ph: "الأحساء، المملكة العربية السعودية" })}
              {field("location_url", "رابط الموقع على الخريطة", { ltr: true, ph: "https://maps.google.com/..." })}
              <div className="x-muted" style={{ fontSize: 13, gridColumn: "1 / -1" }}>الشاليهات وأسعارها وصورها تنسحب تلقائياً من صفحة الشاليهات، والحساب البنكي من الإعدادات.</div>
            </div>
          </div>

          <div style={{ position: dirty ? "sticky" : "static", bottom: 12, display: "flex", justifyContent: "flex-start", zIndex: 5 }}>
            <button type="button" className="btn bp" disabled={saving || !dirty} onClick={saveTexts} style={{ boxShadow: dirty ? "0 10px 24px rgba(23,19,15,.25)" : "none" }}>
              <Icon n="check"/>{saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : dirty ? "حفظ التغييرات" : "لا توجد تغييرات"}
            </button>
          </div>
        </>
      )}

      {view === "requests" && (
        <div className="x-card">
          <div className="x-card-h">
            <h2><Icon n="bell"/>طلبات الضيوف من الصفحة</h2>
            <Seg label="تصفية" value={filter} onChange={setFilter} options={[{ v: "open", l: "المفتوحة", c: openReqs.length }, { v: "all", l: "الكل", c: reqs.length }]}/>
          </div>
          {shown.length === 0 ? <Empty>{filter === "open" ? "لا توجد طلبات مفتوحة" : "لا توجد طلبات بعد"}</Empty> : (
            <div className="x-list">{shown.map(r => {
              const b = r.booking_id ? bookingById.get(r.booking_id) : undefined;
              const wa = guestWa(b);
              return (
                <div key={r.id} className="x-li">
                  <div className={"x-ic " + (r.resolved ? "muted" : kindTone(r.type))}><Icon n={kindIcon(r.type)}/></div>
                  <div className="meta">
                    <b>{r.type + ": " + r.note}</b>
                    <span>{(b ? b.guest : r.room.replace(/^حجزي · /, "")) + " · " + r.chalet + " · " + ago(r.created_at)}</span>
                  </div>
                  {r.resolved ? <Pill tone="ok">تم</Pill> : <Pill tone="warn" dot>مفتوح</Pill>}
                  <div className="acts">
                    {wa && <a className="btn bshare bsm" href={wa} target="_blank" rel="noreferrer" aria-label="واتساب الضيف"><Icon n="send" s={15}/></a>}
                    {b && <button type="button" className="btn bo bsm" onClick={() => onOpenBooking(b)}>الحجز</button>}
                    {!r.resolved && <button type="button" className="btn bp bsm" onClick={() => resolve(r)}><Icon n="check" s={15}/>تم</button>}
                  </div>
                </div>
              );
            })}</div>
          )}
        </div>
      )}

      {view === "bookings" && (
        <div className="x-card">
          <CardHead icon="cal" title="حجوزات من الصفحة" sub={webBookings.length ? "الأحدث أولاً" : undefined}/>
          {webBookings.length === 0 ? <Empty>ما فيه حجوزات من الصفحة بعد</Empty> : (
            <div className="tbl-wrap"><table className="x-tbl">
              <thead><tr><th>الضيف</th><th>الشاليه</th><th>الفترة</th><th>المبلغ</th><th>الحالة</th><th className="end"></th></tr></thead>
              <tbody>{webBookings.slice(0, 50).map(b => {
                const wa = guestWa(b);
                return (
                  <tr key={b.id}>
                    <td className="strong">{b.guest}<div className="x-mono x-muted" style={{ fontSize: 12, fontWeight: 400, textAlign: "right" }}>{b.phone}</div></td>
                    <td>{b.chalet}</td>
                    <td>{b.date_from}<div className="x-muted" style={{ fontSize: 12 }}>{"إلى " + b.date_to}</div></td>
                    <td className="strong"><SAR v={Number(b.price)}/></td>
                    <td><Pill tone={b.status === "confirmed" ? "ok" : b.status === "pending" ? "warn" : b.status === "cancelled" ? "bad" : "muted"} dot>{b.status === "confirmed" ? "مؤكد" : b.status === "pending" ? "بانتظار التحويل" : b.status === "cancelled" ? "ملغي" : "مكتمل"}</Pill></td>
                    <td className="end"><div style={{ display: "inline-flex", gap: 6 }}>
                      {wa && <a className="btn bshare bsm" href={wa} target="_blank" rel="noreferrer" aria-label="واتساب الضيف"><Icon n="send" s={15}/></a>}
                      {b.status === "pending" && <button type="button" className="btn bp bsm" onClick={() => confirmBooking(b)}><Icon n="check" s={15}/>تأكيد</button>}
                      <button type="button" className="btn bo bsm" onClick={() => onOpenBooking(b)}>التفاصيل</button>
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
