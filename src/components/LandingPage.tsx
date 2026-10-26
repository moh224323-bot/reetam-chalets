// صفحة الهبوط العامة لمجموعة ريتام + بوابة "حجزي" للضيف.
// كل البيانات تمر عبر دوال Supabase آمنة (landing_*) — لا قراءة مباشرة للجداول.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export interface LandingChalet {
  id: number; name: string; loc?: string; cap?: number; price?: number; wprice?: number;
  description?: string; img?: string; gallery?: string; amenities?: string;
  rating?: number | null; reviews?: number;
  allow_overnight?: boolean; allow_hourly?: boolean; hourly_slots?: string | null;
}
export interface LandingData {
  enabled: boolean; preview?: boolean;
  name?: string; logo?: string | null; snapchat?: string; x?: string;
  about?: string; tagline?: string;
  phone?: string; whatsapp?: string; email?: string; instagram?: string; tiktok?: string;
  location_text?: string; location_url?: string;
  bank_name?: string; bank_account_name?: string; bank_iban?: string;
  chalets?: LandingChalet[];
  rating?: { avg: number | null; count: number };
  booked?: { chalet: string; from: string; to: string; checkin_time?: string | null; checkout_time?: string | null }[];
}
type HourlySlot = { name: string; from: string; to: string; price: string };
function hourlySlotsOf(c: LandingChalet): HourlySlot[] {
  try { const v = c.hourly_slots ? JSON.parse(c.hourly_slots) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
interface GuestBooking {
  ok: boolean; id: number; chalet: string; guest: string; date_from: string; date_to: string;
  checkin_time?: string; checkout_time?: string; status: string; price: number; nights: number;
  stage: "before" | "during" | "after"; map_url?: string; terms?: string; img?: string;
  tickets: number; free_nights: number; reviewed: boolean;
  requests: { type: string; note: string; resolved: boolean; at: string }[];
  whatsapp?: string;
}

export async function fetchLanding(): Promise<LandingData | null> {
  const { data, error } = await supabase.rpc("landing_public");
  if (error) { console.error(error); return null; }
  return data as LandingData;
}

/* ───────── أدوات ───────── */
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("en-US");
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const dayName = (s: string) => parseISO(s).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" });
const waNumber = (p?: string) => (p || "").replace(/[^0-9]/g, "").replace(/^00/, "").replace(/^0/, "966");
function stripEmoji(s: string) { return s.replace(/[\p{Extended_Pictographic}️‍]/gu, "").trim(); }
function amenityList(a?: string, max = 6): string[] {
  if (!a) return [];
  return a.split(/[،,|\n]/).map(stripEmoji).filter(Boolean).slice(0, max);
}
type Photo = { url: string; cat: string };
function galleryOf(c: LandingChalet): Photo[] {
  const out: Photo[] = []; const seen = new Set<string>();
  const add = (url: unknown, cat?: unknown) => { if (typeof url === "string" && url && !seen.has(url)) { seen.add(url); out.push({ url, cat: typeof cat === "string" ? cat.trim() : "" }); } };
  if (c.gallery) {
    try {
      const g = JSON.parse(c.gallery);
      if (Array.isArray(g)) for (const x of g) { if (typeof x === "string") add(x); else if (x) add(x.url, x.cat); }
    } catch { /* نص غير JSON */ }
  }
  if (c.img && !seen.has(c.img)) out.unshift({ url: c.img, cat: "" });
  return out;
}
const nightPrice = (c: LandingChalet, iso: string) => { const g = parseISO(iso).getDay(); return (g === 5 || g === 6) && c.wprice ? Number(c.wprice) : Number(c.price || 0); };
const nightsLabel = (n: number) => n === 1 ? "ليلة واحدة" : n === 2 ? "ليلتين" : n + " ليالٍ";
function chaletHref(id: number | null) {
  if (typeof window === "undefined") return "#";
  const u = new URL(window.location.href);
  if (id == null) u.searchParams.delete("c"); else u.searchParams.set("c", String(id));
  u.hash = "";
  return u.pathname + (u.search ? u.search.replace(/=(&|$)/g, "$1") : "");
}
const readC = () => { try { const v = new URLSearchParams(window.location.search).get("c"); return v ? Number(v) : null; } catch { return null; } };
function amenityIcon(t: string): string {
  if (/مسبح|سباح/.test(t)) return "pool";
  if (/شواء|فحم|مشب/.test(t)) return "fire";
  if (/مكيف|تكييف/.test(t)) return "temp";
  if (/انترنت|إنترنت|واي/.test(t)) return "wifi";
  if (/حديقة|نخل|زرع/.test(t)) return "palm";
  if (/مطبخ/.test(t)) return "plate";
  if (/جاكوزي|ساونا/.test(t)) return "water";
  if (/موقف|سيار/.test(t)) return "car";
  if (/سماع|صوت|شاشة|تلفزيون/.test(t)) return "music";
  if (/غرف|نوم/.test(t)) return "bed";
  return "check";
}
function firstImage(c: LandingChalet): string | null {
  if (c.img) return c.img;
  if (!c.gallery) return null;
  try {
    const g = JSON.parse(c.gallery);
    if (Array.isArray(g)) for (const x of g) { if (typeof x === "string") return x; if (x && typeof x.url === "string") return x.url; }
  } catch { /* نص غير JSON */ }
  return null;
}
function priceFor(c: LandingChalet, from: string, to: string) {
  if (!from || !to) return { nights: 0, total: 0 };
  const a = parseISO(from), b = parseISO(to);
  const nights = Math.round((b.getTime() - a.getTime()) / 86400000);
  let total = 0;
  for (let i = 0; i < nights; i++) {
    const d = new Date(a); d.setDate(d.getDate() + i);
    const wk = d.getDay() === 5 || d.getDay() === 6;
    total += wk && c.wprice ? Number(c.wprice) : Number(c.price || 0);
  }
  return { nights: Math.max(0, nights), total };
}
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* */ } },
};

/* ───────── أيقونات ───────── */
const P: Record<string, React.ReactNode> = {
  palm: <><path d="M12 22V11"/><path d="M12 11c-2-4-6-5-9-4 2 1 5 3 5 6"/><path d="M12 11c2-4 6-5 9-4-2 1-5 3-5 6"/><path d="M12 11c-1-4 0-7 3-9"/><path d="M12 11c1-4 0-7-3-9"/></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></>,
  users: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/></>,
  pool: <><path d="M2 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M8 15V5a2 2 0 0 1 4 0M16 15V5a2 2 0 0 0-4 0M8 9h8"/></>,
  bed: <><path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="10.5" r="1.5"/></>,
  fire: <path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z"/>,
  temp: <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>,
  wifi: <><path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/></>,
  car: <><path d="M5 17h14M3 17v-4l2-5h14l2 5v4"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/></>,
  music: <><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>,
  key: <><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></>,
  gift: <><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1"/></>,
  star: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.1 6.1-.7z"/>,
  broom: <><path d="M19 3l-7 7"/><path d="M12 10c-3 0-6 2-7 5l-2 6 6-2c3-1 5-4 5-7z"/></>,
  box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>,
  towel: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 15h14M9 3v12"/></>,
  water: <path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>,
  coal: <path d="M4 18h16M7 18l2-5h6l2 5M10 13c0-2 2-2 2-4M14 13c0-2-2-2-2-4"/>,
  cup: <path d="M5 8h12v5a6 6 0 0 1-12 0zM17 9h1a3 3 0 0 1 0 6h-1M8 3v2M12 3v2"/>,
  plate: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/></>,
  soap: <><rect x="6" y="9" width="12" height="12" rx="3"/><path d="M10 9V6h4v3M12 3v3"/></>,
  tissue: <><path d="M5 9h14v11H5z"/><path d="M9 9c0-3 2-5 3-6 1 1 3 3 3 6"/></>,
  bug: <><rect x="8" y="7" width="8" height="12" rx="4"/><path d="M4 11h4M16 11h4M4 17h4M16 17h4M9 4l2 3M15 4l-2 3"/></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z"/>,
  dots: <path d="M5 12h.01M12 12h.01M19 12h.01"/>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
  check: <path d="M5 12l5 5 9-10"/>,
  x: <path d="M6 6l12 12M18 6L6 18"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  msg: <path d="M4 5h16v11H8l-4 4z"/>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>,
  door: <><path d="M14 3H6v18h8"/><path d="M14 3l5 2v14l-5 2z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></>,
  snap: <path d="M12 3c3 0 5 2.2 5 5.2v2.3l1.8-.6c.5 0 .8.6.4 1-.6.5-1.6.9-2.2 1.2.4 1.6 1.8 3 3.5 3.5.4.1.4.6 0 .8-.8.4-1.8.5-2.3.6-.2.6-.3 1.1-1 1.1-.7 0-1.5-.4-2.8.2-1 .5-1.6 1.2-2.4 1.2s-1.4-.7-2.4-1.2c-1.3-.6-2.1-.2-2.8-.2-.7 0-.8-.5-1-1.1-.5-.1-1.5-.2-2.3-.6-.4-.2-.4-.7 0-.8 1.7-.5 3.1-1.9 3.5-3.5-.6-.3-1.6-.7-2.2-1.2-.4-.4-.1-1 .4-1l1.8.6V8.2C7 5.2 9 3 12 3z"/>,
  xlogo: <path d="M4 4l16 16M20 4L4 20"/>,
  insta: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  chevR: <path d="M9 6l6 6-6 6"/>,
  chevL: <path d="M15 6l-6 6 6 6"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
};
function I({ n, s = 20, style }: { n: string; s?: number; style?: React.CSSProperties }) {
  return <svg className="lp-i" width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" style={style}>{P[n] || P.check}</svg>;
}
function Frond({ w = 120 }: { w?: number }) {
  return (
    <svg width={w} height={28} viewBox="0 0 120 28" aria-hidden="true" style={{ color: "var(--lp-gold)" }}>
      <g fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
        <path d="M4 14h112"/>
        <path d="M14 14c4-6 10-8 16-8M14 14c4 6 10 8 16 8M34 14c4-6 10-8 16-8M34 14c4 6 10 8 16 8M54 14c4-6 10-8 16-8M54 14c4 6 10 8 16 8M74 14c4-6 10-8 16-8M74 14c4 6 10 8 16 8M94 14c4-6 10-8 16-8M94 14c4 6 10 8 16 8"/>
      </g>
      <circle cx="60" cy="14" r="2.2" fill="currentColor"/>
    </svg>
  );
}
const CARVE = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='96' viewBox='0 0 80 96'><g fill='none' stroke='#C29A5B' stroke-width='1.3'><path d='M8 96V40C8 20 24 6 40 2c16 4 32 18 32 38v56'/><path d='M20 96V44c0-13 9-24 20-28 11 4 20 15 20 28v52'/><path d='M40 30c-5 6-5 14 0 20 5-6 5-14 0-20z'/><path d='M40 50v30M32 62c4 0 8 2 8 6M48 62c-4 0-8 2-8 6M30 76c5 0 10 2 10 6M50 76c-5 0-10 2-10 6'/></g></svg>`);
const FROND_BG = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='28' viewBox='0 0 120 28'><g fill='none' stroke='#C29A5B' stroke-width='1.2' stroke-linecap='round'><path d='M4 14h112'/><path d='M14 14c4-6 10-8 16-8M14 14c4 6 10 8 16 8M34 14c4-6 10-8 16-8M34 14c4 6 10 8 16 8M54 14c4-6 10-8 16-8M54 14c4 6 10 8 16 8M74 14c4-6 10-8 16-8M74 14c4 6 10 8 16 8M94 14c4-6 10-8 16-8M94 14c4 6 10 8 16 8'/></g><circle cx='60' cy='14' r='2.2' fill='#C29A5B'/></svg>`);

/* ───────── الشعار ───────── */
function Brand({ data, dark }: { data: LandingData; dark?: boolean }) {
  const name = data.name || "مجموعة ريتام";
  return (
    <span className="lp-logo" style={dark ? { color: "#FFF6E8" } : undefined}>
      {data.logo
        ? <img className="lp-logo-img" src={data.logo} alt=""/>
        : <span className="lp-logo-mark" style={dark ? { background: "#3B2A1C" } : undefined}><I n="palm"/></span>}
      <span><b>{name}</b><small style={dark ? { color: "#A8957E" } : undefined}>شاليهات الأحساء</small></span>
    </span>
  );
}
function Socials({ data, light }: { data: LandingData; light?: boolean }) {
  const wa = waNumber(data.whatsapp || data.phone);
  const items: [string, string, string][] = [];
  if (data.instagram) items.push([data.instagram, "insta", "إنستقرام"]);
  if (data.tiktok) items.push([data.tiktok, "music", "تيك توك"]);
  if (data.snapchat) items.push([data.snapchat, "snap", "سناب شات"]);
  if (data.x) items.push([data.x, "xlogo", "X"]);
  if (wa) items.push([`https://wa.me/${wa}`, "msg", "واتساب"]);
  if (!items.length) return null;
  return (
    <div className={"lp-socials" + (light ? " light" : "")}>
      {items.map(([href, ic, label]) => <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}><I n={ic} s={20}/></a>)}
    </div>
  );
}

