// خانة "الموقع العام" في لوحة التحكم: نشر صفحة الهبوط أو إخفاؤها، رابطها،
// نصوصها وبيانات التواصل، ومتابعة طلبات الضيوف والحجوزات اللي جات من الموقع.
import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";
import { Booking } from "../lib/types";
import { Icon, Pill, SAR, PageHead, Kpi, Seg, CardHead, Empty } from "./ds";

const SUPA_URL = process.env.EXPO_PUBLIC_SUPA_URL!;
const SUPA_KEY = process.env.EXPO_PUBLIC_SUPA_KEY!;

interface SiteSettings {
  landing_enabled?: boolean; landing_owner_id?: string | null;
  landing_tagline?: string; landing_about?: string;
  contact_phone?: string; contact_whatsapp?: string; instagram_url?: string; tiktok_url?: string;
  location_text?: string; location_url?: string;
}
interface GuestRequest { id: number; chalet: string; room: string; type: string; note: string; created_at: string; resolved: boolean; booking_id?: number | null; source?: string }

const SITE_FIELDS: (keyof SiteSettings)[] = ["landing_tagline","landing_about","contact_phone","contact_whatsapp","instagram_url","tiktok_url","location_text","location_url"];
const WEB_NOTE = "حجز من صفحة الموقع";