/* ───────── الصفحة ───────── */
export default function LandingPage({ initial }: { initial?: LandingData | null }) {
  const [data, setData] = useState<LandingData | null | undefined>(initial === undefined ? undefined : initial);
  const [menu, setMenu] = useState(false);
  const [capF, setCapF] = useState<"all" | "s" | "m" | "l">("all");
  const [openId, setOpenId] = useState<number | null>(readC);
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initial === undefined) fetchLanding().then(d => setData(d));
    const onPop = () => setOpenId(readC());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const opened = openId != null ? (data?.chalets || []).find(c => c.id === openId) || null : null;
  useEffect(() => {
    if (data && typeof document !== "undefined") document.title = (opened ? opened.name + " | " : "") + (data.name || "مجموعة ريتام") + " | شاليهات الأحساء";
  }, [data, opened]);

  // التنقل بين الصفحة الرئيسية وصفحة الشاليه بدون إعادة تحميل
  function go(id: number | null, anchor?: string) {
    try { window.history.pushState({}, "", chaletHref(id)); } catch { /* */ }
    setOpenId(id); setMenu(false);
    requestAnimationFrame(() => {
      const el = anchor ? document.getElementById(anchor) : null;
      if (el) el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
      else rootRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    });
  }
  const navLink = (anchor: string) => ({ href: "#" + anchor });
  // كل روابط الأقسام (#...) تنزل للقسم مباشرة بدون تغيير الرابط،
  // لأن تغيير الرابط يخلي موجّه التطبيق يعيد رسم الصفحة ويرجعها لأعلى
  function onAnchor(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    const h = a?.getAttribute("href") || "";
    if (!h.startsWith("#")) return;
    e.preventDefault();
    setMenu(false);
    const id = h.slice(1) || "top";
    const homeOnly = ["top", "chalets", "about", "features", "how", "mybooking"];
    if (opened && homeOnly.includes(id)) { go(null, id === "top" ? undefined : id); return; }
    const el = id === "top" ? null : document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else rootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3800); return () => clearTimeout(t); }, [toast]);

  if (data === undefined) return <div className="lp" dir="rtl"><style>{CSS}</style><div className="lp-center">جاري التحميل...</div></div>;
  if (!data || (!data.enabled && !data.preview)) {
    return (
      <div className="lp" dir="rtl"><style>{CSS}</style>
        <div className="lp-center" style={{ flexDirection: "column", gap: 14 }}>
          {data?.logo ? <img className="lp-logo-img" src={data.logo} alt="" style={{ width: 72, height: 72 }}/> : <span className="lp-logo-mark"><I n="palm"/></span>}
          <h1 style={{ fontSize: 26 }}>{data?.name || "مجموعة ريتام"}</h1>
          <p style={{ color: "var(--lp-ink-2)" }}>الموقع غير متاح حالياً، ونرجع قريب</p>
          <a className="lp-btn lp-ghost lp-sm" href="?login=1">دخول الإدارة</a>
        </div>
      </div>
    );
  }

  const chalets = data.chalets || [];
  const capOk = (c: LandingChalet) => { const n = Number(c.cap || 0); return capF === "all" || (capF === "s" && n <= 15) || (capF === "m" && n > 15 && n <= 25) || (capF === "l" && n > 25); };
  const list = chalets.filter(capOk);
  const heroImg = chalets.map(firstImage).find(Boolean) || null;
  const heroChalet = chalets.find(c => firstImage(c) === heroImg);
  const ratingAvg = data.rating && data.rating.count > 0 ? data.rating.avg : null;
  const wa = waNumber(data.whatsapp || data.phone);

  return (
    <div className="lp" dir="rtl" ref={rootRef} onClick={onAnchor}>
      <style>{CSS}</style>
      {data.preview && (
        <div className="lp-preview"><I n="lock" s={16}/>معاينة: الصفحة غير منشورة، والزوار ما يشوفونها. انشرها من لوحة التحكم ← الموقع العام.</div>
      )}

      <header className="lp-top">
        <div className="lp-wrap lp-top-in">
          <a {...navLink("top")} style={{ textDecoration: "none" }} aria-label={data.name || "مجموعة ريتام"}><Brand data={data}/></a>
          <nav className={"lp-nav" + (menu ? " open" : "")} aria-label="أقسام الصفحة" onClick={() => setMenu(false)}>
            <a {...navLink("chalets")}>الشاليهات</a>
            <a {...navLink("about")}>من نحن</a>
            <a {...navLink("features")}>المميزات</a>
            <a {...navLink("how")}>طريقة الحجز</a>
            <a {...navLink("mybooking")}>حجزي</a>
          </nav>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {opened
              ? <a className="lp-btn lp-primary lp-sm lp-desk" href="#book">احجز {opened.name}</a>
              : <a className="lp-btn lp-primary lp-sm lp-desk" href="#chalets">احجز الآن</a>}
            <button className="lp-menu" type="button" aria-label="القائمة" aria-expanded={menu} onClick={() => setMenu(m => !m)}><I n="menu"/></button>
          </div>
        </div>
      </header>

      {opened ? (
        <main id="top">
          <ChaletPage key={opened.id} c={opened} data={data} onGo={go} onToast={setToast}/>
        </main>
      ) : (
      <main id="top">
        {/* الواجهة */}
        <section className="lp-hero">
          <div className="lp-hero-bg" aria-hidden="true" style={{ backgroundImage: `url("${CARVE}")` }}/>
          <div className="lp-wrap lp-hero-in">
            <div>
              <span className="lp-eyebrow">شاليهات خاصة في الأحساء</span>
              <h1 style={{ marginTop: 14 }}>بين النخيل،<br/><em>راحتك أقرب</em></h1>
              <p className="lp-lead">{data.tagline || "شاليهات عائلية بمسابح خاصة وتصميم يجمع روح الأحساء وراحة اليوم. احجز في دقائق، وتابع حجزك وطلباتك من جوالك."}</p>
              <div className="lp-ctas">
                <a className="lp-btn lp-primary" href="#chalets"><I n="cal"/>شوف الشاليهات واحجز</a>
                <a className="lp-btn lp-ghost" href="#mybooking"><I n="key"/>إدارة حجزي</a>
              </div>
              <div className="lp-stats">
                <div><b>{chalets.length}</b><span>{chalets.length === 1 ? "شاليه" : "شاليهات"}</span></div>
                {ratingAvg !== null && <div><b>{ratingAvg}</b><span>{"تقييم الضيوف من " + data.rating!.count}</span></div>}
                <div><b>من جوالك</b><span>حجز ومتابعة وطلبات</span></div>
              </div>
              <div style={{ marginTop: 22 }}><Socials data={data}/></div>
            </div>
            <div className="lp-arch-wrap">
              <div className="lp-arch">{heroImg ? <img src={heroImg} alt={heroChalet ? heroChalet.name : "شاليهات ريتام"}/> : <div className="lp-ph" style={{ backgroundImage: `url("${CARVE}")` }}/>}</div>
              {heroChalet && <div className="lp-arch-tag"><span className="lp-dot"><I n="pool"/></span><div><b>{heroChalet.name}</b><span>{(heroChalet.loc || "الأحساء") + " · مسبح خاص"}</span></div></div>}
            </div>
          </div>
        </section>

        <div className="lp-frond" aria-hidden="true" style={{ backgroundImage: `url("${FROND_BG}")` }}/>

        {/* الشاليهات */}
        <section id="chalets">
          <div className="lp-wrap">
            <div className="lp-sec-h"><span className="lp-eyebrow">شاليهاتنا</span><h2>اختر الشاليه اللي يناسب جمعتك</h2><p>كل شاليه بمسبح خاص ونظافة كاملة قبل وصولك.</p></div>
            {chalets.length > 3 && (
              <div className="lp-filters" role="group" aria-label="تصفية حسب السعة">
                {([["all", "الكل"], ["s", "حتى 15 شخص"], ["m", "16 إلى 25"], ["l", "أكثر من 25"]] as const).map(([k, l]) => (
                  <button key={k} className="lp-chip" type="button" aria-pressed={capF === k} onClick={() => setCapF(k)}>{l}</button>
                ))}
              </div>
            )}
            {list.length === 0 ? <p style={{ color: "var(--lp-muted)" }}>لا يوجد شاليه بهذه السعة حالياً</p> : (
              <div className="lp-grid">
                {list.map(c => <ChaletCard key={c.id} c={c} onGo={go}/>)}
              </div>
            )}
          </div>
        </section>

        {/* من نحن */}
        <section className="lp-about" id="about">
          <div className="lp-about-pat" aria-hidden="true" style={{ backgroundImage: `url("${CARVE}")` }}/>
          <div className="lp-wrap lp-about-in">
            <div className="lp-sec-h" style={{ marginBottom: 0 }}>
              <span className="lp-eyebrow">من نحن</span>
              <h2>ضيافة أحسائية، بمعايير اليوم</h2>
              {(data.about || "مجموعة ريتام شاليهات عائلية في الأحساء، بنيناها لتكون مكان تجتمع فيه العائلة والأصحاب براحة وخصوصية. نهتم بالتفاصيل: نظافة قبل كل وصول، مسبح جاهز على موعدك، وفريق يرد عليك بسرعة.\nوصممنا تجربة الحجز كلها لتكون من جوالك: تحجز، تستلم رابط الدخول، وتطلب اللي تحتاجه وأنت في الشاليه.")
                .split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="lp-values">
              <div className="lp-value"><b>الخصوصية</b><span>أسوار عالية ومسبح خاص لكل شاليه</span></div>
              <div className="lp-value"><b>النظافة</b><span>تنظيف وتعقيم كامل بعد كل حجز</span></div>
              <div className="lp-value"><b>السرعة</b><span>طلبك يوصل للفريق مباشرة ويرد عليك</span></div>
              <div className="lp-value"><b>الضيافة</b><span>تفاصيل أحسائية في المكان والاستقبال</span></div>
            </div>
          </div>
        </section>

        {/* المميزات */}
        <section id="features">
          <div className="lp-wrap">
            <div className="lp-sec-h lp-center-h"><span className="lp-eyebrow">ليش ريتام</span><h2>مميزات تحس فيها من أول دقيقة</h2></div>
            <div className="lp-features">
              {[
                ["pool", "مسبح خاص ومجهّز", "نجهّز المسبح على موعد وصولك، وتقدر تطلب تجهيزه مع رسالة الوصول."],
                ["temp", "مكيفات ذكية", "نشغّل التكييف قبل وصولك بحيث تدخل والمكان بارد وجاهز."],
                ["key", "دخول إلكتروني", "يوصلك رابط تسجيل الدخول والشروط على واتساب قبل الموعد."],
                ["sparkle", "نظافة بعد كل حجز", "فريق نظافة يتابع كل غرفة ويتأكد منها المشرف قبل استلامك."],
                ["msg", "طلباتك من جوالك", "مستلزمات أو نظافة أو صيانة؟ اطلبها من قسم حجزي وتوصل للفريق فوراً."],
                ["gift", "برنامج ولاء", "كل تقييم يعطيك تذكرة، و3 تذاكر تساوي ليلة مجانية."],
              ].map(([i, t, d]) => (
                <div key={t} className="lp-feature"><span className="lp-fic"><I n={i} s={26}/></span><h3>{t}</h3><p>{d}</p></div>
              ))}
            </div>
          </div>
        </section>

        {/* طريقة الحجز */}
        <section id="how" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <div className="lp-divider" aria-hidden="true"><span/><Frond/><span/></div>
            <div className="lp-sec-h lp-center-h"><span className="lp-eyebrow">طريقة الحجز</span><h2>أربع خطوات وتكون في الشاليه</h2></div>
            <div className="lp-steps">
              {[
                ["اختر الشاليه والتاريخ", "اضغط احجز على الشاليه واختر تاريخ الوصول والمغادرة."],
                ["أكّد بياناتك", "اكتب اسمك وجوالك، وحوّل المبلغ على الحساب البنكي."],
                ["يوصلك رابط الدخول", "بعد تأكيد التحويل نرسل لك الموقع والشروط ورابط تسجيل الدخول."],
                ["استمتع وقيّم", "اطلب اللي تحتاجه من قسم حجزي، وبعد الإقامة قيّم تجربتك."],
              ].map(([t, d], i) => (
                <div key={t} className="lp-step"><span className="lp-n">{i + 1}</span><h3>{t}</h3><p>{d}</p></div>
              ))}
            </div>
          </div>
        </section>

        {/* حجزي */}
        <section className="lp-portal" id="mybooking">
          <div className="lp-wrap">
            <div className="lp-sec-h lp-center-h"><span className="lp-eyebrow">حجزي</span><h2>تابع حجزك واطلب اللي تحتاجه</h2><p>اكتب رقم جوالك واسم عائلتك اللي حجزت فيه.</p></div>
            <Portal onToast={setToast} fallbackWa={wa}/>
          </div>
        </section>
      </main>
      )}

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div>
            <a {...navLink("top")} style={{ textDecoration: "none" }}><Brand data={data} dark/></a>
            <p style={{ marginTop: 16, maxWidth: 360 }}>شاليهات عائلية خاصة في الأحساء، بحجز سهل ومتابعة كاملة من جوالك.</p>
            <div style={{ marginTop: 18 }}><Socials data={data} light/></div>
          </div>
          <div><h4>روابط</h4><a {...navLink("chalets")}>الشاليهات</a><a {...navLink("features")}>المميزات</a><a {...navLink("how")}>طريقة الحجز</a><a {...navLink("mybooking")}>حجزي</a></div>
          <div><h4>تواصل معنا</h4>
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><I n="msg" s={18}/>واتساب</a>}
            {data.phone && <a href={`tel:${data.phone}`}><I n="phone" s={18}/><span className="lp-mono">{data.phone}</span></a>}
            {data.instagram && <a href={data.instagram} target="_blank" rel="noreferrer"><I n="insta" s={18}/>إنستقرام</a>}
            {data.tiktok && <a href={data.tiktok} target="_blank" rel="noreferrer"><I n="music" s={18}/>تيك توك</a>}
            {data.snapchat && <a href={data.snapchat} target="_blank" rel="noreferrer"><I n="snap" s={18}/>سناب شات</a>}
            {data.x && <a href={data.x} target="_blank" rel="noreferrer"><I n="xlogo" s={18}/>X</a>}
            <a href={data.location_url || "#"} target={data.location_url ? "_blank" : undefined} rel="noreferrer"><I n="pin" s={18}/>{data.location_text || "الأحساء، المملكة العربية السعودية"}</a>
          </div>
          <div className="lp-foot-bottom"><span>{"© " + new Date().getFullYear() + " " + (data.name || "مجموعة ريتام")}</span><a href="?login=1" style={{ display: "inline", padding: 0 }}>دخول الإدارة</a></div>
        </div>
      </footer>

      {toast && <div className="lp-toast" role="status"><I n="check"/>{toast}</div>}
    </div>
  );
}

/* ───────── بطاقة الشاليه ───────── */
function ChaletCard({ c, onGo }: { c: LandingChalet; onGo: (id: number | null, anchor?: string) => void }) {
  const img = firstImage(c);
  const am = amenityList(c.amenities);
  const n = galleryOf(c).length;
  const open = (e: React.MouseEvent, anchor?: string) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onGo(c.id, anchor); };
  return (
    <article className="lp-card">
      <a className="lp-card-img" href={chaletHref(c.id)} onClick={open} aria-label={"تفاصيل " + c.name}>
        {img ? <img src={img} alt={c.name} loading="lazy"/> : <div className="lp-ph" style={{ backgroundImage: `url("${CARVE}")` }}/>}
        {c.cap ? <span className="lp-badge"><I n="users" s={15}/>{"حتى " + c.cap + " شخص"}</span> : null}
        {n > 1 && <span className="lp-badge lp-badge-end"><I n="image" s={15}/>{n + " صورة"}</span>}
      </a>
      <div className="lp-card-body">
        <div className="lp-card-title">
          <div><h3><a href={chaletHref(c.id)} onClick={open} className="lp-card-link">{c.name}</a></h3><span className="lp-loc"><I n="pin" s={15}/>{(c.loc ? c.loc + "، " : "") + "الأحساء"}</span></div>
          {c.rating ? <span className="lp-rating"><svg viewBox="0 0 24 24" aria-hidden="true">{P.star}</svg>{c.rating}</span> : null}
        </div>
        {c.description && <p className="lp-desc">{c.description}</p>}
        {am.length > 0 && <div className="lp-feats">{am.map((t, i) => <span key={i}><I n={amenityIcon(t)} s={15}/>{t}</span>)}</div>}
        <div className="lp-price-row">
          <div className="lp-price"><b>{fmt(Number(c.price || 0))}</b> <small>ريال / الليلة</small>{c.wprice ? <span className="lp-wk">{"الويكند " + fmt(Number(c.wprice)) + " ريال"}</span> : null}</div>
          <a className="lp-btn lp-primary lp-sm" href={chaletHref(c.id)} onClick={open}>التفاصيل والحجز</a>
        </div>
      </div>
    </article>
  );
}