async function patchSettings(body: Partial<SiteSettings>) {
  const r = await fetch(`${SUPA_URL}/rest/v1/business_settings?id=eq.1`, {
    method: "PATCH",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return r.ok;
}

export default function WebsiteTab({ bookings, ownerId, onReload, onOpenBooking }: {
  bookings: Booking[]; ownerId: string | null; onReload: () => void | Promise<void>; onOpenBooking: (b: Booking) => void;
}) {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [draft, setDraft] = useState<SiteSettings>({});
  const [reqs, setReqs] = useState<GuestRequest[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const siteUrl = origin + "/?site";

  async function load() {
    const r = await fetch(`${SUPA_URL}/rest/v1/business_settings?id=eq.1&select=*`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }).then(x => x.json()).catch(() => null);
    if (r?.[0]) { setS(r[0]); setDraft(r[0]); }
    const rq = await db("room_requests", "GET", null, "source=eq.landing&order=created_at.desc&limit=200");
    setReqs((rq || []) as unknown as GuestRequest[]);
  }
  useEffect(() => { load(); }, []);

  const published = !!s?.landing_enabled;
  const webBookings = useMemo(() => bookings.filter(b => (b.note || "").startsWith(WEB_NOTE)).sort((a, b) => b.id - a.id), [bookings]);
  const pendingWeb = webBookings.filter(b => b.status === "pending");
  const ym = new Date().toISOString().slice(0, 7);
  const monthWeb = webBookings.filter(b => b.status !== "cancelled" && (b.date_from || "").startsWith(ym));
  const openReqs = reqs.filter(r => !r.resolved);
  const shown = filter === "open" ? openReqs : reqs;
  const bookingById = useMemo(() => { const m = new Map<number, Booking>(); bookings.forEach(b => m.set(b.id, b)); return m; }, [bookings]);
  const dirty = SITE_FIELDS.some(k => (draft[k] || "") !== ((s && s[k]) || ""));

  async function togglePublish() {
    if (!s) return;
    setToggling(true);
    const next = !published;
    const ok = await patchSettings({ landing_enabled: next, ...(next && ownerId ? { landing_owner_id: ownerId } : {}) });
    setToggling(false);
    if (ok) setS({ ...s, landing_enabled: next, ...(next && ownerId ? { landing_owner_id: ownerId } : {}) });
  }
  async function saveTexts() {
    setSaving(true);
    const body: Partial<SiteSettings> = {};
    SITE_FIELDS.forEach(k => { (body as Record<string, unknown>)[k] = (draft[k] as string || "").trim() || null; });
    const ok = await patchSettings(body);
    setSaving(false);
    if (ok) { setS({ ...(s || {}), ...body }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
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

  const field = (k: keyof SiteSettings, label: string, opts?: { area?: boolean; ltr?: boolean; ph?: string; full?: boolean }) => (
    <div style={{ gridColumn: opts?.full ? "1 / -1" : undefined }}>
      <label className="lbl" htmlFor={"ws_" + k}>{label}</label>
      {opts?.area
        ? <textarea id={"ws_" + k} className="x-input" style={{ minHeight: 110, padding: "10px 12px", resize: "vertical" }} value={(draft[k] as string) || ""} placeholder={opts?.ph} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}/>
        : <input id={"ws_" + k} className={"x-input" + (opts?.ltr ? " x-mono" : "")} dir={opts?.ltr ? "ltr" : undefined} style={opts?.ltr ? { textAlign: "left" } : undefined} value={(draft[k] as string) || ""} placeholder={opts?.ph} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}/>}
    </div>
  );

  return (
    <div className="x-page">
      <PageHead title="الموقع العام" sub="صفحة الهبوط اللي يشوفها الضيوف: الشاليهات، الحجز، وقسم حجزي">
        <a className="btn bo" href={siteUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><Icon n="globe"/>{published ? "فتح الموقع" : "معاينة"}</a>
      </PageHead>

      <div className="x-card x-pad" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, justifyContent: "space-between", background: published ? "var(--k-green-bg)" : "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <div className={"x-ic " + (published ? "ok" : "muted")} style={{ width: 52, height: 52 }}><Icon n="globe" s={24}/></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: published ? "var(--k-green)" : "var(--text)" }}>{s === null ? "جاري التحميل..." : published ? "الموقع منشور للعامة" : "الموقع غير منشور"}</div>
            <div className="x-muted" style={{ fontSize: 14 }}>{published ? "أي زائر يفتح رابط الموقع يشوف الشاليهات ويقدر يحجز ويتابع حجزه" : "ما أحد يشوفه غيرك، تقدر تعاينه من زر المعاينة"}</div>
          </div>
        </div>
        <button type="button" className={"btn " + (published ? "bo" : "bp")} disabled={!s || toggling} onClick={togglePublish}>
          <Icon n={published ? "x" : "check"}/>{toggling ? "جاري..." : published ? "إيقاف النشر" : "نشر الموقع للعامة"}
        </button>
        <div style={{ flexBasis: "100%", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="x-muted" style={{ fontSize: 13 }}>رابط الموقع:</span>
          <span className="x-mono" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 13, userSelect: "all", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{siteUrl}</span>
          <button type="button" className="btn bo bsm" onClick={async () => { try { await navigator.clipboard.writeText(siteUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ } }}><Icon n="link" s={15}/>{copied ? "تم النسخ" : "نسخ"}</button>
          {published && <span className="x-muted" style={{ fontSize: 13 }}>والرابط الرئيسي للموقع يعرض الصفحة للزوار، ودخول الإدارة من أسفل الصفحة.</span>}
        </div>
      </div>

      <div className="x-kpis">
        <Kpi c={openReqs.length ? "amber" : "green"} label="طلبات الضيوف المفتوحة" value={openReqs.length} sub="مستلزمات ونظافة وصيانة"/>
        <Kpi c={pendingWeb.length ? "amber" : "teal"} label="حجوزات تنتظر التأكيد" value={pendingWeb.length} sub="من الموقع، بانتظار التحويل"/>
        <Kpi c="blue" label="حجوزات الموقع هذا الشهر" value={monthWeb.length}/>
        <Kpi c="green" label="قيمتها" value={<SAR v={monthWeb.reduce((t, b) => t + Number(b.price || 0), 0)}/>}/>
      </div>

      <div className="x-card">
        <div className="x-card-h">
          <h2><Icon n="bell"/>طلبات الضيوف من الموقع</h2>
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

      <div className="x-card">
        <CardHead icon="cal" title="حجوزات من الموقع" sub={webBookings.length ? "الأحدث أولاً" : undefined}/>
        {webBookings.length === 0 ? <Empty>ما فيه حجوزات من الموقع بعد</Empty> : (
          <div className="tbl-wrap"><table className="x-tbl">
            <thead><tr><th>الضيف</th><th>الشاليه</th><th>الفترة</th><th>المبلغ</th><th>الحالة</th><th className="end"></th></tr></thead>
            <tbody>{webBookings.slice(0, 30).map(b => {
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

      <div className="x-card">
        <CardHead icon="edit" title="محتوى الصفحة وبيانات التواصل" sub="يظهر للزوار مباشرة بعد الحفظ"/>
        <div className="x-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 14 }}>
            {field("landing_tagline", "النص تحت العنوان الرئيسي", { full: true, ph: "شاليهات عائلية بمسابح خاصة وتصميم يجمع روح الأحساء وراحة اليوم..." })}
            {field("landing_about", "نص «من نحن» (كل سطر فقرة)", { area: true, full: true, ph: "مجموعة ريتام شاليهات عائلية في الأحساء..." })}
            {field("contact_whatsapp", "رقم الواتساب", { ltr: true, ph: "05XXXXXXXX" })}
            {field("contact_phone", "رقم الاتصال", { ltr: true, ph: "05XXXXXXXX" })}
            {field("instagram_url", "رابط إنستقرام", { ltr: true, ph: "https://instagram.com/..." })}
            {field("tiktok_url", "رابط تيك توك", { ltr: true, ph: "https://tiktok.com/@..." })}
            {field("location_text", "الموقع (نص)", { ph: "الأحساء، المملكة العربية السعودية" })}
            {field("location_url", "رابط الموقع على الخريطة", { ltr: true, ph: "https://maps.google.com/..." })}
          </div>
          <div className="x-muted" style={{ fontSize: 13 }}>الشاليهات وأسعارها وصورها تنسحب تلقائياً من صفحة الشاليهات، والحساب البنكي من الإعدادات.</div>
          <div><button type="button" className="btn bp" disabled={saving || !dirty} onClick={saveTexts}>{saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ"}</button></div>
        </div>
      </div>
    </div>
  );
}