/* ───────── صفحة الشاليه ───────── */
function ChaletPage({ c, data, onGo, onToast }: { c: LandingChalet; data: LandingData; onGo: (id: number | null, anchor?: string) => void; onToast: (t: string) => void }) {
  const photos = useMemo(() => galleryOf(c), [c]);
  const amen = useMemo(() => amenityList(c.amenities, 40), [c.amenities]);
  const rooms = useMemo(() => {
    const m = new Map<string, Photo[]>();
    for (const p of photos) if (p.cat) { if (!m.has(p.cat)) m.set(p.cat, []); m.get(p.cat)!.push(p); }
    return [...m.entries()];
  }, [photos]);
  const [lb, setLb] = useState<{ list: Photo[]; i: number; title: string } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const hourlySlots = useMemo(() => hourlySlotsOf(c), [c]);
  const canOvernight = c.allow_overnight !== false;
  const canHourly = !!c.allow_hourly && hourlySlots.length > 0;
  const [bkMode, setBkMode] = useState<"overnight" | "hourly">(canOvernight ? "overnight" : "hourly");
  const [day, setDay] = useState("");
  const [slotIdx, setSlotIdx] = useState<number | null>(null);
  const others = (data.chalets || []).filter(x => x.id !== c.id).slice(0, 3);
  const booked = useMemo(() => (data.booked || []).filter(b => b.chalet === c.name), [data.booked, c.name]);
  const { nights, total } = priceFor(c, from, to);
  const slotTotal = bkMode === "hourly" && slotIdx !== null ? Number(hourlySlots[slotIdx]?.price || 0) : 0;
  const shown = photos.slice(0, 5);

  return (
    <>
      <section className="lp-cd">
        <div className="lp-wrap">
          <a className="lp-back" href={chaletHref(null) + "#chalets"} onClick={e => { e.preventDefault(); onGo(null, "chalets"); }}><I n="chevR" s={18}/>كل الشاليهات</a>
          <div className="lp-cd-head">
            <div>
              <h1>{c.name}</h1>
              <div className="lp-cd-meta">
                <span><I n="pin" s={17}/>{(c.loc ? c.loc + "، " : "") + "الأحساء"}</span>
                {c.cap ? <span><I n="users" s={17}/>{"حتى " + c.cap + " شخص"}</span> : null}
                {c.rating ? <span><svg className="lp-star" viewBox="0 0 24 24" aria-hidden="true">{P.star}</svg><b>{c.rating}</b>{" (" + (c.reviews || 0) + " تقييم)"}</span> : null}
              </div>
            </div>
            {photos.length > 0 && <button type="button" className="lp-btn lp-ghost lp-sm" onClick={() => setLb({ list: photos, i: 0, title: "كل الصور" })}><I n="grid" s={18}/>{"كل الصور (" + photos.length + ")"}</button>}
          </div>

          {photos.length > 0 ? (
            <div className="lp-gal" data-n={shown.length}>
              {photos.map((p, i) => (
                <button key={p.url} type="button" className={i >= 5 ? "lp-gal-x" : undefined} onClick={() => setLb({ list: photos, i, title: "كل الصور" })} aria-label={"عرض الصورة " + (i + 1)}>
                  <img src={p.url} alt={p.cat ? c.name + " - " + p.cat : c.name} loading={i < 3 ? "eager" : "lazy"}/>
                  {p.cat && <span className="lp-gal-cat">{p.cat}</span>}
                  {i === 4 && photos.length > 5 && <span className="lp-gal-plus">{"+" + (photos.length - 5)}<small>صورة</small></span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="lp-gal" data-n={1}><div className="lp-gal-empty" style={{ backgroundImage: `url("${CARVE}")` }}><span>الصور قريباً</span></div></div>
          )}

          <div className="lp-cd-grid">
            <div className="lp-cd-main">
              <div className="lp-facts lp-cd-facts">
                <div><small>السعة</small><b>{c.cap ? "حتى " + c.cap + " شخص" : "—"}</b></div>
                <div><small>الأيام العادية</small><b>{fmt(Number(c.price || 0)) + " ريال"}</b></div>
                <div><small>الجمعة والسبت</small><b>{fmt(Number(c.wprice || c.price || 0)) + " ريال"}</b></div>
                <div><small>تقييم الضيوف</small><b>{c.rating ? c.rating + " من 5" : "جديد"}</b></div>
              </div>

              {c.description && (
                <div className="lp-cd-sec">
                  <h2>عن الشاليه</h2>
                  {c.description.split("\n").filter(Boolean).map((t, i) => <p key={i} className="lp-cd-text">{t}</p>)}
                </div>
              )}

              {rooms.length > 0 && (
                <div className="lp-cd-sec">
                  <h2>المرافق</h2>
                  <p className="lp-cd-sub">اضغط على أي مرفق وشوف صوره</p>
                  <div className="lp-rooms">
                    {rooms.map(([cat, list]) => (
                      <button key={cat} type="button" className="lp-room" onClick={() => setLb({ list, i: 0, title: cat })}>
                        <span className="lp-room-img"><img src={list[0].url} alt={cat} loading="lazy"/></span>
                        <span className="lp-room-t"><b>{cat}</b><small>{list.length === 1 ? "صورة واحدة" : list.length + " صور"}</small></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {amen.length > 0 && (
                <div className="lp-cd-sec">
                  <h2>المميزات</h2>
                  <div className="lp-amen">
                    {amen.map((t, i) => <div key={i}><span className="ic"><I n={amenityIcon(t)} s={20}/></span>{t}</div>)}
                  </div>
                </div>
              )}

              <div className="lp-cd-sec" id="avail">
                <h2>الأيام المتاحة</h2>
                {canOvernight && canHourly && (
                  <div className="lp-modetog">
                    <button type="button" className={bkMode === "overnight" ? "sel" : undefined} onClick={() => setBkMode("overnight")}><I n="moon" s={16}/>مبيت</button>
                    <button type="button" className={bkMode === "hourly" ? "sel" : undefined} onClick={() => setBkMode("hourly")}><I n="clock" s={16}/>بالساعة</button>
                  </div>
                )}
                {bkMode === "overnight" ? (
                  <>
                    <p className="lp-cd-sub">اختر يوم الوصول ثم يوم المغادرة من التقويم</p>
                    <AvailCal c={c} booked={booked} from={from} to={to} onPick={(f, t) => { setFrom(f); setTo(t); }}/>
                  </>
                ) : (
                  <>
                    <p className="lp-cd-sub">اختر اليوم ثم الفترة المناسبة</p>
                    <HourlyPicker slots={hourlySlots} booked={booked} day={day} slotIdx={slotIdx} onPick={(d, i) => { setDay(d); setSlotIdx(i); }}/>
                  </>
                )}
              </div>
            </div>

            <aside className="lp-cd-aside" id="book">
              <BookingPanel chalet={c} data={data} booked={booked} from={from} to={to} setFrom={setFrom} setTo={setTo}
                bkMode={bkMode} canOvernight={canOvernight} canHourly={canHourly} hourlySlots={hourlySlots}
                day={day} slotIdx={slotIdx} onToast={onToast}/>
            </aside>
          </div>
        </div>
      </section>

      {others.length > 0 && (
        <section className="lp-cd-others">
          <div className="lp-wrap">
            <div className="lp-sec-h"><span className="lp-eyebrow">شاليهات ثانية</span><h2>يمكن يعجبك بعد</h2></div>
            <div className="lp-grid">{others.map(o => <ChaletCard key={o.id} c={o} onGo={onGo}/>)}</div>
          </div>
        </section>
      )}

      <div className="lp-mbar">
        <div>
          {bkMode === "hourly" && slotIdx !== null
            ? <><b>{fmt(slotTotal) + " ريال"}</b><small>{hourlySlots[slotIdx]?.name}</small></>
            : nights > 0
            ? <><b>{fmt(total) + " ريال"}</b><small>{nightsLabel(nights)}</small></>
            : <><b>{fmt(Number(c.price || 0)) + " ريال"}</b><small>لليلة</small></>}
        </div>
        <a className="lp-btn lp-primary" href="#book">{(nights > 0 || slotIdx !== null) ? "أكمل الحجز" : "اختر واحجز"}</a>
      </div>

      {lb && <Lightbox list={lb.list} start={lb.i} title={lb.title} name={c.name} onClose={() => setLb(null)}/>}
    </>
  );
}

/* ───────── عارض الصور ───────── */
function Lightbox({ list, start, title, name, onClose }: { list: Photo[]; start: number; title: string; name: string; onClose: () => void }) {
  const [i, setI] = useState(start);
  const n = list.length;
  const next = () => setI(x => (x + 1) % n);
  const prev = () => setI(x => (x - 1 + n) % n);
  const touch = useRef<number | null>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") next();   // اتجاه عربي: اليسار = التالي
      else if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [n]);
  useEffect(() => { thumbs.current?.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center" }); }, [i]);
  const p = list[i];
  return (
    <div className="lp-lb" role="dialog" aria-modal="true" aria-label={"صور " + name}>
      <div className="lp-lb-top">
        <div><b>{title}</b><span className="lp-mono">{(i + 1) + " / " + n}</span></div>
        <button className="lp-lb-x" type="button" aria-label="إغلاق" onClick={onClose}><I n="x"/></button>
      </div>
      <div className="lp-lb-stage"
        onTouchStart={e => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={e => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 40) (dx > 0 ? next() : prev()); }}>
        {n > 1 && <button className="lp-lb-nav lp-lb-prev" type="button" aria-label="السابقة" onClick={prev}><I n="chevR" s={26}/></button>}
        <img src={p.url} alt={p.cat ? name + " - " + p.cat : name}/>
        {n > 1 && <button className="lp-lb-nav lp-lb-next" type="button" aria-label="التالية" onClick={next}><I n="chevL" s={26}/></button>}
        {p.cat && title !== p.cat && <span className="lp-lb-cat">{p.cat}</span>}
      </div>
      {n > 1 && (
        <div className="lp-lb-thumbs" ref={thumbs}>
          {list.map((t, j) => <button key={t.url} type="button" className={j === i ? "on" : undefined} onClick={() => setI(j)} aria-label={"الصورة " + (j + 1)}><img src={t.url} alt="" loading="lazy"/></button>)}
        </div>
      )}
    </div>
  );
}

/* ───────── تقويم الأيام المتاحة ───────── */
const WEEK = ["سبت", "أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];
function bookedNightsOf(booked: { from: string; to: string }[]) {
  const s = new Set<string>();
  for (const b of booked) {
    if (b.from === b.to) { s.add(b.from); continue; } // حجز بالساعة ليوم واحد — يشغل ذلك اليوم بالتقويم
    const d = parseISO(b.from); const e = parseISO(b.to); let guard = 0; while (d < e && guard++ < 400) { s.add(toISO(d)); d.setDate(d.getDate() + 1); }
  }
  return s;
}
function rangeFree(nightsSet: Set<string>, from: string, to: string) {
  const d = parseISO(from); const e = parseISO(to);
  while (d < e) { if (nightsSet.has(toISO(d))) return false; d.setDate(d.getDate() + 1); }
  return true;
}
/* ───────── الحجز بالساعة (فترات محددة) ───────── */
function slotsTakenForDay(booked: { from: string; to: string; checkin_time?: string | null; checkout_time?: string | null }[], day: string, slots: HourlySlot[]) {
  const taken = new Set<number>();
  for (const b of booked) {
    if (b.from !== day || b.to !== day || !b.checkin_time) continue;
    const i = slots.findIndex(s => s.from === b.checkin_time && s.to === b.checkout_time);
    if (i >= 0) taken.add(i);
  }
  return taken;
}
function dayBookedOvernight(booked: { from: string; to: string }[], day: string) {
  const d = parseISO(day).getTime();
  return booked.some(b => { if (b.from === b.to) return false; const f = parseISO(b.from).getTime(), t = parseISO(b.to).getTime(); return d >= f && d < t; });
}
function AvailCal({ c, booked, from, to, onPick }: { c: LandingChalet; booked: { from: string; to: string }[]; from: string; to: string; onPick: (from: string, to: string) => void }) {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const [off, setOff] = useState(0);
  const taken = useMemo(() => bookedNightsOf(booked), [booked]);
  const today = toISO(now);
  const picking = !!from && !to;

  function click(iso: string) {
    if (picking && iso > from) {
      if (rangeFree(taken, from, iso)) { onPick(from, iso); return; }
    }
    if (iso < today || taken.has(iso)) return;
    onPick(iso, "");
  }
  function month(k: number) {
    const m = new Date(base.getFullYear(), base.getMonth() + off + k, 1);
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const lead = (m.getDay() + 1) % 7; // الأسبوع يبدأ السبت
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < lead; i++) cells.push(<span key={"e" + i}/>);
    for (let d = 1; d <= days; d++) {
      const iso = toISO(new Date(m.getFullYear(), m.getMonth(), d));
      const past = iso < today;
      const bk = taken.has(iso);
      const canEnd = picking && iso > from && rangeFree(taken, from, iso);
      const sel = iso === from || iso === to;
      const inR = !!from && !!to && iso > from && iso < to;
      const wk = [5, 6].includes(parseISO(iso).getDay()) && !!c.wprice;
      const disabled = past || (bk && !canEnd);
      const cls = "lp-day" + (past ? " past" : bk && !sel ? " bk" : "") + (wk ? " wk" : "") + (sel ? " sel" : inR ? " in" : "") + (canEnd ? " end" : "");
      cells.push(
        <button key={iso} type="button" className={cls} disabled={disabled} onClick={() => click(iso)}
          aria-label={dayName(iso) + (bk ? "، محجوز" : past ? "" : "، متاح " + fmt(nightPrice(c, iso)) + " ريال")} aria-pressed={sel || inR}>
          <span>{d}</span>
          {!past && <small>{iso === to ? "مغادرة" : iso === from && !to ? "وصول" : bk ? (canEnd ? "مغادرة" : "محجوز") : fmt(nightPrice(c, iso))}</small>}
        </button>
      );
    }
    return (
      <div className={"lp-cal-m" + (k === 1 ? " second" : "")} key={k}>
        <h4>{m.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" })}</h4>
        <div className="lp-cal-w">{WEEK.map(w => <span key={w}>{w}</span>)}</div>
        <div className="lp-cal-d">{cells}</div>
      </div>
    );
  }
  const { nights } = priceFor(c, from, to);
  return (
    <div className="lp-cal">
      <div className="lp-cal-nav">
        <button type="button" className="lp-x" aria-label="الشهر السابق" disabled={off === 0} onClick={() => setOff(o => Math.max(0, o - 1))}><I n="chevR"/></button>
        <span className="lp-cal-sum">
          {!from ? "اختر يوم الوصول" : !to ? "الوصول " + dayName(from) + " · اختر يوم المغادرة" : dayName(from) + " ← " + dayName(to) + " · " + nightsLabel(nights)}
        </span>
        <button type="button" className="lp-x" aria-label="الشهر التالي" disabled={off >= 11} onClick={() => setOff(o => Math.min(11, o + 1))}><I n="chevL"/></button>
      </div>
      <div className="lp-cal-months">{month(0)}{month(1)}</div>
      <div className="lp-legend">
        <span><i className="ok"/>متاح (السعر لليلة)</span>
        <span><i className="bk"/>محجوز</span>
        <span><i className="sel"/>اختيارك</span>
        {from && <button type="button" className="lp-link" onClick={() => onPick("", "")}>مسح الاختيار</button>}
      </div>
    </div>
  );
}

/* ───────── اختيار اليوم والفترة (حجز بالساعة) ───────── */
function HourlyPicker({ slots, booked, day, slotIdx, onPick }: {
  slots: HourlySlot[]; booked: { from: string; to: string; checkin_time?: string | null; checkout_time?: string | null }[];
  day: string; slotIdx: number | null; onPick: (day: string, slotIdx: number | null) => void;
}) {
  const today = toISO(new Date());
  const taken = useMemo(() => day ? slotsTakenForDay(booked, day, slots) : new Set<number>(), [booked, day, slots]);
  const fullyBooked = day ? dayBookedOvernight(booked, day) : false;
  return (
    <div className="lp-cal">
      <div className="lp-field"><label htmlFor="lp-hday">اليوم</label>
        <input className="lp-input" type="date" id="lp-hday" min={today} value={day} onChange={e => onPick(e.target.value, null)}/>
      </div>
      {!day ? (
        <p className="lp-cd-sub" style={{ marginTop: 12 }}>اختر اليوم أولاً عشان تشوف الفترات المتاحة</p>
      ) : fullyBooked ? (
        <div className="lp-err" style={{ marginTop: 12 }}>هذا اليوم محجوز بالكامل (مبيت)</div>
      ) : (
        <div className="lp-slots">
          {slots.map((s, i) => {
            const bk = taken.has(i);
            return (
              <button key={i} type="button" className={"lp-slot" + (slotIdx === i ? " sel" : "") + (bk ? " bk" : "")} disabled={bk} onClick={() => onPick(day, i)}>
                <b>{s.name}</b>
                <span>{s.from + " ← " + s.to}</span>
                <small>{bk ? "محجوزة" : fmt(Number(s.price || 0)) + " ريال"}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────── لوحة الحجز ───────── */
function BookingPanel({ chalet, data, booked, from, to, setFrom, setTo, bkMode, canOvernight, canHourly, hourlySlots, day, slotIdx, onToast }: {
  chalet: LandingChalet; data: LandingData; booked: { from: string; to: string; checkin_time?: string | null; checkout_time?: string | null }[];
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
  bkMode: "overnight" | "hourly"; canOvernight: boolean; canHourly: boolean; hourlySlots: HourlySlot[];
  day: string; slotIdx: number | null; onToast: (t: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: number; price: number; summary: string; waLine: string } | null>(null);
  const { nights, total } = useMemo(() => priceFor(chalet, from, to), [chalet, from, to]);
  const conflict = useMemo(() => !!from && !!to && booked.some(b => b.from < to && b.to > from), [booked, from, to]);
  const slot = bkMode === "hourly" && slotIdx !== null ? hourlySlots[slotIdx] : null;
  const slotTaken = useMemo(() => day && slotIdx !== null ? slotsTakenForDay(booked, day, hourlySlots).has(slotIdx) : false, [booked, day, slotIdx, hourlySlots]);
  const dayFull = useMemo(() => day ? dayBookedOvernight(booked, day) : false, [booked, day]);
  const wa = waNumber(data.whatsapp || data.phone);
  const today = toISO(new Date());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    let r: { ok: boolean; error?: string; id: number; price: number; nights?: number; slot?: string };
    setBusy(true);
    if (bkMode === "hourly") {
      if (!day) { setErr("اختر اليوم"); setBusy(false); return; }
      if (slotIdx === null) { setErr("اختر الفترة"); setBusy(false); return; }
      if (dayFull) { setErr("هذا اليوم محجوز بالكامل (مبيت)"); setBusy(false); return; }
      if (slotTaken) { setErr("هذي الفترة محجوزة، اختر فترة أخرى"); setBusy(false); return; }
      const res = await supabase.rpc("landing_create_booking", { p_chalet_id: chalet.id, p_name: name, p_phone: phone, p_from: day, p_to: null, p_slot_index: slotIdx });
      r = res.data; if (res.error || !r) { setBusy(false); setErr("صار خطأ في الاتصال، حاول مرة ثانية"); return; }
    } else {
      if (!from || !to) { setErr("اختر تاريخ الوصول والمغادرة من التقويم"); setBusy(false); return; }
      if (nights <= 0) { setErr("تاريخ المغادرة لازم يكون بعد الوصول"); setBusy(false); return; }
      if (conflict) { setErr("التواريخ المختارة محجوزة، اختر تواريخ ثانية"); setBusy(false); return; }
      const res = await supabase.rpc("landing_create_booking", { p_chalet_id: chalet.id, p_name: name, p_phone: phone, p_from: from, p_to: to });
      r = res.data; if (res.error || !r) { setBusy(false); setErr("صار خطأ في الاتصال، حاول مرة ثانية"); return; }
    }
    setBusy(false);
    if (!r.ok) { setErr(r.error || "تعذّر إتمام الحجز"); return; }
    const summary = bkMode === "hourly"
      ? chalet.name + " · " + (r.slot || "") + " · " + fmt(r.price) + " ريال"
      : chalet.name + " · " + nightsLabel(r.nights || 0) + " · " + fmt(r.price) + " ريال";
    const waLine = bkMode === "hourly" ? `اليوم ${day} — فترة ${r.slot || ""}` : `من ${from} إلى ${to}`;
    setDone({ id: r.id, price: r.price, summary, waLine });
    onToast("وصلنا طلب حجزك");
  }

  if (done) {
    const waMsg = encodeURIComponent(`السلام عليكم، حجزت ${chalet.name} من الموقع\nرقم الحجز: ${done.id}\n${done.waLine}\nالمبلغ: ${fmt(done.price)} ريال\nأرفقت لكم إيصال التحويل`);
    return (
      <div className="lp-book">
        <h3>تم استلام طلب حجزك</h3>
        <div className="lp-sent"><I n="check"/><div><b>{"رقم حجزك " + done.id}</b><span>{done.summary}</span></div></div>
        {(data.bank_iban || data.bank_name) && (
          <div className="lp-bank">
            <b>حوّل المبلغ على الحساب التالي</b>
            {data.bank_name && <div><small>البنك</small><span>{data.bank_name}</span></div>}
            {data.bank_account_name && <div><small>اسم صاحب الحساب</small><span>{data.bank_account_name}</span></div>}
            {data.bank_iban && <div><small>رقم الآيبان</small><span className="lp-mono" style={{ userSelect: "all" }}>{data.bank_iban}</span>
              <button type="button" className="lp-btn lp-ghost lp-sm" onClick={async () => { try { await navigator.clipboard.writeText(data.bank_iban || ""); onToast("تم نسخ رقم الآيبان"); } catch { /* */ } }}><I n="copy" s={16}/>نسخ</button></div>}
          </div>
        )}
        {wa && <a className="lp-btn lp-wa" href={`https://wa.me/${wa}?text=${waMsg}`} target="_blank" rel="noreferrer"><I n="msg"/>أرسل إيصال التحويل واتساب</a>}
        <p className="lp-hint">بعد تأكيد التحويل يوصلك تأكيد الحجز، وتقدر تتابعه من قسم "حجزي" بجوالك واسم عائلتك.</p>
      </div>
    );
  }

  return (
    <form className="lp-book" onSubmit={submit}>
      <div className="lp-book-h">
        <div className="lp-price"><b>{fmt(Number(chalet.price || 0))}</b> <small>ريال / الليلة</small></div>
        {chalet.wprice ? <span className="lp-wk">{"الجمعة والسبت " + fmt(Number(chalet.wprice)) + " ريال"}</span> : null}
      </div>
      {canOvernight && canHourly && (
        <p className="lp-hint" style={{ marginBottom: 2 }}>{bkMode === "hourly" ? "⏱ حجز بالساعة" : "🌙 حجز مبيت"}</p>
      )}
      {bkMode === "overnight" ? (
        <>
          <div className="lp-grid2">
            <div className="lp-field"><label htmlFor="lp-f1">الوصول</label><input className="lp-input" type="date" id="lp-f1" min={today} value={from} onChange={e => { const v = e.target.value; setFrom(v); if (v && to && v >= to) { const d = parseISO(v); d.setDate(d.getDate() + 1); setTo(toISO(d)); } }} required/></div>
            <div className="lp-field"><label htmlFor="lp-f2">المغادرة</label><input className="lp-input" type="date" id="lp-f2" min={from || today} value={to} onChange={e => setTo(e.target.value)} required/></div>
          </div>
          {conflict && <div className="lp-err">هذي التواريخ محجوزة لهذا الشاليه، جرّب تواريخ ثانية</div>}
        </>
      ) : (
        <>
          <div className="lp-total"><span>اليوم والفترة</span><b>{day ? dayName(day) : "—"}{slot ? " · " + slot.name : ""}</b></div>
          {day && dayFull && <div className="lp-err">هذا اليوم محجوز بالكامل (مبيت)</div>}
          {day && !dayFull && slotIdx === null && <div className="lp-hint">اختر الفترة من قائمة "الأيام المتاحة"</div>}
          {slotTaken && <div className="lp-err">هذي الفترة محجوزة، اختر فترة أخرى</div>}
        </>
      )}
      <div className="lp-field"><label htmlFor="lp-f3">الاسم الكامل</label><input className="lp-input" id="lp-f3" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: خالد العتيبي" autoComplete="name" required/></div>
      <div className="lp-field"><label htmlFor="lp-f4">رقم الجوال</label><input className="lp-input lp-mono" id="lp-f4" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="05XXXXXXXX" autoComplete="tel" style={{ textAlign: "right" }} required/></div>
      <div className="lp-total"><span>{bkMode === "hourly" ? (slot ? slot.name : "اختر الفترة") : (nights > 0 ? nightsLabel(nights) : "اختر التواريخ")}</span><b>{fmt(bkMode === "hourly" ? Number(slot?.price || 0) : total) + " ريال"}</b></div>
      {err && <div className="lp-err" role="alert">{err}</div>}
      <button className="lp-btn lp-primary" type="submit" disabled={busy || conflict || (bkMode === "hourly" && (!day || slotIdx === null || slotTaken || dayFull))} style={{ width: "100%" }}>{busy ? "جاري الإرسال..." : "تأكيد طلب الحجز"}</button>
      <p className="lp-hint" style={{ textAlign: "center" }}>الحجز يتأكد بعد استلام التحويل البنكي</p>
    </form>
  );
}

/* ───────── بوابة حجزي ───────── */
const SUPPLIES: [string, string][] = [["towel", "مناشف"], ["water", "مياه شرب"], ["coal", "فحم"], ["cup", "أكواب وأدوات قهوة"], ["plate", "صحون وأدوات مطبخ"], ["bed", "مفارش"], ["soap", "صابون وشامبو"], ["tissue", "مناديل"]];
const CLEANING: [string, string][] = [["broom", "تنظيف عام"], ["water", "دورات المياه"], ["pool", "المسبح"], ["box", "رفع النفايات"], ["bug", "حشرات"]];
const MAINT: [string, string][] = [["temp", "المكيف"], ["water", "السباكة والمياه"], ["bolt", "الكهرباء والإنارة"], ["pool", "المسبح"], ["door", "الأبواب والأقفال"]];

function Portal({ onToast, fallbackWa }: { onToast: (t: string) => void; fallbackWa: string }) {
  const [phone, setPhone] = useState(store.get("lp_phone") || "");
  const [family, setFamily] = useState(store.get("lp_family") || "");
  const [bk, setBk] = useState<GuestBooking | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"supplies" | "cleaning" | "maintenance" | "review" | "details">("supplies");
  const [picks, setPicks] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("الآن");
  const [stars, setStars] = useState(0);
  const [sending, setSending] = useState(false);

  async function lookup(ph = phone, fam = family, silent = false) {
    if (!silent) { setErr(""); setBusy(true); }
    const { data, error } = await supabase.rpc("landing_guest_booking", { p_phone: ph, p_family: fam });
    if (!silent) setBusy(false);
    if (error) { if (!silent) setErr("صار خطأ في الاتصال، حاول مرة ثانية"); return; }
    if (!data?.ok) { if (!silent) setErr("ما لقينا حجز بهذا الجوال واسم العائلة. تأكد من الرقم اللي حجزت فيه واسم العائلة، أو تواصل معنا."); setBk(null); return; }
    setBk(data as GuestBooking);
    store.set("lp_phone", ph); store.set("lp_family", fam);
  }
  useEffect(() => { if (phone && family) lookup(phone, family, true); }, []);

  function logout() { store.del("lp_phone"); store.del("lp_family"); setBk(null); setPhone(""); setFamily(""); setPicks([]); setNote(""); setStars(0); setTab("supplies"); }
  function toggle(v: string) { setPicks(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]); }

  async function sendRequest() {
    if (!bk || !picks.length) return;
    setSending(true);
    const items = picks.join("، ") + (tab === "cleaning" ? " (الوقت: " + when + ")" : "");
    const { data, error } = await supabase.rpc("landing_guest_request", { p_booking: bk.id, p_phone: phone, p_kind: tab, p_items: items, p_note: note });
    setSending(false);
    if (error || !data?.ok) { onToast(data?.error || "تعذّر إرسال الطلب، حاول مرة ثانية"); return; }
    setPicks([]); setNote("");
    onToast("وصل طلبك للفريق، وبنبلغك أول ما يتم");
    lookup(phone, family, true);
  }
  async function sendReview() {
    if (!bk || !stars) return;
    setSending(true);
    const { data, error } = await supabase.rpc("landing_guest_review", { p_booking: bk.id, p_phone: phone, p_rating: stars, p_comment: note });
    setSending(false);
    if (error || !data?.ok) { onToast(data?.error || "تعذّر إرسال التقييم"); return; }
    setNote(""); onToast("شكراً على تقييمك");
    lookup(phone, family, true);
  }

  return (
    <div className="lp-portal-card">
      <div className="lp-portal-head">
        <span className="lp-pic"><I n="key" s={26}/></span>
        <div><h3>{bk ? "أهلاً " + bk.guest.split(" ")[0] : "الدخول إلى حجزي"}</h3><p>{bk ? "حجزك في " + bk.chalet : "بدون كلمة مرور، فقط جوالك واسم العائلة"}</p></div>
      </div>
      <div className="lp-portal-body">
        {!bk ? (
          <>
            <form className="lp-form" onSubmit={e => { e.preventDefault(); lookup(); }}>
              <div className="lp-field"><label htmlFor="lp-p1">رقم الجوال</label><input className="lp-input lp-mono" id="lp-p1" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="05XXXXXXXX" autoComplete="tel" style={{ textAlign: "right" }} required/></div>
              <div className="lp-field"><label htmlFor="lp-p2">اسم العائلة</label><input className="lp-input" id="lp-p2" value={family} onChange={e => setFamily(e.target.value)} placeholder="مثال: العتيبي" autoComplete="family-name" required/></div>
              <button className="lp-btn lp-primary" type="submit" disabled={busy}><I n="search"/>{busy ? "جاري البحث..." : "عرض حجزي"}</button>
            </form>
            {err && <div className="lp-err" role="alert" style={{ marginTop: 14 }}>{err}</div>}
          </>
        ) : (
          <div className="lp-bk">
            <div className="lp-bk-top">
              <div><h4>{bk.chalet}</h4><span>{dayName(bk.date_from) + " ← " + dayName(bk.date_to) + " · " + bk.nights + (bk.nights === 1 ? " ليلة" : " ليالٍ")}</span></div>
              <span className={"lp-pill " + (bk.status === "confirmed" ? "ok" : bk.status === "pending" ? "warn" : "muted")}><span className="d"/>{bk.status === "confirmed" ? "مؤكد" : bk.status === "pending" ? "بانتظار تأكيد التحويل" : "مكتمل"}</span>
            </div>
            <div className="lp-facts">
              <div><small>الدخول</small><b>{bk.checkin_time || "حسب التعليمات"}</b></div>
              <div><small>الخروج</small><b>{bk.checkout_time || "حسب التعليمات"}</b></div>
              <div><small>الإجمالي</small><b>{fmt(bk.price) + " ريال"}</b></div>
              <div><small>بطاقة الولاء</small><b>{bk.free_nights > 0 ? bk.free_nights + " ليلة مجانية" : bk.tickets + " من 3 تذاكر"}</b></div>
            </div>
            <div className="lp-tabs" role="tablist">
              {([["supplies", "box", "مستلزمات"], ["cleaning", "broom", "نظافة"], ["maintenance", "wrench", "صيانة"], ["review", "star", "تقييم"], ["details", "cal", "تفاصيل الحجز"]] as const).map(([k, i, l]) => (
                <button key={k} type="button" role="tab" className="lp-tab" aria-selected={tab === k} onClick={() => { setTab(k); setPicks([]); setNote(""); }}><I n={i} s={18}/>{l}</button>
              ))}
            </div>

            {(tab === "supplies" || tab === "cleaning" || tab === "maintenance") && (
              bk.stage === "after" ? <p className="lp-muted">انتهت إقامتك، ونتمنى نشوفك قريب. تقدر تقيّم تجربتك من تبويب التقييم.</p> : (
              <div className="lp-panel">
                <p className="lp-muted">{tab === "supplies" ? "وش ينقصك؟ اختر واحد أو أكثر ونوصله لك." : tab === "cleaning" ? "اختر نوع التنظيف والوقت المناسب، ويجيك العامل." : "فيه شي خربان أو ما يشتغل؟ اختر واكتب لنا ونرسل الفني."}</p>
                <div className="lp-opts">
                  {(tab === "supplies" ? SUPPLIES : tab === "cleaning" ? CLEANING : MAINT).map(([i, l]) => (
                    <button key={l} type="button" className="lp-opt" aria-pressed={picks.includes(l)} onClick={() => toggle(l)}><I n={i} s={22}/>{l}</button>
                  ))}
                </div>
                {tab === "cleaning" && (
                  <div className="lp-field"><label htmlFor="lp-when">الوقت المناسب</label>
                    <select className="lp-input" id="lp-when" value={when} onChange={e => setWhen(e.target.value)}>{["الآن", "بعد ساعة", "العصر", "المغرب", "قبل الخروج"].map(w => <option key={w}>{w}</option>)}</select>
                  </div>
                )}
                <div className="lp-field"><label htmlFor="lp-note">{tab === "maintenance" ? "وصف المشكلة" : "ملاحظة (اختياري)"}</label>
                  <textarea className="lp-input" id="lp-note" value={note} onChange={e => setNote(e.target.value)} placeholder={tab === "maintenance" ? "مثال: مكيف الغرفة الثانية ما يبرد" : tab === "supplies" ? "مثال: 6 مناشف للمسبح" : ""}/>
                </div>
                <div><button className="lp-btn lp-primary" type="button" disabled={!picks.length || sending} onClick={sendRequest}>{sending ? "جاري الإرسال..." : (tab === "maintenance" ? "إرسال البلاغ" : tab === "cleaning" ? "طلب التنظيف" : "إرسال الطلب") + (picks.length ? " (" + picks.length + ")" : "")}</button></div>
              </div>)
            )}
            {(tab === "supplies" || tab === "cleaning" || tab === "maintenance") && bk.requests.length > 0 && (
              <div className="lp-timeline">
                <b style={{ fontSize: 15 }}>طلباتك</b>
                {bk.requests.map((r, i) => (
                  <div key={i} className={"lp-tl" + (r.resolved ? " done" : "")}><span className="dot"/><div><b>{r.type + ": " + r.note}</b><span>{r.resolved ? "تم" : "وصل للفريق · قيد التنفيذ"}</span></div></div>
                ))}
              </div>
            )}

            {tab === "review" && (
              bk.reviewed ? <div className="lp-sent"><I n="check"/><div><b>شكراً على تقييمك</b><span>تقييمك يساعدنا نخدمك أفضل، وأضفنا لك تذكرة في بطاقة الولاء.</span></div></div>
              : bk.stage === "before" ? <p className="lp-muted">التقييم يفتح بعد وصولك للشاليه.</p>
              : (
                <div className="lp-panel">
                  <p className="lp-muted">{"كيف كانت إقامتك في " + bk.chalet + "؟"}</p>
                  <div className="lp-stars" role="radiogroup" aria-label="التقييم">
                    {[1, 2, 3, 4, 5].map(i => (
                      <button key={i} type="button" role="radio" aria-checked={stars === i} aria-label={i + " من 5"} className={i <= stars ? "on" : ""} onClick={() => setStars(i)}><svg viewBox="0 0 24 24" aria-hidden="true">{P.star}</svg></button>
                    ))}
                  </div>
                  <div className="lp-field"><label htmlFor="lp-rv">تعليقك (اختياري)</label><textarea className="lp-input" id="lp-rv" value={note} onChange={e => setNote(e.target.value)} placeholder="وش عجبك؟ وش نحسّن؟"/></div>
                  <div><button className="lp-btn lp-primary" type="button" disabled={!stars || sending} onClick={sendReview}>{sending ? "جاري الإرسال..." : "إرسال التقييم"}</button></div>
                </div>
              )
            )}

            {tab === "details" && (
              <div className="lp-panel">
                <div className="lp-timeline">
                  <div className={"lp-tl" + (bk.status !== "pending" ? " done" : "")}><span className="dot"/><div><b>{bk.status === "pending" ? "بانتظار تأكيد التحويل" : "تم تأكيد الحجز"}</b><span>{bk.status === "pending" ? "أرسل إيصال التحويل واتساب لتأكيد حجزك" : "استلمنا المبلغ"}</span></div></div>
                  <div className={"lp-tl" + (bk.stage !== "before" ? " done" : "")}><span className="dot"/><div><b>الدخول</b><span>{dayName(bk.date_from) + (bk.checkin_time ? " · " + bk.checkin_time : "")}</span></div></div>
                  <div className={"lp-tl" + (bk.stage === "after" ? " done" : "")}><span className="dot"/><div><b>الخروج</b><span>{dayName(bk.date_to) + (bk.checkout_time ? " · " + bk.checkout_time : "")}</span></div></div>
                </div>
                <div className="lp-row">
                  {bk.map_url && <a className="lp-btn lp-ghost lp-sm" href={bk.map_url} target="_blank" rel="noreferrer"><I n="pin" s={18}/>موقع الشاليه</a>}
                  <a className="lp-btn lp-ghost lp-sm" href={`?guest=1&m=loyalty&phone=${encodeURIComponent(phone)}`}><I n="gift" s={18}/>بطاقة الولاء</a>
                </div>
                {bk.terms && <details className="lp-terms"><summary>الشروط والتعليمات</summary><p>{bk.terms}</p></details>}
              </div>
            )}

            <div className="lp-row" style={{ borderTop: "1px solid var(--lp-line)", paddingTop: 18 }}>
              {(waNumber(bk.whatsapp) || fallbackWa) && <a className="lp-btn lp-wa lp-sm" href={`https://wa.me/${waNumber(bk.whatsapp) || fallbackWa}?text=${encodeURIComponent("السلام عليكم، بخصوص حجزي رقم " + bk.id + " في " + bk.chalet)}`} target="_blank" rel="noreferrer"><I n="msg" s={18}/>تواصل معنا واتساب</a>}
              <button className="lp-btn lp-ghost lp-sm" type="button" onClick={logout}>خروج من حجزي</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── التنسيق ───────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
.lp{
  --lp-sand:#F4ECDF; --lp-sand-2:#EADFCB; --lp-paper:#FFFBF4; --lp-line:#E3D5BE;
  --lp-ink:#2A1E14; --lp-ink-2:#5E4E3E; --lp-muted:#857360;
  --lp-espresso:#3B2A1C; --lp-palm:#2F5240; --lp-palm-2:#E3EDE5; --lp-gold:#C29A5B; --lp-gold-2:#F3E6CF; --lp-clay:#B4643C;
  --lp-ok:#1E6B45; --lp-ok-bg:#E3F1E8; --lp-warn:#8A5A00; --lp-warn-bg:#FBEFD2; --lp-bad:#A3311F; --lp-bad-bg:#FBE4DF;
  --lp-display:'Reem Kufi','Noto Kufi Arabic',Tahoma,sans-serif;
  --lp-body:'IBM Plex Sans Arabic',system-ui,'Segoe UI',Tahoma,sans-serif;
  background:var(--lp-sand);color:var(--lp-ink);font-family:var(--lp-body);font-size:16px;line-height:1.7;color-scheme:light;
  position:fixed;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;
}
@media (prefers-reduced-motion: reduce){.lp{scroll-behavior:auto}}
html,body{background:#F4ECDF;margin:0}
.lp *,.lp *::before,.lp *::after{box-sizing:border-box}
.lp h1,.lp h2,.lp h3,.lp h4{font-family:var(--lp-display);font-weight:700;line-height:1.3;margin:0;text-wrap:balance}
.lp p{margin:0}
.lp a{color:var(--lp-palm)}
.lp button{font-family:inherit;cursor:pointer}
.lp :focus-visible{outline:2px solid var(--lp-gold);outline-offset:3px}
.lp-i{flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.lp-mono{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
.lp-muted{color:var(--lp-ink-2)}
.lp-center{min-height:100%;display:flex;align-items:center;justify-content:center;color:var(--lp-muted)}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}.lp *{transition:none!important}}

.lp [id]{scroll-margin-top:84px}
.lp-wrap{max-width:1180px;margin:0 auto;padding-left:max(18px,env(safe-area-inset-left,0px));padding-right:max(18px,env(safe-area-inset-right,0px))}
.lp section{padding-block:88px}
.lp-eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:var(--lp-clay)}
.lp-eyebrow::before{content:"";width:22px;height:2px;background:currentColor;border-radius:2px}
.lp-sec-h{display:flex;flex-direction:column;gap:12px;max-width:640px;margin-bottom:40px}
.lp-sec-h h2{font-size:clamp(28px,4vw,40px);color:var(--lp-espresso)}
.lp-sec-h p{color:var(--lp-ink-2);font-size:17px}
.lp-center-h{text-align:center;margin-inline:auto;align-items:center}
.lp-preview{display:flex;align-items:center;justify-content:center;gap:8px;background:#FBEFD2;color:#6E4A00;font-size:14px;padding:10px 16px;text-align:center}

.lp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 22px;border-radius:999px;border:1.5px solid transparent;font-size:16px;font-weight:600;text-decoration:none;white-space:nowrap;transition:transform .15s,background .15s}
.lp-btn:active{transform:scale(.98)}
.lp-btn:disabled{opacity:.5;cursor:not-allowed}
.lp-primary{background:var(--lp-espresso);color:#FFF6E8!important}
.lp-primary:hover{background:#2A1E14}
.lp-ghost{background:transparent;border-color:var(--lp-espresso);color:var(--lp-espresso)!important}
.lp-wa{background:#1F8A4C;color:#fff!important}
.lp-sm{min-height:40px;padding:0 16px;font-size:14px}
.lp-frond{height:28px;background-repeat:repeat-x;background-position:center}
.lp-divider{display:flex;align-items:center;justify-content:center;gap:14px;margin:0 auto 48px}
.lp-divider span{height:1px;width:80px;background:var(--lp-gold);opacity:.5}

.lp-top{position:sticky;top:0;z-index:40;background:rgba(244,236,223,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--lp-line);padding-top:env(safe-area-inset-top,0px)}
.lp-top-in{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:72px;position:relative}
.lp-logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--lp-espresso)!important}
.lp-logo-mark{width:42px;height:42px;border-radius:12px;background:var(--lp-espresso);color:var(--lp-gold);display:inline-flex;align-items:center;justify-content:center}
.lp-logo-img{width:46px;height:46px;object-fit:contain;border-radius:12px;flex:none}
.lp-socials{display:flex;gap:8px;flex-wrap:wrap}
.lp-socials a{width:42px;height:42px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:var(--lp-paper);border:1px solid var(--lp-line);color:var(--lp-espresso)!important;padding:0!important}
.lp-socials a:hover{background:var(--lp-espresso);color:#FFF6E8!important}
.lp-socials.light a{background:rgba(255,255,255,.06);border-color:rgba(205,187,164,.25);color:#E9DCC8!important}
.lp-logo b{font-family:var(--lp-display);font-size:20px;display:block;line-height:1.1}
.lp-logo small{font-size:12px;color:var(--lp-muted)}
.lp-nav{display:flex;gap:4px;align-items:center}
.lp-nav a{color:var(--lp-ink-2);text-decoration:none;font-size:15px;font-weight:500;padding:8px 12px;border-radius:999px}
.lp-nav a:hover{background:var(--lp-sand-2);color:var(--lp-ink)}
.lp-menu{display:none;width:44px;height:44px;border-radius:12px;border:1px solid var(--lp-line);background:var(--lp-paper);color:var(--lp-espresso);align-items:center;justify-content:center}
@media (max-width:900px){
  .lp-nav{display:none;position:absolute;top:100%;inset-inline:-18px;flex-direction:column;align-items:stretch;background:var(--lp-paper);border-bottom:1px solid var(--lp-line);padding:10px 18px 18px;gap:2px}
  .lp-nav.open{display:flex}
  .lp-nav a{padding:12px}
  .lp-menu{display:inline-flex}
  .lp-desk{display:none!important}
}

.lp-hero{padding-block:56px 72px!important;position:relative;overflow:hidden}
.lp-hero-bg{position:absolute;inset:0;opacity:.18;pointer-events:none;background-repeat:repeat}
.lp-hero-in{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;position:relative}
.lp-hero h1{font-size:clamp(36px,6vw,64px);color:var(--lp-espresso)}
.lp-hero h1 em{font-style:normal;color:var(--lp-palm)}
.lp-lead{font-size:clamp(17px,2vw,19px);color:var(--lp-ink-2);margin-top:18px!important;max-width:520px}
.lp-ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.lp-stats{display:flex;flex-wrap:wrap;gap:28px;margin-top:40px;padding-top:24px;border-top:1px solid var(--lp-line)}
.lp-stats b{font-family:var(--lp-display);font-size:26px;color:var(--lp-espresso);display:block;line-height:1.2}
.lp-stats span{font-size:14px;color:var(--lp-muted)}
.lp-arch-wrap{position:relative;max-width:460px;margin-inline:auto;width:100%}
.lp-arch-wrap::before{content:"";position:absolute;inset:-14px -14px 14px 14px;border:1.5px solid var(--lp-gold);border-radius:999px 999px 28px 28px;opacity:.7}
.lp-arch{position:relative;aspect-ratio:4/5;max-width:100%;border-radius:999px 999px 24px 24px;overflow:hidden;background:var(--lp-espresso);box-shadow:0 30px 60px -20px rgba(42,30,20,.35)}
.lp-arch img{width:100%;height:100%;object-fit:cover;display:block}
.lp-ph{position:absolute;inset:0;background-repeat:repeat;background-position:center;opacity:.5}
.lp-arch-tag{position:absolute;bottom:22px;inset-inline-start:-18px;background:var(--lp-paper);border-radius:16px;padding:12px 16px;box-shadow:0 14px 30px -12px rgba(42,30,20,.3);display:flex;align-items:center;gap:12px}
.lp-dot{width:40px;height:40px;border-radius:12px;background:var(--lp-palm-2);color:var(--lp-palm);display:flex;align-items:center;justify-content:center}
.lp-arch-tag b{display:block;font-size:15px}
.lp-arch-tag span{font-size:13px;color:var(--lp-muted)}
@media (max-width:900px){.lp-hero-in{grid-template-columns:1fr;gap:40px}.lp-arch-wrap{max-width:340px}.lp-arch-tag{inset-inline-start:0}}

.lp-filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
.lp-chip{border:1.5px solid var(--lp-line);background:var(--lp-paper);color:var(--lp-ink-2);min-height:40px;padding:0 16px;border-radius:999px;font-size:14px;font-weight:500}
.lp-chip[aria-pressed="true"]{background:var(--lp-espresso);border-color:var(--lp-espresso);color:#FFF6E8}
.lp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:24px}
.lp-card{background:var(--lp-paper);border-radius:24px;overflow:hidden;border:1px solid var(--lp-line);display:flex;flex-direction:column;transition:transform .2s,box-shadow .2s}
.lp-card:hover{transform:translateY(-4px);box-shadow:0 24px 40px -24px rgba(42,30,20,.35)}
.lp-card-img{position:relative;aspect-ratio:16/11;background:var(--lp-espresso);overflow:hidden}
.lp-card-img img{width:100%;height:100%;object-fit:cover;display:block}
.lp-badge{position:absolute;top:14px;inset-inline-start:14px;background:rgba(255,251,244,.94);color:var(--lp-espresso);font-size:13px;font-weight:600;padding:5px 12px;border-radius:999px;display:inline-flex;align-items:center;gap:6px}
.lp-card-body{padding:20px 22px 22px;display:flex;flex-direction:column;gap:12px;flex:1}
.lp-card-title{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.lp-card-title h3{font-size:22px;color:var(--lp-espresso)}
.lp-loc{display:flex;align-items:center;gap:4px;font-size:14px;color:var(--lp-muted)}
.lp-rating{display:inline-flex;align-items:center;gap:4px;font-size:14px;font-weight:600;color:var(--lp-ink-2);white-space:nowrap}
.lp-rating svg{width:16px;height:16px;fill:var(--lp-gold)}
.lp-desc{font-size:14px;color:var(--lp-ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lp-feats{display:flex;flex-wrap:wrap;gap:6px}
.lp-feats span{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--lp-ink-2);background:var(--lp-sand);padding:4px 10px;border-radius:999px}
.lp-price-row{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:auto;padding-top:14px;border-top:1px dashed var(--lp-line)}
.lp-price b{font-family:var(--lp-display);font-size:26px;color:var(--lp-espresso)}
.lp-price small{font-size:13px;color:var(--lp-muted)}
.lp-wk{display:block;font-size:13px;color:var(--lp-muted)}

.lp-about{background:var(--lp-espresso);color:#F4E8D6;position:relative;overflow:hidden}
.lp-about-pat{position:absolute;inset:0;opacity:.09;pointer-events:none;background-repeat:repeat}
.lp-about-in{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;position:relative}
.lp-about h2{color:#FFF6E8!important}
.lp-about .lp-sec-h p{color:#D8C7B0}
.lp-about .lp-eyebrow{color:var(--lp-gold)}
.lp-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.lp-value{border:1px solid rgba(194,154,91,.35);border-radius:20px;padding:22px;display:flex;flex-direction:column;gap:8px}
.lp-value b{font-family:var(--lp-display);font-size:20px;color:var(--lp-gold)}
.lp-value span{font-size:15px;color:#D8C7B0}
@media (max-width:900px){.lp-about-in{grid-template-columns:1fr;gap:32px}}
@media (max-width:480px){.lp-values{grid-template-columns:1fr}}

.lp-features{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:18px}
.lp-feature{background:var(--lp-paper);border:1px solid var(--lp-line);border-radius:22px;padding:26px;display:flex;flex-direction:column;gap:12px}
.lp-fic{width:52px;height:52px;border-radius:16px 16px 16px 4px;display:flex;align-items:center;justify-content:center;background:var(--lp-palm-2);color:var(--lp-palm)}
.lp-feature:nth-child(3n+2) .lp-fic{background:var(--lp-gold-2);color:#8A6326}
.lp-feature:nth-child(3n) .lp-fic{background:#F6E2D6;color:var(--lp-clay)}
.lp-feature h3{font-size:20px;color:var(--lp-espresso)}
.lp-feature p{color:var(--lp-ink-2);font-size:15px}

.lp-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.lp-step{display:flex;flex-direction:column;gap:12px;padding:26px 22px;background:var(--lp-paper);border-radius:22px;border:1px solid var(--lp-line)}
.lp-n{width:48px;height:56px;display:flex;align-items:center;justify-content:center;font-family:var(--lp-display);font-size:22px;color:#FFF6E8;background:var(--lp-palm);border-radius:999px 999px 10px 10px}
.lp-step h3{font-size:19px;color:var(--lp-espresso)}
.lp-step p{font-size:15px;color:var(--lp-ink-2)}
@media (max-width:900px){.lp-steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.lp-steps{grid-template-columns:1fr}}

.lp-portal{background:var(--lp-sand-2)}
.lp-portal-card{background:var(--lp-paper);border-radius:28px;border:1px solid var(--lp-line);box-shadow:0 30px 60px -30px rgba(42,30,20,.3);overflow:hidden;max-width:880px;margin:0 auto}
.lp-portal-head{background:var(--lp-palm);color:#F1F6F2;padding:28px 32px;display:flex;align-items:center;gap:16px}
.lp-portal-head h3{font-size:24px;color:#fff}
.lp-portal-head p{font-size:15px;opacity:.85}
.lp-pic{width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;flex:none}
.lp-portal-body{padding:28px 32px 32px}
.lp-form{display:grid;grid-template-columns:1fr 1fr auto;gap:14px;align-items:end}
.lp-field{display:flex;flex-direction:column;gap:6px}
.lp-field label{font-size:14px;font-weight:600;color:var(--lp-ink-2)}
.lp-input{min-height:50px;border-radius:14px;border:1.5px solid var(--lp-line);background:#fff;padding:0 16px;font:inherit;font-size:16px;color:var(--lp-ink);width:100%}
.lp-input:focus{border-color:var(--lp-gold);outline:none;box-shadow:0 0 0 4px rgba(194,154,91,.18)}
textarea.lp-input{min-height:90px;padding:12px 16px;resize:vertical}
.lp-hint{font-size:13px;color:var(--lp-muted)}
.lp-err{background:var(--lp-bad-bg);color:var(--lp-bad);padding:12px 16px;border-radius:12px;font-size:15px}
@media (max-width:700px){.lp-form{grid-template-columns:1fr}.lp-portal-head,.lp-portal-body{padding-left:20px;padding-right:20px}}
.lp-bk{display:flex;flex-direction:column;gap:22px}
.lp-bk-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:14px}
.lp-bk-top h4{font-size:24px;color:var(--lp-espresso)}
.lp-bk-top span{color:var(--lp-muted);font-size:15px}
.lp-pill{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 12px;border-radius:999px;font-size:14px;font-weight:600}
.lp-pill.ok{background:var(--lp-ok-bg);color:var(--lp-ok)} .lp-pill.warn{background:var(--lp-warn-bg);color:var(--lp-warn)} .lp-pill.muted{background:var(--lp-sand);color:var(--lp-ink-2)}
.lp-pill .d{width:7px;height:7px;border-radius:50%;background:currentColor}
.lp-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.lp-facts div{background:var(--lp-sand);border-radius:14px;padding:12px 14px;min-width:0}
.lp-facts small{display:block;font-size:13px;color:var(--lp-muted)}
.lp-facts b{font-size:15px}
@media (max-width:700px){.lp-facts{grid-template-columns:repeat(2,minmax(0,1fr))}}
.lp-tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--lp-line);padding-bottom:12px}
.lp-tab{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 16px;border-radius:999px;border:1.5px solid var(--lp-line);background:#fff;color:var(--lp-ink-2);font-size:15px;font-weight:500}
.lp-tab[aria-selected="true"]{background:var(--lp-espresso);border-color:var(--lp-espresso);color:#FFF6E8}
.lp-panel{display:flex;flex-direction:column;gap:16px}
.lp-opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));gap:10px}
.lp-opt{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:14px;border-radius:16px;border:1.5px solid var(--lp-line);background:#fff;color:var(--lp-ink);font-size:15px;font-weight:500;text-align:right;min-height:84px}
.lp-opt svg{color:var(--lp-palm)}
.lp-opt[aria-pressed="true"]{border-color:var(--lp-palm);background:var(--lp-palm-2)}
.lp-stars{display:flex;gap:6px;direction:ltr;justify-content:flex-end}
.lp-stars button{background:none;border:0;padding:4px;color:var(--lp-line)}
.lp-stars button svg{width:36px;height:36px;fill:currentColor}
.lp-stars button.on{color:var(--lp-gold)}
.lp-row{display:flex;gap:10px;flex-wrap:wrap}
.lp-sent{display:flex;gap:14px;align-items:flex-start;background:var(--lp-ok-bg);color:var(--lp-ok);padding:16px 18px;border-radius:16px}
.lp-sent b{display:block}
.lp-sent span{font-size:14px;color:var(--lp-ink-2)}
.lp-timeline{display:flex;flex-direction:column}
.lp-tl{display:flex;gap:14px;padding:10px 0}
.lp-tl .dot{width:12px;height:12px;border-radius:50%;background:var(--lp-gold);margin-top:8px;flex:none;box-shadow:0 0 0 4px var(--lp-gold-2)}
.lp-tl.done .dot{background:var(--lp-ok);box-shadow:0 0 0 4px var(--lp-ok-bg)}
.lp-tl b{display:block;font-size:15px}
.lp-tl span{font-size:13px;color:var(--lp-muted)}
.lp-terms{background:var(--lp-sand);border-radius:14px;padding:12px 16px}
.lp-terms summary{cursor:pointer;font-weight:600}
.lp-terms p{margin-top:10px!important;white-space:pre-line;font-size:14px;color:var(--lp-ink-2)}

.lp-modal{position:fixed;inset:0;z-index:60;background:rgba(42,30,20,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px}
@media (min-width:700px){.lp-modal{align-items:center}}
.lp-sheet{background:var(--lp-paper);border-radius:26px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;padding:26px}
.lp-sheet-h{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}
.lp-sheet-h h3{font-size:22px;color:var(--lp-espresso)}
.lp-x{width:42px;height:42px;border-radius:12px;border:1px solid var(--lp-line);background:#fff;color:var(--lp-ink);display:inline-flex;align-items:center;justify-content:center}
.lp-grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.lp-grid2 .lp-input{min-width:0;padding:0 10px}
.lp-total{display:flex;justify-content:space-between;align-items:center;background:var(--lp-sand);border-radius:14px;padding:14px 16px}
.lp-total b{font-family:var(--lp-display);font-size:24px;color:var(--lp-espresso)}
.lp-bank{background:var(--lp-sand);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px}
.lp-bank > div{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.lp-bank small{color:var(--lp-muted);font-size:13px;min-width:110px}
.lp-toast{position:fixed;bottom:calc(20px + env(safe-area-inset-bottom,0px));inset-inline:0;margin:0 auto;width:max-content;max-width:calc(100% - 32px);background:var(--lp-espresso);color:#FFF6E8;padding:12px 20px;border-radius:999px;font-size:15px;z-index:70;display:flex;align-items:center;gap:10px;box-shadow:0 14px 30px -10px rgba(0,0,0,.4)}

.lp-foot{background:#1F160F;color:#CDBBA4;padding-block:56px calc(28px + env(safe-area-inset-bottom,0px))}
.lp-foot-in{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:40px}
.lp-foot h4{color:#FFF6E8;font-size:18px;margin:0 0 14px!important}
.lp-foot a{color:#CDBBA4!important;text-decoration:none;display:flex;align-items:center;gap:8px;padding:4px 0}
.lp-foot a:hover{color:var(--lp-gold)!important}
.lp-foot-bottom{grid-column:1/-1;border-top:1px solid rgba(205,187,164,.18);padding-top:20px;font-size:14px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
@media (max-width:800px){.lp-foot-in{grid-template-columns:1fr}}
/* صفحة الشاليه */
.lp-card-img{display:block}
.lp-card-link{color:inherit!important;text-decoration:none}
.lp-card-link:hover{color:var(--lp-palm)!important}
.lp-badge-end{inset-inline-start:auto;inset-inline-end:14px}
.lp section.lp-cd{padding-block:22px 64px}
.lp-back{display:inline-flex;align-items:center;gap:4px;color:var(--lp-ink-2)!important;font-size:15px;font-weight:500;text-decoration:none;padding:6px 0}
.lp-back:hover{color:var(--lp-espresso)!important}
.lp-cd-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-top:6px}
.lp-cd-head h1{font-size:clamp(30px,4.5vw,46px);color:var(--lp-espresso)}
.lp-cd-meta{display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--lp-ink-2);font-size:15px;margin-top:8px}
.lp-cd-meta span{display:inline-flex;align-items:center;gap:6px}
.lp-star{width:17px;height:17px;fill:var(--lp-gold)}
.lp-gal{display:grid;gap:10px;border-radius:26px;overflow:hidden;margin-top:22px;grid-template-columns:2fr 1fr 1fr;grid-template-rows:220px 220px}
.lp-gal>button{border:0;padding:0;margin:0;position:relative;overflow:hidden;background:var(--lp-espresso);cursor:zoom-in;min-width:0}
.lp-gal>button:first-child{grid-row:span 2}
.lp-gal img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s}
.lp-gal>button:hover img{transform:scale(1.04)}
.lp-gal .lp-gal-x{display:none}
.lp-gal[data-n="1"]{grid-template-columns:1fr;grid-template-rows:460px}
.lp-gal[data-n="2"]{grid-template-columns:1.6fr 1fr;grid-template-rows:460px}
.lp-gal[data-n="1"]>button,.lp-gal[data-n="2"]>button{grid-row:auto}
.lp-gal[data-n="3"]{grid-template-columns:2fr 1fr}
.lp-gal[data-n="4"]>button:nth-child(4){grid-column:span 2}
.lp-gal-cat{position:absolute;bottom:12px;inset-inline-start:12px;background:rgba(31,22,15,.72);color:#FFF6E8;font-size:13px;font-weight:500;padding:4px 12px;border-radius:999px}
.lp-gal-plus{position:absolute;inset:0;background:rgba(31,22,15,.55);color:#FFF6E8;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--lp-display);font-size:34px;line-height:1.1}
.lp-gal-plus small{font-family:var(--lp-body);font-size:14px}
.lp-gal-empty{position:relative;background-color:var(--lp-espresso);background-repeat:repeat;display:flex;align-items:center;justify-content:center;color:#E9DCC8}
.lp-gal-empty span{background:rgba(31,22,15,.7);padding:8px 18px;border-radius:999px}
@media (max-width:700px){
  .lp-gal,.lp-gal[data-n]{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;grid-template-rows:none;border-radius:20px;margin-inline:-18px;padding-inline:18px;gap:8px;scrollbar-width:none}
  .lp-gal::-webkit-scrollbar{display:none}
  .lp-gal>button,.lp-gal .lp-gal-x{display:block;flex:0 0 86%;height:270px;scroll-snap-align:center;border-radius:18px}
  .lp-gal[data-n="1"]>button{flex-basis:100%}
  .lp-gal-plus{display:none!important}
  .lp-gal-empty{flex:1;height:240px;border-radius:18px}
}
.lp-cd-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:40px;align-items:start;margin-top:34px}
.lp-cd-main{display:flex;flex-direction:column;gap:44px;min-width:0}
.lp-cd-sec h2{font-size:26px;color:var(--lp-espresso);margin-bottom:6px!important}
.lp-cd-sub{color:var(--lp-muted);font-size:15px;margin-bottom:16px!important}
.lp-cd-sec h2+.lp-cd-text,.lp-cd-sec h2+.lp-amen{margin-top:10px}
.lp-cd-text{color:var(--lp-ink-2);font-size:17px;margin-bottom:8px!important}
.lp-cd-facts b{color:var(--lp-espresso)}
.lp-cd-aside{position:sticky;top:96px;scroll-margin-top:96px}
.lp-book{background:var(--lp-paper);border:1px solid var(--lp-line);border-radius:24px;padding:24px;box-shadow:0 30px 60px -34px rgba(42,30,20,.35);display:flex;flex-direction:column;gap:12px}
.lp-book h3{font-size:22px;color:var(--lp-espresso)}
.lp-book-h{padding-bottom:12px;border-bottom:1px dashed var(--lp-line)}
.lp-book .lp-hint{margin:0}
@media (max-width:960px){.lp-cd-grid{grid-template-columns:1fr}.lp-cd-aside{position:static}}
.lp-rooms{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));gap:12px}
.lp-room{padding:0;background:var(--lp-paper);border:1px solid var(--lp-line);border-radius:18px;overflow:hidden;text-align:right;color:var(--lp-ink);display:flex;flex-direction:column;transition:transform .2s,box-shadow .2s}
.lp-room:hover{transform:translateY(-3px);box-shadow:0 18px 30px -20px rgba(42,30,20,.35)}
.lp-room-img{display:block;aspect-ratio:4/3;background:var(--lp-espresso);overflow:hidden}
.lp-room-img img{width:100%;height:100%;object-fit:cover;display:block}
.lp-room-t{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px}
.lp-room-t b{font-size:16px}
.lp-room-t small{color:var(--lp-muted);font-size:13px;white-space:nowrap}
.lp-amen{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr));gap:10px}
.lp-amen div{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--lp-paper);border:1px solid var(--lp-line);border-radius:16px;font-weight:500}
.lp-amen .ic{width:40px;height:40px;border-radius:12px;background:var(--lp-palm-2);color:var(--lp-palm);display:flex;align-items:center;justify-content:center;flex:none}
.lp-amen div:nth-child(3n+2) .ic{background:var(--lp-gold-2);color:#8A6326}
.lp-amen div:nth-child(3n) .ic{background:#F6E2D6;color:var(--lp-clay)}
.lp-cal{background:var(--lp-paper);border:1px solid var(--lp-line);border-radius:22px;padding:20px}
.lp-cal-nav{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}
.lp-cal-nav .lp-x:disabled{opacity:.35;cursor:default}
.lp-cal-sum{font-size:15px;font-weight:600;color:var(--lp-espresso);text-align:center}
.lp-cal-months{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}
@media (max-width:640px){.lp-cal-months{grid-template-columns:1fr}.lp-cal-m.second{display:none}.lp-cal{padding:14px}}
.lp-cal-m h4{font-size:17px;text-align:center;margin-bottom:10px!important;color:var(--lp-espresso)}
.lp-cal-w,.lp-cal-d{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.lp-cal-w span{font-size:12px;color:var(--lp-muted);text-align:center;padding-bottom:4px}
.lp-day{aspect-ratio:1/1.08;border:0;border-radius:12px;background:var(--lp-ok-bg);color:var(--lp-ink);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:15px;font-weight:600;line-height:1.1;padding:0;font-variant-numeric:tabular-nums;min-width:0}
.lp-day small{font-size:10px;font-weight:500;color:var(--lp-ok);margin-top:3px;white-space:nowrap}
.lp-day.wk small{color:var(--lp-clay)}
.lp-day.past{background:transparent;color:#C9BAA6;cursor:default}
.lp-day.bk{background:var(--lp-bad-bg);color:var(--lp-bad)}
.lp-day.bk span{text-decoration:line-through}
.lp-day.bk small{color:var(--lp-bad)}
.lp-day.bk:disabled{cursor:not-allowed}
.lp-day.in{background:var(--lp-gold-2)}
.lp-day.sel{background:var(--lp-espresso);color:#FFF6E8}
.lp-day.sel small{color:#E9DCC8}
.lp-day:not(:disabled):hover{box-shadow:inset 0 0 0 2px var(--lp-gold)}
.lp-legend{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin-top:16px;font-size:13px;color:var(--lp-ink-2)}
.lp-legend span{display:inline-flex;align-items:center;gap:6px}
.lp-legend i{width:14px;height:14px;border-radius:4px;display:inline-block}
.lp-legend i.ok{background:var(--lp-ok-bg);box-shadow:inset 0 0 0 1px #BFDCC9}
.lp-legend i.bk{background:var(--lp-bad-bg);box-shadow:inset 0 0 0 1px #EFC3B9}
.lp-legend i.sel{background:var(--lp-espresso)}
.lp-link{background:none;border:0;padding:0;color:var(--lp-clay);font-size:13px;font-weight:600;text-decoration:underline;margin-inline-start:auto}
.lp-modetog{display:flex;gap:8px;background:var(--lp-paper);border:1px solid var(--lp-line);border-radius:14px;padding:4px;margin-bottom:14px;width:max-content}
.lp-modetog button{display:flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;border:0;background:transparent;color:var(--lp-ink-2);font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit}
.lp-modetog button.sel{background:var(--lp-espresso);color:#FFF6E8}
.lp-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.lp-slot{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:14px;border-radius:14px;border:1.5px solid var(--lp-line);background:var(--lp-ok-bg);color:var(--lp-ink);cursor:pointer;text-align:right;font-family:inherit}
.lp-slot b{font-size:14px}
.lp-slot span{font-size:12px;color:var(--lp-ink-2)}
.lp-slot small{font-size:12.5px;font-weight:700;color:var(--lp-ok)}
.lp-slot.sel{border-color:var(--lp-espresso);background:var(--lp-espresso);color:#FFF6E8}
.lp-slot.sel span{color:#E9DCC8}
.lp-slot.sel small{color:#FFF6E8}
.lp-slot.bk{background:var(--lp-bad-bg);color:var(--lp-bad);cursor:not-allowed;opacity:.75}
.lp-slot.bk small{color:var(--lp-bad)}
.lp-slot:disabled{cursor:not-allowed}
.lp section.lp-cd-others{padding-block:64px 88px;background:var(--lp-sand-2)}
.lp-mbar{display:none}
@media (max-width:960px){
  .lp-mbar{display:flex;position:sticky;bottom:0;z-index:45;background:var(--lp-paper);border-top:1px solid var(--lp-line);padding:12px 18px calc(12px + env(safe-area-inset-bottom,0px));justify-content:space-between;align-items:center;gap:12px;box-shadow:0 -12px 30px -20px rgba(42,30,20,.35)}
  .lp-mbar b{font-family:var(--lp-display);font-size:20px;color:var(--lp-espresso);display:block;line-height:1.2}
  .lp-mbar small{font-size:13px;color:var(--lp-muted)}
  .lp-mbar .lp-btn{min-height:46px}
}
.lp-lb{position:fixed;inset:0;z-index:80;background:rgba(20,14,9,.95);display:flex;flex-direction:column;color:#FFF6E8}
.lp-lb-top{display:flex;justify-content:space-between;align-items:center;padding:calc(12px + env(safe-area-inset-top,0px)) 18px 12px}
.lp-lb-top b{font-family:var(--lp-display);font-size:18px;margin-inline-end:12px}
.lp-lb-top span{font-size:14px;color:#CDBBA4}
.lp-lb-x{width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;display:inline-flex;align-items:center;justify-content:center}
.lp-lb-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative;padding:0 72px}
.lp-lb-stage img{max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;user-select:none}
.lp-lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;display:flex;align-items:center;justify-content:center}
.lp-lb-nav:hover{background:rgba(255,255,255,.26)}
.lp-lb-prev{inset-inline-start:12px}
.lp-lb-next{inset-inline-end:12px}
.lp-lb-cat{position:absolute;bottom:14px;inset-inline:0;margin:0 auto;width:max-content;background:rgba(31,22,15,.8);padding:4px 14px;border-radius:999px;font-size:14px}
.lp-lb-thumbs{display:flex;gap:8px;overflow-x:auto;padding:12px 18px calc(16px + env(safe-area-inset-bottom,0px));justify-content:safe center}
.lp-lb-thumbs button{flex:none;width:76px;height:56px;border-radius:10px;overflow:hidden;border:2px solid transparent;opacity:.55;padding:0;background:#000}
.lp-lb-thumbs button.on{border-color:var(--lp-gold);opacity:1}
.lp-lb-thumbs img{width:100%;height:100%;object-fit:cover;display:block}
@media (max-width:700px){.lp-lb-stage{padding:0 8px}.lp-lb-nav{width:42px;height:42px;background:rgba(20,14,9,.6)}}
`;
