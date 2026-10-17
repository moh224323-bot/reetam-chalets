import React, { useState, useMemo, useEffect } from "react";
import { setCurrentOwnerId } from "../lib/db";
import { supabase } from "../lib/supabase";
import useRealtimeSync   from "../hooks/useRealtimeSync";
import useDarkMode       from "../hooks/useDarkMode";
import BookingCalendar   from "../components/BookingCalendar";
import MonthlyChart      from "../components/MonthlyChart";
import WeeklyActivity    from "../components/WeeklyActivity";
import type {
  Chalet, Booking, MaintenanceRequest, WalletTransaction,
  CleaningTransaction, CleaningExpense, CleaningTask, CleaningLog,
  Room, Review, AppUser, Expense, FixedExpense, CleaningWorker, LoyaltyCard,
  GuestRating, BlockedGuest, Investor,
} from "../lib/types";
import FinancialTab   from "../components/FinancialTab";
import ChaletsTab     from "../components/ChaletsTab";
import SettingsTab    from "../components/SettingsTab";
import { Icon, Pill, SAR, PageHead, Kpi, Seg, CardHead, Track, toneFor, Empty } from "../components/ds";
import { nextDueInfo, formatDueDate, RENT_REMINDER_DAYS } from "../lib/dueDate";

const SUPA_URL = process.env.EXPO_PUBLIC_SUPA_URL!;
const SUPA_KEY = process.env.EXPO_PUBLIC_SUPA_KEY!;
const TUYA_DEVICES = { 16: "bf359141000334655ddl2t" };
let currentOwnerId: string | null = null;

type ACStatus = { ac_on: boolean; ac_temp: number; ac_mode: string; ac_speed: string };

async function fetchDeviceStatus(roomId: number): Promise<ACStatus | null> {
  const deviceId = TUYA_DEVICES[roomId as keyof typeof TUYA_DEVICES];
  if (!deviceId) return null;
  try {
    const res = await fetch("https://kduoasfaqtrotesohqpf.supabase.co/functions/v1/tuya-control", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPA_KEY },
      body: JSON.stringify({ deviceId }),
    });
    const data = await res.json();
    if (!data?.result) return null;
    const status: Record<string, unknown> = {};
    data.result.forEach((s: { code: string; value: unknown }) => { status[s.code] = s.value; });
    return {
      ac_on: status.power === "1" || status.power === true || status.power === 1,
      ac_temp: Number(status.temp) || 22,
      ac_mode: ["auto","cool","heat","fan","dry"][Number(status.mode)] || "cool",
      ac_speed: ["auto","low","medium","high"][Number(status.wind)] || "auto",
    };
  } catch(e) { return null; }
}

async function tuyaControl(deviceId: string, commands: { code: string; value: unknown }[]): Promise<boolean> {
  try {
    const res = await fetch("https://kduoasfaqtrotesohqpf.supabase.co/functions/v1/tuya-control", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPA_KEY },
      body: JSON.stringify({ deviceId, commands }),
    });
    const data = await res.json();
    return data?.success || false;
  } catch(e) { return false; }
}

async function sendACCommand(roomId: number, field: string, value: unknown): Promise<void> {
  const deviceId = TUYA_DEVICES[roomId as keyof typeof TUYA_DEVICES];
  if (!deviceId) return;
  let commands: { code: string; value: unknown }[] = [];
  if (field === "ac_on")    commands = [{ code: value ? "PowerOn" : "PowerOff", value: value ? "PowerOn" : "PowerOff" }];
  if (field === "ac_temp")  commands = [{ code: "T", value: Number(value) }];
  if (field === "ac_mode")  { const m: Record<string,number> = {"cool":1,"heat":2,"fan":3,"dry":4,"auto":0}; commands = [{ code: "M", value: m[value as string]??0 }]; }
  if (field === "ac_speed") { const m: Record<string,number> = {"auto":0,"low":1,"medium":2,"high":3}; commands = [{ code: "F", value: m[value as string]??0 }]; }
  if (commands.length > 0) await tuyaControl(deviceId, commands);
}

async function callTeamMemberFn(payload: Record<string, unknown>): Promise<{success?:boolean; id?:string; error?:string}> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { error: "الجلسة منتهية، سجّل الدخول من جديد" };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/create-team-member`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPA_KEY },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { error: "تعذر الاتصال بالخادم" };
  }
}

let lastDbError: string | null = null;

async function db(table: string, method="GET", body: Record<string,unknown> | null=null, id: string | number | null=null): Promise<unknown[] | null> {
  let url = `${SUPA_URL}/rest/v1/${table}`;
  if (method === "GET") {
    url += id ? `?${id}&select=*` : "?order=id&select=*";
  } else if (id) {
    url += `?id=eq.${id}`;
  }
  const {data:{session}} = await supabase.auth.getSession();
  const token = session?.access_token || SUPA_KEY;
  if (method === "POST" && body && !("owner_id" in body) && currentOwnerId && table!=="profiles" && table!=="subscriptions") {
    body = { ...body, owner_id: currentOwnerId };
  }
  const headers: Record<string,string> = {
    "apikey": SUPA_KEY, "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json", "Cache-Control": "no-cache",
  };
  if (method === "POST" || method === "PATCH") headers["Prefer"] = "return=representation";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  if (!res.ok) { const e = await res.text(); lastDbError = e; console.error("Supabase error:", method, table, id, e); return null; }
  lastDbError = null;
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// بعض صور معرض الشاليهات مستوردة قديماً بصيغة {url,cat} (مصنّفة حسب القسم: مجلس/مسبح/...)
// بينما كود الرفع الحالي يخزّن نصوص روابط مباشرة — هذا الفرق هو سبب أيقونة "؟" المكسورة.
function galleryUrl(g: unknown): string | null {
  if (typeof g === "string") return g;
  if (g && typeof g === "object" && typeof (g as { url?: unknown }).url === "string") return (g as { url: string }).url;
  return null;
}

/** يضغط الصورة قبل الرفع (أقصى بعد 1600px، جودة JPEG 82%) ليحافظ على وضوح جيد بأقل مساحة تخزين ممكنة. */
function compressImageFile(file: File, maxPx = 1600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("no canvas context")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("compress failed")), "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("invalid image"));
      img.src = ev.target!.result as string;
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

// رفع صورة شاليه إلى Supabase Storage (أخف من base64) — تُضغط أولاً لتوفير مساحة التخزين دون خسارة وضوح ملحوظة.
let lastUploadError: string | null = null;
async function uploadChaletImage(file: File): Promise<string | null> {
  let body: Blob = file;
  let ext = file.name.split(".").pop() || "jpg";
  let contentType = file.type || "application/octet-stream";
  if (file.type.startsWith("image/")) {
    try { body = await compressImageFile(file); ext = "jpg"; contentType = "image/jpeg"; }
    catch { /* فشل الضغط (مثلاً صيغة غير مدعومة في الـ canvas) — نرفع الملف الأصلي بدلاً من فقدان الصورة بالكامل */ }
  }
  const path = `chalets/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/chalet-images/${path}`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": contentType },
    body,
  });
  if (!res.ok) { const err = await res.text(); lastUploadError = err; console.error("فشل رفع الصورة:", err); return null; }
  lastUploadError = null;
  return `${SUPA_URL}/storage/v1/object/public/chalet-images/${path}`;
}

const S="#C9A36A", B="#3B2A1C", BD="#241A11", SA="#2E7D52";
const SD="#1E6B45", T="#6B5F52", TD="#4A3F35", SI="#C8C9CA";
const W="#FFFFFF", OW="#F5F0E8", SL="#FAF6F0";

const STATUS = {
  confirmed: {label:"مؤكد",  color:T,        bg:"#E8F0F0"},
  pending:   {label:"معلق",  color:"#7A5A0E", bg:"#FBF3DF"},
  cancelled: {label:"ملغي",  color:"#A63A2A", bg:"#FBEDEA"},
  completed: {label:"مكتمل", color:SA,        bg:"#E6F1EA"},
};
const MS = {
  open:        {label:"مفتوح",       color:"#A63A2A", bg:"#FBEDEA"},
  in_progress: {label:"قيد التنفيذ", color:"#7A5A0E", bg:"#FBF3DF"},
  done:        {label:"منتهي",       color:SD,        bg:"#E6F1EA"},
};

const fd = (d?: string | null): string => d ? new Date(d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn") : "-";
const fn = (f?: string, t?: string): number => (!f||!t) ? 0 : Math.max(0, Math.round((new Date(t).getTime()-new Date(f).getTime())/86400000));
const td = (): string => new Date().toISOString().slice(0,10);
const monthStart = (): string => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; };
const monthEnd = (): string => { const d=new Date(); const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(last).padStart(2,"0")}`; };

// ── ترجمة تبويب الحجوزات فقط (عربي/هندي) ──
const STATUS_LABEL_KEY: Record<string,string> = {
  confirmed:"statusConfirmed", pending:"statusPending", cancelled:"statusCancelled", completed:"statusCompleted",
};
const BK_I18N: Record<"ar"|"hi", Record<string,string>> = {
  ar: {
    title:"جدول الحجوزات", addBooking:"+ إضافة حجز", chalet:"الشاليه", allChalets:"كل الشاليهات",
    status:"الحالة", allStatuses:"كل الحالات", from:"من تاريخ", to:"إلى تاريخ",
    thisMonth:"📅 الشهر الحالي", showAll:"✕ عرض الكل",
    guest:"الضيف", period:"الفترة", nights:"الليالي", price:"السعر", actions:"إجراءات",
    edit:"✏️ تعديل", delete:"🗑️ حذف", preArrival:"📋 قبل الوصول",
    whatsappCheckin:"📲 واتساب (دخول)", sendReview:"⭐ إرسال رابط التقييم",
    rateGuest:"⭐ تقييم الضيف بعد الخروج", block:"🚫 حظر الضيف", unblock:"✅ إلغاء الحظر", blocked:"🚫 محظور",
    statusConfirmed:"مؤكد", statusPending:"معلق", statusCancelled:"ملغي", statusCompleted:"مكتمل",
    rateTitle:"تقييم الضيف", ratePlaceholder:"سلوك الضيف، أي ملاحظات تفيد الحجوزات القادمة...",
    cancel:"إلغاء", saveRating:"حفظ التقييم",
    blockTitle:"حظر الضيف", blockDesc:"سيتم وضع علامة على هذا الرقم وتنبيه الموظفين عند محاولة إنشاء حجز جديد له.",
    blockReasonPlaceholder:"مثال: إتلاف ممتلكات، سلوك غير لائق...", confirmBlock:"تأكيد الحظر",
    unblockConfirm:"إلغاء حظر هذا الضيف؟",
    detailsTitle:"تفاصيل الحجز", nightsLabel:"عدد الليالي", arrival:"تاريخ الوصول", departure:"تاريخ المغادرة",
    totalPrice:"السعر الكلي", paymentMethod:"طريقة الدفع", notes:"📝 ملاحظات",
    whatsappBtn:"واتساب 📲", checkout:"🚪 خروج", previousRatings:"⭐ تقييمات سابقة لهذا الضيف",
    thisGuestBlocked:"🚫 هذا الضيف محظور",
    editBookingTitle:"تعديل الحجز", addBookingTitle:"إضافة حجز جديد",
    guestName:"اسم الضيف", phone:"رقم الهاتف", checkinTime:"وقت الدخول", checkoutTime:"وقت الخروج",
    save:"حفظ", deleteConfirm:"حذف الحجز؟", blockedWarning:"🚫 هذا الرقم محظور — تأكد قبل المتابعة",
  },
  hi: {
    title:"बुकिंग तालिका", addBooking:"+ बुकिंग जोड़ें", chalet:"शैले", allChalets:"सभी शैले",
    status:"स्थिति", allStatuses:"सभी स्थितियाँ", from:"तारीख से", to:"तारीख तक",
    thisMonth:"📅 इस महीने", showAll:"✕ सभी दिखाएं",
    guest:"मेहमान", period:"अवधि", nights:"रातें", price:"कीमत", actions:"कार्रवाई",
    edit:"✏️ संपादित करें", delete:"🗑️ हटाएं", preArrival:"📋 आगमन से पहले",
    whatsappCheckin:"📲 व्हाट्सएप (चेक-इन)", sendReview:"⭐ समीक्षा लिंक भेजें",
    rateGuest:"⭐ चेक-आउट के बाद मेहमान को रेट करें", block:"🚫 मेहमान को ब्लॉक करें", unblock:"✅ अनब्लॉक करें", blocked:"🚫 ब्लॉक किया गया",
    statusConfirmed:"पुष्टि की गई", statusPending:"लंबित", statusCancelled:"रद्द", statusCompleted:"पूर्ण",
    rateTitle:"मेहमान को रेट करें", ratePlaceholder:"मेहमान का व्यवहार, कोई भी टिप्पणी जो भविष्य की बुकिंग में मदद करे...",
    cancel:"रद्द करें", saveRating:"रेटिंग सहेजें",
    blockTitle:"मेहमान को ब्लॉक करें", blockDesc:"इस नंबर को चिह्नित किया जाएगा और नई बुकिंग बनाते समय कर्मचारियों को सूचित किया जाएगा।",
    blockReasonPlaceholder:"उदाहरण: संपत्ति को नुकसान, अनुचित व्यवहार...", confirmBlock:"ब्लॉक की पुष्टि करें",
    unblockConfirm:"इस मेहमान को अनब्लॉक करें?",
    detailsTitle:"बुकिंग विवरण", nightsLabel:"रातों की संख्या", arrival:"आगमन तिथि", departure:"प्रस्थान तिथि",
    totalPrice:"कुल कीमत", paymentMethod:"भुगतान का तरीका", notes:"📝 टिप्पणियाँ",
    whatsappBtn:"व्हाट्सएप 📲", checkout:"🚪 चेक-आउट", previousRatings:"⭐ इस मेहमान की पिछली रेटिंग",
    thisGuestBlocked:"🚫 यह मेहमान ब्लॉक है",
    editBookingTitle:"बुकिंग संपादित करें", addBookingTitle:"नई बुकिंग जोड़ें",
    guestName:"मेहमान का नाम", phone:"फोन नंबर", checkinTime:"चेक-इन समय", checkoutTime:"चेक-आउट समय",
    save:"सहेजें", deleteConfirm:"बुकिंग हटाएं?", blockedWarning:"🚫 यह नंबर ब्लॉक है — आगे बढ़ने से पहले जांच लें",
  },
};

function useIsMobile() {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Kufi+Arabic:wght@600;700&display=swap');
  @font-face{font-family:'YaModern';src:url('/assets/YaModernPro-Bold.otf') format('opentype');font-weight:700;font-display:swap}

  /* ── نظام ألوان ريتام (فاتح) ── */
  :root{
    --bg:#F5F0E8; --surface:#FFFFFF; --card:#FFFFFF; --surface-2:#FAF6F0;
    --border:#E7DDCF; --border2:#DCCFBE; --line:#F0E8DC;
    --text:#1E1A16; --text2:#6B5F52; --text3:#A8998A;
    --brand:#3B2A1C; --brand-fg:#FFFFFF; --primary:#3B2A1C; --link:#6B4A2B; --gold:#C9A36A;
    --inp-bg:#FFFFFF; --row-hov:#FAF6F0; --th-bg:#FAF6F0; --mdl-bg:rgba(23,19,15,.55);
    --bad:#A63A2A; --bad-bg:#FBEDEA; --bad-line:#EFC9C1;
    --warn:#7A5A0E; --warn-bg:#FBF3DF; --ok:#1E6B45; --ok-bg:#E6F1EA; --info:#2F5D7C; --info-bg:#E8F0F6;
    --share:#1F8A4C;
    --side:#17130F; --side-2:#2A231C; --side-line:#2E2720; --side-fg:#D9CFC2; --side-strong:#F3EADC; --side-muted:#A8998A;
    --f-body:'IBM Plex Sans Arabic',system-ui,'Segoe UI',Tahoma,sans-serif;
    --f-display:'Noto Kufi Arabic','IBM Plex Sans Arabic',Tahoma,sans-serif;
  }
  /* ── الوضع الليلي ── */
  [data-theme="dark"]{
    --bg:#14110E; --surface:#1E1A16; --card:#1E1A16; --surface-2:#25201A;
    --border:#332B23; --border2:#40362C; --line:#2B241D;
    --text:#F1E9DD; --text2:#B3A595; --text3:#7A6E61;
    --brand:#C9A36A; --brand-fg:#17130F; --primary:#C9A36A; --link:#D9B57E;
    --inp-bg:#221E19; --row-hov:#25201A; --th-bg:#25201A; --mdl-bg:rgba(0,0,0,.7);
    --bad:#F08A78; --bad-bg:#3A1F1A; --bad-line:#5A2C24;
    --warn:#E8C46A; --warn-bg:#33291A; --ok:#7FD0A2; --ok-bg:#183024; --info:#8DBBDB; --info-bg:#1A2833;
    --side:#0E0C0A; --side-2:#221C16; --side-line:#2A231C;
    color-scheme:dark;
  }

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{overflow-y:auto!important;height:auto!important;min-height:100vh;background:var(--bg);color:var(--text);font-family:var(--f-body)}
  #root{height:auto;overflow:visible}
  input,select,textarea,button{font-family:var(--f-body)}
  h1,h2,h3{font-family:var(--f-display);text-wrap:balance}
  :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  ::-webkit-scrollbar{width:6px;height:6px}
  ::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
  ::selection{background:rgba(201,163,106,.3)}

  /* ── بطاقات ── */
  .card{background:var(--surface);border-radius:16px;border:1px solid var(--border)}
  .cc{background:var(--surface);border-radius:18px;overflow:hidden;transition:transform .2s,box-shadow .2s;border:1px solid var(--border)}
  .cc:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(23,19,15,.10)}

  /* ── أزرار ── */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid transparent;cursor:pointer;border-radius:10px;font-family:var(--f-body);font-weight:600;transition:background .15s,border-color .15s,transform .15s,filter .15s;font-size:14px;min-height:40px}
  .btn:hover{filter:brightness(.95)}
  .btn:active{transform:scale(.98)}
  .btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
  .bp{background:var(--brand);color:var(--brand-fg);padding:9px 20px}
  .bo{background:var(--surface);color:var(--text);padding:9px 18px;border-color:var(--border2)}
  .bo:hover{border-color:var(--text2);filter:none}
  .bd{background:var(--bad-bg);color:var(--bad);padding:7px 14px;font-size:13px;border-color:var(--bad-line)}
  .be{background:var(--surface);color:var(--text);padding:7px 14px;font-size:13px;border-color:var(--border2)}
  .be:hover{border-color:var(--text2);filter:none}
  .bsm{padding:5px 12px;font-size:13px;min-height:34px}
  .bshare{background:var(--share);color:#fff;padding:9px 18px}

  /* ── جداول ── */
  .tbl{width:100%;border-collapse:collapse;min-width:520px}
  .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%}
  th{background:var(--th-bg);color:var(--text2);font-size:13px;font-weight:600;padding:12px 14px;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap}
  td{padding:12px 14px;border-bottom:1px solid var(--line);font-size:13px;color:var(--text);font-variant-numeric:tabular-nums}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:var(--row-hov)}

  /* ── شارات وحقول ── */
  .bdg{display:inline-flex;align-items:center;gap:4px;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600;white-space:nowrap}
  .inp{width:100%;padding:10px 14px;border:1px solid var(--border2);border-radius:10px;font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s;color:var(--text);background:var(--inp-bg);min-height:42px}
  .inp:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,163,106,.18)}
  .lbl{font-size:13px;color:var(--text2);margin-bottom:6px;display:block;font-weight:600}

  /* ── النوافذ ── */
  .mbg{position:fixed;inset:0;background:var(--mdl-bg);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
  .mbox{background:var(--surface);color:var(--text);border-radius:20px;padding:24px;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;border:1px solid var(--border);box-shadow:0 24px 60px rgba(23,19,15,.25)}

  /* ── شبكات ── */
  .sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
  .g2{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .cg{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
  .ig{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
  .mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

  /* ── الشريط الجانبي ── */
  .rs-side{background:var(--side);color:var(--side-fg);display:flex;flex-direction:column}
  .rs-brand{display:flex;align-items:center;gap:12px;padding:20px 18px;border-bottom:1px solid var(--side-line)}
  .rs-brand-mark{width:44px;height:44px;border-radius:12px;background:var(--side-2);display:flex;align-items:center;justify-content:center;flex:none}
  .rs-brand-name{font-family:var(--f-display);font-weight:700;font-size:16px;color:var(--side-strong)}
  .rs-brand-sub{font-size:12px;color:var(--side-muted);margin-top:2px}
  .rs-nav{flex:1;padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
  .rs-item{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;border-radius:10px;border:none;background:transparent;color:var(--side-fg);font-size:15px;font-weight:500;width:100%;text-align:right;cursor:pointer;font-family:var(--f-body);transition:background .15s,color .15s}
  .rs-item:hover{background:var(--side-2)}
  .rs-item.active{background:var(--side-2);color:var(--side-strong);font-weight:600;box-shadow:inset -3px 0 0 var(--gold)}
  .rs-item svg{flex:none;opacity:.9}
  .rs-count{margin-right:auto;min-width:24px;height:22px;padding:0 7px;border-radius:11px;background:var(--gold);color:#17130F;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
  .rs-foot{padding:14px 16px;border-top:1px solid var(--side-line);display:flex;flex-direction:column;gap:12px}
  .rs-theme{display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #3A3129;background:transparent;color:var(--side-fg);font-size:14px;cursor:pointer;font-family:var(--f-body)}
  .rs-user{display:flex;align-items:center;gap:10px}
  .rs-avatar{width:36px;height:36px;border-radius:50%;background:var(--side-2);color:var(--gold);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}
  .rs-user-name{font-size:14px;color:var(--side-strong);font-weight:600}
  .rs-user-role{font-size:12px;color:var(--side-muted)}
  .rs-logout{background:rgba(166,58,42,.18);color:#F2B8AC;border:none;border-radius:8px;min-height:36px;padding:0 12px;font-size:13px;cursor:pointer;font-family:var(--f-body);font-weight:600}
  .rs-topbar{background:var(--side);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200}
  .rs-iconbtn{background:var(--side-2);border:none;border-radius:10px;width:44px;height:44px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--side-strong)}

  /* ── صفحة تفاصيل الشاليه ── */
  .cd{max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:22px}
  .cd-back{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:500;color:var(--link);background:none;border:none;cursor:pointer;min-height:36px;padding:0;align-self:flex-start}
  .cd-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px}
  .cd-title-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .cd-title{font-family:var(--f-display);font-size:clamp(22px,4vw,30px);font-weight:700;color:var(--text)}
  .cd-loc{display:flex;align-items:center;gap:6px;color:var(--text2);font-size:14px;margin-top:6px}
  .cd-actions{display:flex;flex-wrap:wrap;gap:8px}
  .cd-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:13px;font-size:13px;font-weight:600;white-space:nowrap}
  .cd-pill.ok{background:var(--ok-bg);color:var(--ok)}
  .cd-pill.bad{background:var(--bad-bg);color:var(--bad)}
  .cd-pill.warn{background:var(--warn-bg);color:var(--warn)}
  .cd-pill.muted{background:var(--surface-2);color:var(--text2)}
  .cd-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
  .cd-icon-btn{width:44px;padding:0}
  .cd-row{display:flex;flex-wrap:wrap;gap:20px}
  .cd-row > *{min-width:0}
  .cd-photo{flex:3 1 440px;position:relative;border-radius:18px;overflow:hidden;min-height:280px;background:linear-gradient(135deg,#3B2A1C,#241A11)}
  .cd-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .cd-photo-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.3)}
  .cd-photo-change{position:absolute;top:14px;left:14px;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border-radius:10px;background:rgba(23,19,15,.75);color:#fff;font-size:14px;font-weight:500;cursor:pointer}
  .cd-panel{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:16px}
  .cd-facts{flex:1 1 260px;gap:0}
  .cd-h2{font-family:var(--f-body);font-size:16px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:10px}
  .cd-h2 svg{color:var(--link)}
  .cd-fact{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
  .cd-fact:last-child{border-bottom:none;padding-bottom:0}
  .cd-fact-k{display:flex;align-items:center;gap:10px;color:var(--text2);font-size:14px}
  .cd-fact-v{font-size:18px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums}
  .cd-unit{font-size:13px;font-weight:500;color:var(--text2)}
  .cd-desc{font-size:14px;color:var(--text2);line-height:1.7;margin-top:12px}
  .cd-sec-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
  .cd-sec-head span{font-size:13px;color:var(--text2)}
  .cd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
  .cd-kpi{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:8px}
  .cd-kpi-k{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:26px;color:var(--text2);font-size:14px}
  .cd-kpi-v{font-size:28px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums}
  .cd-neg{color:var(--bad)!important}
  .cd-pos{color:var(--ok)!important}
  .cd-track{height:10px;border-radius:5px;background:var(--line);overflow:hidden}
  .cd-fill{height:100%;border-radius:5px;transition:width .5s}
  .cd-goal-foot{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:var(--text2)}
  .cd-goal-foot strong{color:var(--text)}
  .cd-status{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .cd-st{border-radius:12px;padding:16px 8px;display:flex;flex-direction:column;align-items:center;gap:2px}
  .cd-st b{font-size:26px;font-variant-numeric:tabular-nums}
  .cd-st span{font-size:13px}
  .cd-st.open{background:var(--bad-bg);color:var(--bad)}
  .cd-st.prog{background:var(--warn-bg);color:var(--warn)}
  .cd-st.done{background:var(--ok-bg);color:var(--ok)}
  .cd-rent{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line)}
  .cd-rent-info{display:flex;flex-direction:column;gap:8px;align-items:flex-start;min-width:0}
  .cd-rent-amt{font-size:15px;font-weight:600;color:var(--text)}
  .cd-rent-acts{display:flex;gap:8px}
  .cd-empty{font-size:14px;color:var(--text2)}

  /* ── نظام التصميم (x-) ── */
  .x-page{display:flex;flex-direction:column;gap:22px}
  .x-num{font-variant-numeric:tabular-nums}
  .x-unit{font-size:.55em;font-weight:500;color:var(--text2)}
  .x-neg{color:var(--bad)!important}
  .x-pos{color:var(--ok)!important}
  .x-muted{color:var(--text2)}
  .x-mono{font-family:ui-monospace,Menlo,Consolas,monospace;direction:ltr;unicode-bidi:isolate}
  .x-back{display:inline-flex;align-items:center;gap:6px;color:var(--link);background:none;border:0;font-size:14px;min-height:34px;padding:0;align-self:flex-start;cursor:pointer;font-family:var(--f-body)}
  .x-ph{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px}
  .x-ph h1{font-family:var(--f-display);font-size:clamp(22px,3.4vw,28px);font-weight:700;color:var(--text)}
  .x-ph p{margin-top:4px;color:var(--text2);font-size:14px}
  .x-ph-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .x-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  .x-select{min-height:42px;border-radius:10px;border:1px solid var(--border2);background:var(--inp-bg);color:var(--text);padding:0 12px;font:inherit;font-size:14px}
  .x-seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--border);border-radius:11px;padding:3px;gap:2px;flex-wrap:wrap}
  .x-seg button{border:0;background:transparent;min-height:34px;padding:0 12px;border-radius:8px;font-size:13px;color:var(--text2);display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-family:var(--f-body)}
  .x-seg button[aria-pressed="true"]{background:var(--surface);color:var(--text);font-weight:600;box-shadow:0 1px 2px rgba(23,19,15,.08)}
  .x-seg button:disabled{opacity:.5;cursor:not-allowed}
  .x-seg .c{font-size:12px;color:var(--text3)}
  .x-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden}
  .x-pad{padding:20px}
  .x-card-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .x-card-h h2{font-family:var(--f-body);font-size:16px!important;font-weight:700;display:flex;align-items:center;gap:10px;color:var(--text);flex-wrap:wrap}
  .x-card-h h2 > svg{color:var(--link)}
  .x-sub{font-size:13px;color:var(--text2);font-weight:400}
  .x-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px}
  .x-grid2 > *{min-width:0}
  .x-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:14px}
  .x-kpi{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:6px;min-width:0}
  .x-kpi .k{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--text2);font-size:14px;min-height:24px;flex-wrap:wrap}
  .x-kpi .v{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2;color:var(--text)}
  .x-kpi .v small{font-size:14px;font-weight:500;color:var(--text2)}
  .x-kpi .s{font-size:13px;color:var(--text2)}
  .x-kpi.hero{background:#3B2A1C;border-color:#3B2A1C}
  .x-kpi.hero .k,.x-kpi.hero .s,.x-kpi.hero .v,.x-kpi.hero .x-unit,.x-kpi.hero .v small{color:#F3EADC}
  .x-kpi.hero .k,.x-kpi.hero .s{opacity:.8}
  .x-kpi.hero .x-pill{background:rgba(255,255,255,.14);color:#F3EADC}
  [data-theme="dark"] .x-kpi.hero{background:#2A2016;border-color:#3A2E22}
  .x-pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap}
  .x-pill.ok{background:var(--ok-bg);color:var(--ok)}
  .x-pill.bad{background:var(--bad-bg);color:var(--bad)}
  .x-pill.warn{background:var(--warn-bg);color:var(--warn)}
  .x-pill.info{background:var(--info-bg);color:var(--info)}
  .x-pill.muted{background:var(--surface-2);color:var(--text2);border:1px solid var(--line)}
  .x-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
  .x-list{display:flex;flex-direction:column}
  .x-li{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line)}
  .x-li:last-child{border-bottom:0}
  .x-li.click{cursor:pointer}
  .x-li.click:hover{background:var(--surface-2)}
  .x-li .meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .x-li .meta b{font-weight:600;color:var(--text)}
  .x-li .meta span{font-size:13px;color:var(--text2)}
  .x-li .amt{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--text)}
  .x-li .acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
  .x-ic{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none}
  .x-ic.bad{background:var(--bad-bg);color:var(--bad)}
  .x-ic.warn{background:var(--warn-bg);color:var(--warn)}
  .x-ic.ok{background:var(--ok-bg);color:var(--ok)}
  .x-ic.info{background:var(--info-bg);color:var(--info)}
  .x-ic.muted{background:var(--surface-2);color:var(--text2)}
  .x-tbl{width:100%;border-collapse:collapse;font-size:14px}
  .x-tbl th{text-align:right;font-weight:600;color:var(--text2);font-size:13px;padding:11px 16px;background:var(--surface-2);border-bottom:1px solid var(--border);white-space:nowrap}
  .x-tbl td{padding:13px 16px;border-bottom:1px solid var(--line);vertical-align:middle;font-variant-numeric:tabular-nums;color:var(--text)}
  .x-tbl tr:last-child td{border-bottom:0}
  .x-tbl tbody tr:hover td{background:var(--surface-2)}
  .x-tbl td.strong{font-weight:600}
  .x-tbl .end{text-align:left}
  .x-tbl tfoot td{font-weight:700;background:var(--surface-2);border-top:1px solid var(--border)}
  .x-empty{padding:28px 20px;text-align:center;color:var(--text2);font-size:14px}
  .x-track{height:8px;border-radius:4px;background:var(--line);overflow:hidden;min-width:60px;flex:1}
  .x-fill{height:100%;border-radius:4px;background:var(--brand);transition:width .4s}
  .x-fill.ok{background:var(--ok)} .x-fill.warn{background:var(--gold)} .x-fill.bad{background:var(--bad)}
  .x-barrow{display:flex;align-items:center;gap:8px;min-width:120px}
  .x-stmt .r{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px dashed var(--line);font-size:15px;color:var(--text)}
  .x-stmt .r .lab{display:flex;flex-direction:column}
  .x-stmt .r .lab small{color:var(--text2);font-size:12px}
  .x-stmt .r.total{border-top:2px solid var(--border);border-bottom:0;margin-top:4px;padding-top:14px;font-weight:700;font-size:17px}
  .x-ins{display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);align-items:flex-start;font-size:14px;color:var(--text)}
  .x-ins:last-child{border-bottom:0}
  .x-status3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .x-avatar{width:36px;height:36px;border-radius:50%;background:var(--surface-2);color:var(--link);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}
  .x-rooms{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr));gap:16px}
  .x-room{padding:18px;display:flex;flex-direction:column;gap:14px}
  .x-temp{display:flex;align-items:center;justify-content:center;gap:18px;direction:ltr}
  .x-temp .deg{font-size:44px;font-weight:700;font-variant-numeric:tabular-nums;min-width:90px;text-align:center;color:var(--text)}
  .x-room.off .deg{color:var(--text3)}
  .x-room .x-seg{display:flex;width:100%}
  .x-room .x-seg button{flex:1;justify-content:center;padding:0 6px}
  .x-lbl{font-size:13px;color:var(--text2);font-weight:500;margin-bottom:6px}
  .x-stars{display:inline-flex;gap:2px;color:var(--gold)}
  .x-ch-card{background:var(--surface);border:1px solid var(--border);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;text-align:right;padding:0;color:var(--text);cursor:pointer;font-family:var(--f-body);transition:border-color .15s,box-shadow .15s}
  .x-ch-card:hover{border-color:var(--border2);box-shadow:0 10px 28px rgba(23,19,15,.08)}
  .x-ch-img{position:relative;height:150px;background:linear-gradient(135deg,#3B2A1C,#241A11);color:rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center}
  .x-ch-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .x-ch-img .x-pill{position:absolute;top:12px;left:12px}
  .x-ch-body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:12px}
  .x-ch-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .x-ch-stats div{background:var(--surface-2);border-radius:10px;padding:8px 10px}
  .x-ch-stats small{display:block;font-size:12px;color:var(--text2)}
  .x-ch-stats b{font-size:15px;font-variant-numeric:tabular-nums}
  .x-nav-group{font-size:12px;color:var(--side-muted);padding:14px 12px 6px;font-weight:600}
  .x-input{min-height:42px;border-radius:10px;border:1px solid var(--border2);background:var(--inp-bg);color:var(--text);padding:0 12px;font:inherit;font-size:14px;width:100%}
  @media(max-width:640px){
    .x-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .x-kpi{padding:14px}
    .x-kpi .v{font-size:22px}
    .x-li{padding:14px 16px;flex-wrap:wrap}
    .x-li .acts{width:100%;justify-content:flex-start}
    .x-card-h{padding:14px 16px}
    .x-pad{padding:16px}
    .x-hide-sm{display:none}
    .x-tbl th,.x-tbl td{padding:10px 12px}
  }
  @media(max-width:640px){
    .mbox{padding:16px;border-radius:14px}
    h2{font-size:18px!important}
    .sg{grid-template-columns:repeat(2,1fr)}
    .g2{grid-template-columns:1fr}
    .cd-photo{min-height:220px}
    .cd-actions .btn{flex:1 1 auto}
    .tbl-wrap{overflow-x:visible}
    .tbl{min-width:unset;display:block}
    .tbl thead{display:none}
    .tbl tbody{display:block}
    .tbl tr{display:block;margin-bottom:12px;border-radius:12px;border:1px solid var(--border);overflow:hidden;background:var(--surface)}
    .tbl tr:hover td{background:transparent}
    .tbl td{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--line);font-size:13px;gap:8px}
    .tbl td:last-child{border-bottom:none}
    .tbl td::before{content:attr(data-label);font-size:12px;color:var(--text2);font-weight:600;flex-shrink:0;text-align:right}
    .tbl td[data-label=""]::before{display:none}
    .tbl td[data-label=""]{justify-content:flex-end}
  }
`;

function Bdg({bg,color,children}) {
  return <span className="bdg" style={{background:bg,color:color}}>{children}</span>;
}
function TH({title}) {
  return (
    <div style={{marginBottom:20}}>
      <h2 style={{color:B,fontWeight:800,fontSize:22}}>{title}</h2>
      <div style={{width:50,height:3,background:S,borderRadius:99,marginTop:5}}></div>
    </div>
  );
}
function SendTaskBtn({task,workers,log,onSent}:{task:CleaningTask;workers:CleaningWorker[];log:CleaningLog|null;onSent:()=>void}) {
  const [selW,setSelW]=useState<number>(workers[0]?.id||0);
  const [sending,setSending]=useState(false);
  async function send() {
    const worker=workers.find(w=>w.id===selW);
    if(!worker)return;
    setSending(true);
    let logId:number;
    if(log){logId=log.id;await db("cleaning_logs","PATCH",{status:"sent",sent_at:new Date().toISOString(),worker_id:worker.id},log.id);}
    else{const r=await db("cleaning_logs","POST",{task_id:task.id,chalet:task.chalet,log_date:td(),worker_done:false,supervisor_ok:false,status:"sent",sent_at:new Date().toISOString(),worker_id:worker.id});logId=r?.[0]?.id||0;}
    onSent();
    const lang=worker.language||"hi";
    const url=`https://reetam-chalets.vercel.app?guest=1&m=cleantask&log=${logId}&task=${encodeURIComponent(task.title)}&ch=${encodeURIComponent(task.chalet)}&lang=${lang}`;
    const msgs:Record<string,string>={
      hi:`नमस्ते ${worker.name}! 🧹%0aकाम: *${task.title}*%0aजगह: ${task.chalet}%0a%0aकाम पूरा होने पर यहाँ क्लिक करें:%0a${encodeURIComponent(url)}`,
      ar:`مرحباً ${worker.name} 🧹%0aالمهمة: *${task.title}*%0aالشاليه: ${task.chalet}%0a%0aعند الانتهاء اضغط هنا:%0a${encodeURIComponent(url)}`,
      en:`Hi ${worker.name}! 🧹%0aTask: *${task.title}*%0aChalet: ${task.chalet}%0a%0aWhen done, click here:%0a${encodeURIComponent(url)}`,
    };
    const phone=worker.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");
    window.open(`https://wa.me/${phone}?text=${msgs[lang]||msgs.hi}`,"_blank");
    setSending(false);
  }
  return (
    <div style={{display:"flex",gap:4,alignItems:"center"}}>
      {workers.length>1&&(
        <select value={selW} onChange={e=>setSelW(Number(e.target.value))}
          style={{borderRadius:7,border:"1.5px solid rgba(6,95,70,.3)",padding:"4px 7px",fontSize:11,background:"#fff",fontFamily:"'IBM Plex Sans Arabic',sans-serif",maxWidth:90}}>
          {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      <button onClick={send} disabled={sending} style={{
        background:"#1F8A4C",color:"#fff",border:"none",borderRadius:7,
        padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",
        fontFamily:"'IBM Plex Sans Arabic',sans-serif",whiteSpace:"nowrap",
      }}>{sending?"...":"📲 إرسال"}</button>
    </div>
  );
}

function UnpaidFixedBanner({unpaid,total,onPay}:{unpaid:FixedExpense[];total:number;onPay:(fx:FixedExpense)=>Promise<void>}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{marginBottom:20}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
        background:"linear-gradient(135deg,#78350F,#92400E)",border:"none",borderRadius:open?"14px 14px 0 0":14,
        cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",textAlign:"right",
      }}>
        <span style={{fontSize:16}}>📌</span>
        <span style={{fontWeight:800,color:"#fff",fontSize:14,flex:1}}>مصروفات ثابتة لم تُسدَّد</span>
        <span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,fontSize:12,padding:"2px 10px",fontWeight:700}}>{unpaid.length}</span>
        <span style={{fontWeight:800,color:"#FDE68A",fontSize:13}}>{total.toLocaleString("en-US")+" ر"}</span>
        <span style={{color:"rgba(255,255,255,.7)",fontSize:12,marginRight:4}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{background:"rgba(120,53,15,.12)",border:"1px solid rgba(120,53,15,.25)",borderRadius:"0 0 14px 14px",overflow:"hidden"}}>
          {unpaid.map((fx,i)=>(
            <div key={fx.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",borderTop:i>0?"1px solid rgba(120,53,15,.15)":"none"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:B,fontSize:13}}>{fx.name}</div>
                <div style={{fontSize:11,color:T,marginTop:2}}>{fx.chalet} · {fx.category}</div>
              </div>
              <div style={{fontWeight:800,color:"#92400E",fontSize:14}}>{Number(fx.amount).toLocaleString("en-US")+" ر"}</div>
              <SaveBtn label="تسديد" onClick={()=>onPay(fx)} style={{padding:"6px 14px",fontSize:12}}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
/** تذكير إيجار بسيط — ليس مصروفاً ولا يسجّل أي دفعة، فقط قائمة هادئة يتم تأكيد الاطلاع عليها. */
function RentDueBanner({items,onAcknowledge}:{items:{fx:FixedExpense;info:ReturnType<typeof nextDueInfo>}[];onAcknowledge:(fx:FixedExpense)=>Promise<void>}) {
  return (
    <div className="card" style={{marginBottom:20,padding:"12px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:15}}>🏠</span>
        <span style={{fontWeight:800,color:B,fontSize:13.5}}>تذكير بموعد الإيجار</span>
      </div>
      {items.map(({fx,info},i)=>(
        <div key={fx.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderTop:i>0?"1px solid rgba(201,163,106,.15)":"none"}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:B,fontSize:13}}>{fx.chalet} · {fx.name}</div>
            <div style={{fontSize:11,color:info!.daysUntil<0?"#A63A2A":T,marginTop:2,fontWeight:info!.daysUntil<0?700:400}}>
              {formatDueDate(info!.nextDue)}
              {" · "}
              {info!.daysUntil<0?`متأخر ${Math.abs(info!.daysUntil)} يوم`:info!.daysUntil===0?"يستحق اليوم":`باقي ${info!.daysUntil} يوم`}
            </div>
          </div>
          <SaveBtn label="✓ تم" onClick={()=>onAcknowledge(fx)} style={{padding:"6px 14px",fontSize:12}}/>
        </div>
      ))}
    </div>
  );
}
function BlockedGuestsBanner({guests,onUnblock}:{guests:BlockedGuest[];onUnblock:(phone:string)=>void}) {
  const [open,setOpen]=useState(false);
  if(!guests.length) return null;
  return (
    <div style={{marginBottom:20}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
        background:"linear-gradient(135deg,#A63A2A,#6B2A2A)",border:"none",borderRadius:open?"14px 14px 0 0":14,
        cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",textAlign:"right",
      }}>
        <span style={{fontSize:16}}>🚫</span>
        <span style={{fontWeight:800,color:"#fff",fontSize:14,flex:1}}>الضيوف المحظورون</span>
        <span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,fontSize:12,padding:"2px 10px",fontWeight:700}}>{guests.length}</span>
        <span style={{color:"rgba(255,255,255,.7)",fontSize:12,marginRight:4}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{background:"rgba(166,58,42,.07)",border:"1px solid rgba(166,58,42,.2)",borderRadius:"0 0 14px 14px",overflow:"hidden"}}>
          {guests.map((g,i)=>(
            <div key={g.id} style={{padding:"12px 16px",borderTop:i>0?"1px solid rgba(166,58,42,.12)":"none",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontWeight:700,color:B,fontSize:13}}>{g.guest}</div>
                <div style={{fontSize:11,color:T,marginTop:1,direction:"ltr",textAlign:"right"}}>{g.phone}</div>
                {g.reason&&<div style={{fontSize:11,color:"#A63A2A",marginTop:2}}>{g.reason}</div>}
              </div>
              <button onClick={()=>onUnblock(g.phone)} className="btn bsm" style={{background:"rgba(166,58,42,.1)",color:"#A63A2A"}}>إلغاء الحظر</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
/** زر إجراء صغير يعرض حالة التحميل أثناء تنفيذ عملية غير متزامنة */
function ActBtn({onClick,primary,children}:{onClick:()=>void|Promise<void>;primary?:boolean;children:React.ReactNode}) {
  const [busy,setBusy]=useState(false);
  return (
    <button type="button" className={"btn bsm "+(primary?"bp":"bo")} disabled={busy}
      onClick={async()=>{if(busy)return;setBusy(true);try{await onClick();}finally{setBusy(false);}}}>
      {busy?"جاري...":children}
    </button>
  );
}
function SaveBtn({onClick,label="حفظ",disabled=false,style={}}: {onClick:()=>Promise<void>;label?:string;disabled?:boolean;style?:React.CSSProperties}) {
  const [saving,setSaving] = useState(false);
  async function handle(){if(saving||disabled)return;setSaving(true);try{await onClick();}finally{setSaving(false);}}
  return (
    <button className="btn bp" onClick={handle} disabled={saving||disabled}
      style={{minWidth:100,opacity:(saving||disabled)?.75:1,...style}}>
      {saving?(
        <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
          جاري الحفظ
          <span style={{display:"inline-flex",gap:3,marginRight:4}}>
            {[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:"currentColor",display:"inline-block",animation:"dotPulse 1.2s ease-in-out infinite",animationDelay:`${i*0.2}s`}}/>)}
          </span>
        </span>
      ):label}
    </button>
  );
}
function Mdl({onClose,title,children}) {
  return (
    <div className="mbg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mbox">
        <h3 style={{fontWeight:800,color:B,marginBottom:18,fontSize:17}}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
const logoImg = require("../../assets/logo-reetam.png");
function Logo({size}) {
  const s = size||40;
  return <img src={logoImg} width={s} height={s} style={{objectFit:"contain"}}/>;
}

// أيقونات القائمة الجانبية — من نظام التصميم الموحّد
const NAV_ICON: Record<string,string> = { dashboard:"dashboard", chalets:"home", bookings:"cal", finance:"money", investors:"users", maintenance:"wrench", wallets:"wallet", cleaning:"broom", smart:"temp", loyalty:"trophy", settings:"gear", sun:"sun", moon:"moon", menu:"menu" };
function NavIcon({id,size=18}:{id:string;size?:number}) {
  return <Icon n={NAV_ICON[id]||id} s={size}/>;
}
function AvailabilityCalendar({bookings,from,to,onPick}:{bookings:Booking[];from:string;to:string;onPick:(from:string,to:string)=>void}) {
  const B="#3B2A1C", S="#C9A36A", T="#6B5F52", SL="#FAF6F0";
  const [cur,setCur] = useState(()=>{ const d=new Date(); d.setDate(1); return d; });
  const MONTHS=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const DAYS=["أح","اث","ثل","أر","خم","جم","سب"];
  const today = new Date(); today.setHours(0,0,0,0);

  function toISO(d:Date){ return d.toISOString().slice(0,10); }
  function isBooked(d:Date){
    const t=d.getTime();
    return bookings.some(b=>{
      if(!b.date_from||!b.date_to) return false;
      const f=new Date(b.date_from).getTime(), tt=new Date(b.date_to).getTime();
      return t>=f && t<tt;
    });
  }
  function rangeHasBooked(f:Date,t:Date){
    const d=new Date(f);
    while(d<t){ if(isBooked(d)) return true; d.setDate(d.getDate()+1); }
    return false;
  }
  function clickDay(d:Date){
    if(d<today || isBooked(d)) return;
    if(!from || (from&&to)){
      onPick(toISO(d),"");
    }else{
      const f = new Date(from);
      if(d<=f){ onPick(toISO(d),""); return; }
      if(rangeHasBooked(f,d)){ onPick(toISO(d),""); return; }
      onPick(from,toISO(d));
    }
  }

  const y=cur.getFullYear(), m=cur.getMonth();
  const firstDay = new Date(y,m,1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const cells: (Date|null)[] = [...Array(startOffset).fill(null), ...Array(daysInMonth).fill(0).map((_,i)=>new Date(y,m,i+1))];

  const fromD = from?new Date(from):null;
  const toD = to?new Date(to):null;

  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <button onClick={()=>setCur(new Date(y,m-1,1))} style={{background:SL,border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:B}}>‹</button>
        <span style={{fontWeight:800,color:B,fontSize:13}}>{MONTHS[m]} {y}</span>
        <button onClick={()=>setCur(new Date(y,m+1,1))} style={{background:SL,border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:B}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:4}}>
        {DAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:T,fontWeight:700,padding:"2px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
        {cells.map((d,i)=>{
          if(!d) return <div key={i}/>;
          const past = d<today;
          const booked = isBooked(d);
          const isFrom = fromD && d.getTime()===fromD.getTime();
          const isTo = toD && d.getTime()===toD.getTime();
          const inRange = fromD && toD && d>fromD && d<toD;
          const disabled = past||booked;
          let bg="transparent", color=B, fontWeight=500, border="1px solid transparent";
          if(disabled){ bg="#F8D7D7"; color="#A33B3B"; }
          if(inRange){ bg="#E8DCC8"; color=B; fontWeight=700; }
          if(isFrom||isTo){ bg=B; color=S; fontWeight=800; border="1px solid "+B; }
          return (
            <div key={i} onClick={()=>clickDay(d)} style={{
              textAlign:"center",padding:"7px 0",borderRadius:8,fontSize:12,cursor:disabled?"not-allowed":"pointer",
              background:bg,color,fontWeight,border,textDecoration:disabled&&!past?"line-through":"none",opacity:past?.4:1,
              transition:"background .15s",
            }}>{d.getDate()}</div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:14,justifyContent:"center",marginTop:10}}>
        {[{c:"#F8D7D7",l:"محجوز"},{c:"#E8DCC8",l:"بين التاريخين"},{c:B,l:"محدد"}].map(x=>(
          <div key={x.l} style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:11,height:11,borderRadius:4,background:x.c,border:"1px solid rgba(201,163,106,.3)"}}/>
            <span style={{fontSize:10,color:T}}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type BusinessSettings = {bank_name?:string; bank_account_name?:string; bank_iban?:string};

function ChaletPublicPage({chaletName}:{chaletName:string}) {
  const B="#3B2A1C", BD="#241A11", S="#C9A36A", T="#6B5F52", SL="#FAF6F0";
  const [chalet,setChalet] = useState<Chalet|null>(null);
  const [biz,setBiz]       = useState<BusinessSettings|null>(null);
  const [lightbox,setLightbox] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [bookings,setBookings] = useState<Booking[]>([]);

  const [bkMode,setBkMode]   = useState<"overnight"|"hourly">("overnight");
  const [bkFrom,setBkFrom]   = useState("");
  const [bkTo,setBkTo]       = useState("");
  const [bkDay,setBkDay]     = useState("");
  const [bkSlot,setBkSlot]   = useState<number|null>(null);
  const [bkName,setBkName]   = useState("");
  const [bkPhone,setBkPhone] = useState("");
  const [bkErr,setBkErr]     = useState("");
  const [bkSubmitting,setBkSubmitting] = useState(false);
  const [bkDone,setBkDone]   = useState(false);

  useEffect(()=>{
    if(typeof document!=="undefined"){
      document.body.style.overflow="auto";
      document.documentElement.style.overflow="auto";
    }
  },[]);

  useEffect(()=>{
    (async()=>{
      const rows = await db("chalets","GET",null,`name=eq.${encodeURIComponent(chaletName)}`);
      const ch = rows?.[0] as Chalet | undefined;
      if(ch){
        setChalet(ch);
        const bs = await db("business_settings","GET",null,"id=eq.1");
        if(bs?.[0]) setBiz(bs[0] as BusinessSettings);
        const bks = await db("bookings","GET",null,`chalet=eq.${encodeURIComponent(ch.name)}&status=in.(confirmed,pending)&select=*`);
        setBookings((bks||[]) as Booking[]);
        if(ch.allow_overnight===false && ch.allow_hourly) setBkMode("hourly");
      }
      setLoading(false);
    })();
  },[chaletName]);

  function nightsCount(f:string,t:string){
    if(!f||!t) return 0;
    return Math.max(0, Math.round((new Date(t).getTime()-new Date(f).getTime())/86400000));
  }
  function calcPrice(f:string,t:string,chl:Chalet|null){
    if(!f||!t||!chl) return 0;
    const n = nightsCount(f,t);
    let total = 0;
    for(let i=0;i<n;i++){
      const d = new Date(f); d.setDate(d.getDate()+i);
      const isWeekend = d.getDay()===5||d.getDay()===6;
      total += isWeekend && chl.wprice ? Number(chl.wprice) : Number(chl.price);
    }
    return total;
  }
  function hasConflict(f:string,t:string){
    if(!f||!t) return false;
    const nf=new Date(f).getTime(), nt=new Date(t).getTime();
    return bookings.some(b=>{
      if(!b.date_from||!b.date_to) return false;
      const bf=new Date(b.date_from).getTime(), bt=new Date(b.date_to).getTime();
      return nf < bt && nt > bf;
    });
  }

  let hourlySlots: {name:string;from:string;to:string;price:string}[] = [];
  try { hourlySlots = chalet?.hourly_slots ? JSON.parse(chalet.hourly_slots as string) : []; } catch { hourlySlots = []; }

  function slotsTakenForDay(day:string){
    if(!day) return new Set<number>();
    return new Set(
      bookings
        .filter(b=>b.date_from===day && b.date_to===day && b.checkin_time)
        .map(b=>hourlySlots.findIndex(s=>s.from===b.checkin_time && s.to===b.checkout_time))
        .filter(i=>i>=0)
    );
  }
  function dayFullyBooked(day:string){
    if(!day) return false;
    return bookings.some(b=>{
      if(!b.date_from||!b.date_to) return false;
      const f=new Date(b.date_from).getTime(), t=new Date(b.date_to).getTime(), d=new Date(day).getTime();
      return d>=f && d<t && b.date_from!==b.date_to;
    });
  }

  async function submitBooking(){
    setBkErr("");
    if(!chalet) return;
    if(!bkName||!bkPhone){ setBkErr("أدخل اسمك ورقم جوالك"); return; }

    if(bkMode==="overnight"){
      if(!bkFrom||!bkTo){ setBkErr("اختر تاريخ الوصول والمغادرة"); return; }
      if(new Date(bkTo)<=new Date(bkFrom)){ setBkErr("تاريخ المغادرة يجب أن يكون بعد الوصول"); return; }
      if(hasConflict(bkFrom,bkTo)){ setBkErr("التواريخ المختارة محجوزة مسبقاً، اختر تواريخ أخرى"); return; }
    }else{
      if(!bkDay){ setBkErr("اختر اليوم"); return; }
      if(bkSlot===null){ setBkErr("اختر الفترة"); return; }
      if(dayFullyBooked(bkDay)){ setBkErr("هذا اليوم محجوز بالكامل (مبيت)"); return; }
      if(slotsTakenForDay(bkDay).has(bkSlot)){ setBkErr("هذي الفترة محجوزة، اختر فترة أخرى"); return; }
    }

    setBkSubmitting(true);
    const body = bkMode==="overnight"
      ? { chalet:chalet.name, guest:bkName, phone:bkPhone, date_from:bkFrom, date_to:bkTo, price:calcPrice(bkFrom,bkTo,chalet), status:"pending", payment_method:"تحويل بنكي", note:"حجز ذاتي من رابط الشاليه — بانتظار تأكيد التحويل" }
      : { chalet:chalet.name, guest:bkName, phone:bkPhone, date_from:bkDay, date_to:bkDay, checkin_time:hourlySlots[bkSlot!].from, checkout_time:hourlySlots[bkSlot!].to, price:Number(hourlySlots[bkSlot!].price)||0, status:"pending", payment_method:"تحويل بنكي", note:`حجز بالساعة (${hourlySlots[bkSlot!].name}) — بانتظار تأكيد التحويل` };

    const res = await fetch(`${SUPA_URL}/rest/v1/bookings`,{
      method:"POST",
      headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,"Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify(body),
    });
    setBkSubmitting(false);
    if(!res.ok){ setBkErr("تعذّر إتمام الحجز، حاول مرة أخرى"); return; }
    setBkDone(true);
  }

  if(loading) return <div dir="rtl" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}><div style={{textAlign:"center",color:T}}><div style={{fontSize:40,marginBottom:8}}>⌛</div>جاري التحميل...</div></div>;
  if(!chalet) return <div dir="rtl" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}><div style={{textAlign:"center",color:T}}><div style={{fontSize:40,marginBottom:8}}>🏠</div>الشاليه غير موجود</div></div>;

  let galleryRaw: unknown[] = [];
  try { galleryRaw = chalet.gallery ? JSON.parse(chalet.gallery as string) : []; } catch { galleryRaw = []; }
  const gallery = galleryRaw.map(galleryUrl).filter(Boolean) as string[];
  const allImages = [chalet.img, ...gallery].filter(Boolean) as string[];
  const amenitiesList = (chalet.amenities||"").split(/[،,]/).map(a=>a.trim()).filter(Boolean);

  return (
    <div dir="rtl" style={{fontFamily:"'IBM Plex Sans Arabic',sans-serif",background:"#F5F0E8",minHeight:"100vh"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Kufi+Arabic:wght@600;700&display=swap');*{box-sizing:border-box}html,body{overflow-y:auto!important;height:auto!important;min-height:100vh}#root{height:auto;overflow:visible}`}</style>

      <div style={{background:`linear-gradient(135deg,${B},${BD})`,padding:"14px 20px",display:"flex",alignItems:"center",gap:10}}>
        <Logo size={30}/>
        <span style={{color:S,fontWeight:800,fontSize:15}}>مجموعة ريتام</span>
      </div>

      <div style={{position:"relative",height:280,overflow:"hidden",background:`linear-gradient(135deg,${B},${BD})`}}>
        {allImages[0]
          ? <img src={allImages[0]} style={{width:"100%",height:"100%",objectFit:"cover"}} onClick={()=>setLightbox(allImages[0])}/>
          : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:60,opacity:.25}}>🏠</span></div>}
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(23,19,15,.85))",padding:"40px 20px 18px"}}>
          <div style={{color:"#fff",fontWeight:900,fontSize:26}}>{chalet.name}</div>
          <div style={{color:"rgba(255,255,255,.75)",fontSize:13,marginTop:4}}>📍 {chalet.loc}</div>
        </div>
      </div>

      <div style={{maxWidth:680,margin:"0 auto",padding:"20px 16px 80px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
          {[
            {icon:"👥",label:"السعة",val:chalet.cap+" شخص"},
            {icon:"🌙",label:"سعر الليلة",val:chalet.price+" ريال"},
            {icon:"🎉",label:"سعر الويكند",val:(chalet.wprice?chalet.wprice+" ريال":"—")},
          ].map(s=>(
            <div key={s.label} style={{background:"#fff",borderRadius:14,padding:"14px 10px",textAlign:"center",border:"1px solid rgba(201,163,106,.2)"}}>
              <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
              <div style={{fontWeight:900,color:B,fontSize:15}}>{s.val}</div>
              <div style={{fontSize:10,color:T,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {chalet.description && (
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,border:"1px solid rgba(201,163,106,.2)"}}>
            <div style={{fontWeight:800,color:B,fontSize:14,marginBottom:8}}>📝 عن الشاليه</div>
            <div style={{color:T,fontSize:13.5,lineHeight:1.8}}>{chalet.description}</div>
          </div>
        )}

        {amenitiesList.length>0 && (
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,border:"1px solid rgba(201,163,106,.2)"}}>
            <div style={{fontWeight:800,color:B,fontSize:14,marginBottom:12}}>✨ المميزات</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {amenitiesList.map(a=>(
                <span key={a} style={{background:SL,color:B,borderRadius:99,padding:"6px 14px",fontSize:12.5,fontWeight:700,border:"1px solid rgba(201,163,106,.25)"}}>✓ {a}</span>
              ))}
            </div>
          </div>
        )}

        {allImages.length>1 && (
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,border:"1px solid rgba(201,163,106,.2)"}}>
            <div style={{fontWeight:800,color:B,fontSize:14,marginBottom:12}}>📷 صور الشاليه</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {allImages.map((img,i)=>(
                <div key={i} onClick={()=>setLightbox(img)} style={{height:90,borderRadius:10,overflow:"hidden",cursor:"pointer"}}>
                  <img src={img} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                </div>
              ))}
            </div>
          </div>
        )}

        {bkDone ? (
          <div style={{background:"#fff",borderRadius:16,padding:22,border:"2px solid #4CAF50",textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:10}}>✅</div>
            <div style={{fontWeight:900,color:B,fontSize:17,marginBottom:8}}>تم استلام طلب حجزك</div>
            <div style={{color:T,fontSize:13.5,lineHeight:1.8,marginBottom:18}}>
              حجزك بانتظار التأكيد بعد استلام التحويل. حوّل المبلغ على الحساب التالي وأرسل صورة الإيصال عبر واتساب لتسريع التأكيد.
            </div>
            {(biz?.bank_iban||biz?.bank_name) && (
              <div style={{background:SL,borderRadius:12,padding:16,marginBottom:16,textAlign:"right"}}>
                {biz?.bank_name && <div style={{fontSize:13,color:T,marginBottom:6}}><b style={{color:B}}>البنك:</b> {biz.bank_name}</div>}
                {biz?.bank_account_name && <div style={{fontSize:13,color:T,marginBottom:6}}><b style={{color:B}}>اسم الحساب:</b> {biz.bank_account_name}</div>}
                {biz?.bank_iban && <div style={{fontSize:13,color:T,direction:"ltr",textAlign:"right",fontFamily:"monospace"}}><b style={{color:B,fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}>IBAN: </b>{biz.bank_iban}</div>}
              </div>
            )}
            <a href={`https://wa.me/?text=${encodeURIComponent(`مرحباً، حوّلت قيمة حجز شاليه ${chalet.name} باسم ${bkName}، مرفق صورة الإيصال`)}`} target="_blank" rel="noreferrer"
              style={{display:"block",textAlign:"center",background:"#1F8A4C",color:"#fff",borderRadius:12,padding:"13px",fontWeight:800,fontSize:14,textDecoration:"none"}}>
              📲 أرسل إيصال التحويل عبر واتساب
            </a>
          </div>
        ) : (
          <div style={{background:"#fff",borderRadius:16,padding:18,border:"1px solid rgba(201,163,106,.2)"}}>
            <div style={{fontWeight:800,color:B,fontSize:15,marginBottom:14}}>📅 احجز الآن</div>
            <div style={{fontSize:11.5,color:T,marginBottom:14}}>
              {bkMode==="overnight" ? "اضغط على تاريخ الوصول من التقويم، ثم تاريخ المغادرة" : "اختر اليوم ثم الفترة المناسبة"}
            </div>

            {chalet.allow_overnight!==false && chalet.allow_hourly && (
              <div style={{display:"flex",gap:8,marginBottom:16,background:SL,borderRadius:12,padding:4}}>
                <button onClick={()=>setBkMode("overnight")} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:13,background:bkMode==="overnight"?B:"transparent",color:bkMode==="overnight"?S:T}}>🌙 مبيت</button>
                <button onClick={()=>setBkMode("hourly")} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:13,background:bkMode==="hourly"?B:"transparent",color:bkMode==="hourly"?S:T}}>⏱ بالساعة</button>
              </div>
            )}

            {bkMode==="overnight" ? (
              <>
                <AvailabilityCalendar bookings={bookings} from={bkFrom} to={bkTo} onPick={(f,t)=>{setBkFrom(f);setBkTo(t);}}/>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <label style={{fontSize:11,color:T,fontWeight:600,display:"block",marginBottom:5}}>تاريخ الوصول</label>
                    <input type="date" value={bkFrom} min={new Date().toISOString().slice(0,10)} onChange={e=>setBkFrom(e.target.value)}
                      style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(201,163,106,.4)",fontSize:13,fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:B,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,color:T,fontWeight:600,display:"block",marginBottom:5}}>تاريخ المغادرة</label>
                    <input type="date" value={bkTo} min={bkFrom||new Date().toISOString().slice(0,10)} onChange={e=>setBkTo(e.target.value)}
                      style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(201,163,106,.4)",fontSize:13,fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:B,boxSizing:"border-box"}}/>
                  </div>
                </div>

                {bkFrom&&bkTo&&new Date(bkTo)>new Date(bkFrom)&&(
                  hasConflict(bkFrom,bkTo)
                    ? <div style={{background:"#FFF5F5",color:"#A63A2A",borderRadius:10,padding:"10px 12px",fontSize:12.5,fontWeight:700,marginBottom:10}}>⚠️ هذي التواريخ محجوزة مسبقاً</div>
                    : <div style={{background:SL,borderRadius:10,padding:"10px 12px",marginBottom:10,display:"flex",justifyContent:"space-between",fontSize:13}}>
                        <span style={{color:T}}>{nightsCount(bkFrom,bkTo)} ليالي</span>
                        <span style={{fontWeight:900,color:B}}>{calcPrice(bkFrom,bkTo,chalet).toLocaleString("en-US")} ريال</span>
                      </div>
                )}
              </>
            ) : (
              <>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,color:T,fontWeight:600,display:"block",marginBottom:5}}>اليوم</label>
                  <input type="date" value={bkDay} min={new Date().toISOString().slice(0,10)} onChange={e=>{setBkDay(e.target.value);setBkSlot(null);}}
                    style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(201,163,106,.4)",fontSize:13,fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:B,boxSizing:"border-box"}}/>
                </div>

                {bkDay && dayFullyBooked(bkDay) && (
                  <div style={{background:"#FFF5F5",color:"#A63A2A",borderRadius:10,padding:"10px 12px",fontSize:12.5,fontWeight:700,marginBottom:10}}>⚠️ هذا اليوم محجوز بالكامل (مبيت)</div>
                )}

                {bkDay && !dayFullyBooked(bkDay) && (
                  hourlySlots.length===0
                    ? <div style={{color:T,fontSize:12.5,marginBottom:10}}>لا توجد فترات محددة لهذا الشاليه بعد</div>
                    : (()=>{ const taken=slotsTakenForDay(bkDay); return (
                        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                          {hourlySlots.map((s,i)=>{
                            const isTaken=taken.has(i), isSel=bkSlot===i;
                            return (
                              <div key={i} onClick={()=>!isTaken&&setBkSlot(i)} style={{
                                display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:10,cursor:isTaken?"not-allowed":"pointer",
                                background:isSel?B:isTaken?"#FFF1F1":SL, border:"1px solid "+(isSel?B:"rgba(201,163,106,.3)"),opacity:isTaken?.6:1,
                              }}>
                                <div>
                                  <div style={{fontWeight:800,fontSize:13,color:isSel?S:isTaken?"#A33B3B":B}}>{s.name||"فترة"}{isTaken&&" (محجوزة)"}</div>
                                  <div style={{fontSize:11,color:isSel?"rgba(255,255,255,.7)":T,direction:"ltr",textAlign:"right"}}>{s.from} – {s.to}</div>
                                </div>
                                <div style={{fontWeight:900,fontSize:14,color:isSel?S:B}}>{s.price} ر</div>
                              </div>
                            );
                          })}
                        </div>
                      );})()
                )}
              </>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10,marginTop:bkMode==="hourly"?0:10}}>
              <div>
                <label style={{fontSize:11,color:T,fontWeight:600,display:"block",marginBottom:5}}>اسمك</label>
                <input value={bkName} onChange={e=>setBkName(e.target.value)} placeholder="الاسم الكامل"
                  style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(201,163,106,.4)",fontSize:13,fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:B,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:11,color:T,fontWeight:600,display:"block",marginBottom:5}}>رقم الجوال</label>
                <input value={bkPhone} onChange={e=>setBkPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr"
                  style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(201,163,106,.4)",fontSize:13,fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:B,boxSizing:"border-box"}}/>
              </div>
            </div>

            <div style={{background:SL,borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12.5,color:T,display:"flex",alignItems:"center",gap:8}}>
              <span>💳</span><span><b style={{color:B}}>طريقة الدفع:</b> تحويل بنكي</span>
            </div>

            {bkErr && <div style={{background:"#FFF5F5",color:"#A63A2A",borderRadius:10,padding:"10px 12px",fontSize:12.5,fontWeight:700,marginBottom:12}}>{bkErr}</div>}

            <button onClick={submitBooking} disabled={bkSubmitting}
              style={{width:"100%",background:bkSubmitting?"#999":B,color:S,border:"none",borderRadius:14,padding:"14px",fontWeight:800,fontSize:15,cursor:bkSubmitting?"not-allowed":"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",marginBottom:10}}>
              {bkSubmitting?"جاري إرسال الطلب...":"تأكيد الحجز"}
            </button>

            <a href={`https://wa.me/?text=${encodeURIComponent("مرحباً، أبغى أستفسر عن شاليه "+chalet.name)}`} target="_blank" rel="noreferrer"
              style={{display:"block",textAlign:"center",background:"rgba(37,211,102,.1)",color:"#1a9e4f",borderRadius:12,padding:"11px",fontWeight:700,fontSize:13,textDecoration:"none"}}>
              📲 أو استفسر عبر واتساب
            </a>
          </div>
        )}
      </div>

      {lightbox && (
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:20}}>
          <img src={lightbox} style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:12,objectFit:"contain"}}/>
        </div>
      )}
    </div>
  );
}

function RowActionsMenu({actions}:{actions:{label:string; onClick:(e:React.MouseEvent)=>void; color?:string}[]}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{position:"relative",display:"inline-block"}} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:"rgba(201,163,106,.15)",color:B,border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:18,fontWeight:900,lineHeight:1}}>⋮</button>
      {open&&(
        <>
          <div style={{position:"fixed",inset:0,zIndex:299}} onClick={()=>setOpen(false)}/>
          <div style={{position:"absolute",top:"110%",left:0,zIndex:300,background:"#fff",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.2)",border:"1px solid rgba(201,163,106,.2)",minWidth:180,overflow:"hidden"}}>
            {actions.map((a,i)=>(
              <button key={i} onClick={e=>{setOpen(false);a.onClick(e);}}
                style={{display:"block",width:"100%",textAlign:"right",padding:"10px 14px",background:"none",border:"none",borderBottom:i<actions.length-1?"1px solid rgba(201,163,106,.12)":"none",cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontSize:13,fontWeight:600,color:a.color||B}}>
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function Tbl({heads,rows,footer}) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{heads.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {rows}
          {footer&&<tr style={{background:SL}}>{footer}</tr>}
        </tbody>
      </table>
    </div>
  );
}

const BASE_URL = "https://chalet-app-five.vercel.app";

function LoyaltyAdminPage({ cards, reviews, onReload }: { cards: LoyaltyCard[]; reviews: Review[]; onReload: () => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all"|"pending"|"active">("all");
  const [editMdl, setEditMdl] = useState<LoyaltyCard | null>(null);
  const [addMdl, setAddMdl] = useState(false);
  const [newCard, setNewCard] = useState({ name:"", phone:"", tickets:0, free_nights:0 });
  const [saving, setSaving] = useState(false);

  const totalMembers  = cards.length;
  const totalPending  = cards.filter(c => c.free_nights > 0).length;
  const totalReviews  = cards.reduce((s, c) => s + c.total_reviews, 0);
  const nearlyThere   = cards.filter(c => c.tickets === 2).length;

  const filtered = cards.filter(c => {
    const matchSearch = !search || c.name.includes(search) || c.phone.includes(search);
    const matchFilter =
      filter === "all"     ? true :
      filter === "pending" ? c.free_nights > 0 :
      filter === "active"  ? c.tickets > 0 : true;
    return matchSearch && matchFilter;
  });

  async function useNight(c: LoyaltyCard) {
    if (!confirm(`هل تم استخدام ليلة مجانية لـ ${c.name}؟`)) return;
    await db("loyalty_cards", "PATCH", { free_nights: c.free_nights - 1, updated_at: new Date().toISOString() }, c.id);
    onReload();
  }

  async function saveEdit() {
    if (!editMdl) return;
    setSaving(true);
    await db("loyalty_cards", "PATCH", {
      name: editMdl.name, phone: editMdl.phone,
      tickets: Number(editMdl.tickets), free_nights: Number(editMdl.free_nights),
      updated_at: new Date().toISOString(),
    }, editMdl.id);
    setSaving(false);
    setEditMdl(null);
    onReload();
  }

  async function deleteCard(c: LoyaltyCard) {
    if (!confirm(`حذف بطاقة ${c.name}؟`)) return;
    await db("loyalty_cards", "DELETE", undefined, `id=eq.${c.id}`);
    onReload();
  }

  const avgRating = reviews.length ? reviews.reduce((s,r)=>s+r.rating,0)/reviews.length : 0;
  const stars = (r: number) => (
    <span className="x-stars" aria-label={r + " من 5"}>
      {[1,2,3,4,5].map(i => <svg key={i} width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ color: i <= r ? "var(--gold)" : "var(--line)" }} aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.1 6.1-.7z"/></svg>)}
    </span>
  );

  return (
    <div className="x-page">
      <PageHead title="الولاء والتقييمات" sub="كل 3 تذاكر تساوي ليلة مجانية في أي شاليه">
        <button className="btn bp" onClick={() => { setNewCard({name:"",phone:"",tickets:0,free_nights:0}); setAddMdl(true); }}><Icon n="plus"/>إضافة عميل</button>
      </PageHead>

      <div className="x-kpis">
        <Kpi hero label="متوسط التقييم" value={<>{avgRating ? avgRating.toFixed(1) : "—"}<small> من 5</small></>} sub={reviews.length + " تقييم · " + reviews.filter(r=>r.rating===5).length + " بخمس نجوم"}/>
        <Kpi label="أعضاء البرنامج" value={totalMembers}/>
        <Kpi label="على وشك الجائزة" value={nearlyThere} sub="لديهم تذكرتان"/>
        <Kpi label="ليالٍ مجانية معلقة" value={cards.reduce((s,c)=>s+c.free_nights,0)} sub={totalPending + " عميل لم يستخدمها"}/>
      </div>

      <div className="x-page">
        <div className="x-card">
          <CardHead icon="star" title="تقييمات الضيوف" sub={reviews.length ? "الأحدث أولاً" : undefined}/>
          {reviews.length === 0 ? <Empty>لا توجد تقييمات بعد</Empty> : (
            <div className="x-list">
              {[...reviews].reverse().map((r,i) => (
                <div key={i} className="x-li" style={{ alignItems:"flex-start" }}>
                  <div className="meta">
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"center", flexWrap:"wrap" }}><b>{r.guest}</b>{stars(r.rating)}</div>
                    <span>{r.chalet + " · " + new Date(r.created_at).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")}</span>
                    {r.comment && <p style={{ marginTop:6, fontSize:14, color:"var(--text)", lineHeight:1.7 }}>{r.comment}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="x-card">
          <div className="x-card-h">
            <h2><Icon n="trophy"/>الأعضاء</h2>
            <Seg label="تصفية" value={filter} onChange={v=>setFilter(v)} options={[{v:"all",l:"الكل",c:cards.length},{v:"pending",l:"ليالٍ معلقة",c:totalPending},{v:"active",l:"لديهم تذاكر",c:cards.filter(c=>c.tickets>0).length}]}/>
          </div>
          <div style={{ padding:"12px 20px 0" }}>
            <input className="x-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الجوال" aria-label="بحث في الأعضاء"/>
          </div>
          {filtered.length === 0 ? <Empty>لا يوجد عملاء</Empty> : (
            <div className="x-list" style={{ marginTop:8 }}>
              {filtered.map(c => {
                const loyaltyUrl = `${BASE_URL}?guest=1&m=loyalty&phone=${c.phone}`;
                return (
                  <div key={c.id} className="x-li" style={{ flexWrap:"wrap" }}>
                    <div className="meta" style={{ minWidth:160 }}>
                      <b>{c.name}</b>
                      <span className="x-mono" style={{ textAlign:"right" }}>{c.phone}</span>
                    </div>
                    <div style={{ display:"flex", gap:4 }} aria-label={c.tickets + " من 3 تذاكر"}>
                      {[0,1,2].map(i => <span key={i} style={{ width:16, height:16, borderRadius:4, background: i < c.tickets ? "var(--gold)" : "var(--line)" }}/>)}
                    </div>
                    {c.free_nights > 0 && <Pill tone="warn">{c.free_nights + " ليلة مجانية"}</Pill>}
                    <div className="acts">
                      {c.free_nights > 0 && <button className="btn bp bsm" onClick={() => useNight(c)}><Icon n="gift" s={15}/>استخدام ليلة</button>}
                      <button className="btn bo bsm" onClick={() => window.open(loyaltyUrl, "_blank")}><Icon n="ticket" s={15}/>البطاقة</button>
                      <button className="btn bshare bsm" aria-label="إرسال واتساب" onClick={() => {
                        const ph = c.phone.replace(/^0/, "966");
                        const msg = `مرحباً ${c.name}! 🌟%0aلديك ${c.tickets}/3 تذاكر في برنامج ولاء ريتام%0aشاهد بطاقتك: ${loyaltyUrl}`;
                        window.open(`https://wa.me/${ph}?text=${msg}`, "_blank");
                      }}><Icon n="send" s={15}/></button>
                      <button className="btn bo bsm" aria-label="تعديل" onClick={() => setEditMdl({...c})}><Icon n="edit" s={15}/></button>
                      <button className="btn bd bsm" aria-label="حذف" onClick={() => deleteCard(c)}><Icon n="trash" s={15}/></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editMdl && (
        <div className="mbg" onClick={e => e.target === e.currentTarget && setEditMdl(null)}>
          <div className="mbox">
            <h3 style={{ fontWeight:800, marginBottom:16, fontSize:16 }}>✏️ تعديل بطاقة الولاء</h3>
            <label className="lbl">الاسم</label>
            <input className="inp" value={editMdl.name} onChange={e => setEditMdl(p => ({...p!, name:e.target.value}))} style={{ marginBottom:10 }}/>
            <label className="lbl">الجوال</label>
            <input className="inp" value={editMdl.phone} onChange={e => setEditMdl(p => ({...p!, phone:e.target.value}))} style={{ marginBottom:10, direction:"ltr" }}/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              <div>
                <label className="lbl">التذاكر (0-2)</label>
                <select className="inp" value={editMdl.tickets} onChange={e => setEditMdl(p => ({...p!, tickets:Number(e.target.value)}))}>
                  {[0,1,2].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">الليالي المجانية</label>
                <input className="inp" type="number" min={0} value={editMdl.free_nights} onChange={e => setEditMdl(p => ({...p!, free_nights:Number(e.target.value)}))}/>
              </div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn bp" onClick={saveEdit} disabled={saving} style={{ flex:1 }}>{saving ? "جاري الحفظ..." : "حفظ"}</button>
              <button className="btn" onClick={() => setEditMdl(null)} style={{ flex:1 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {addMdl && (
        <div className="mbg" onClick={e => e.target === e.currentTarget && setAddMdl(false)}>
          <div className="mbox">
            <h3 style={{ fontWeight:800, marginBottom:16, fontSize:16 }}>➕ إضافة عميل جديد</h3>
            <label className="lbl">الاسم</label>
            <input className="inp" value={newCard.name} onChange={e => setNewCard(p=>({...p,name:e.target.value}))} placeholder="اسم العميل" style={{ marginBottom:10 }}/>
            <label className="lbl">الجوال</label>
            <input className="inp" value={newCard.phone} onChange={e => setNewCard(p=>({...p,phone:e.target.value}))} placeholder="05XXXXXXXX" style={{ marginBottom:10, direction:"ltr" }}/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              <div>
                <label className="lbl">التذاكر (0-2)</label>
                <select className="inp" value={newCard.tickets} onChange={e => setNewCard(p=>({...p,tickets:Number(e.target.value)}))}>
                  {[0,1,2].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">الليالي المجانية</label>
                <input className="inp" type="number" min={0} value={newCard.free_nights} onChange={e => setNewCard(p=>({...p,free_nights:Number(e.target.value)}))}/>
              </div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn bp" disabled={saving||!newCard.name||!newCard.phone} style={{ flex:1 }} onClick={async()=>{
                if(!newCard.name||!newCard.phone) return;
                setSaving(true);
                await db("loyalty_cards","POST",{name:newCard.name,phone:newCard.phone,tickets:newCard.tickets,free_nights:newCard.free_nights,total_reviews:0});
                setSaving(false); setAddMdl(false); onReload();
              }}>{saving?"جاري الحفظ...":"حفظ"}</button>
              <button className="btn" onClick={()=>setAddMdl(false)} style={{ flex:1 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DoneCard({booking, submitted, B, T, card}: {booking: any; submitted: boolean; B: string; T: string; card: object}) {
  const phone = booking?.phone?.replace(/[^0-9]/g,"").replace(/^966/,"0") || "";
  const loyaltyUrl = phone ? `https://chalet-app-five.vercel.app?guest=1&m=loyalty&phone=${phone}` : "";
  return (
    <div style={{...card as any, textAlign:"center"}}>
      <div style={{fontSize:60, marginBottom:12}}>🌟</div>
      <div style={{fontSize:22, fontWeight:800, color:B, marginBottom:8}}>شكراً لك!</div>
      <div style={{fontSize:14, color:T}}>{submitted ? "تم إرسال تقييمك 😊" : "لقد قيّمت هذا الحجز مسبقاً"}</div>
      <div style={{marginTop:20, background:"linear-gradient(135deg,#2C1810,#3D2B1A)", borderRadius:16, padding:16, border:"1px solid rgba(201,163,106,.3)"}}>
        <div style={{fontSize:20, marginBottom:6}}>🎫</div>
        <div style={{fontWeight:800, color:"#C8B89A", fontSize:14, marginBottom:4}}>حصلت على تذكرة ولاء!</div>
        <div style={{fontSize:12, color:"rgba(201,163,106,.7)", marginBottom:12}}>اجمع 3 تذاكر واحصل على ليلة مجانية</div>
        {loyaltyUrl
          ? <a href={loyaltyUrl} target="_blank" rel="noopener noreferrer" style={{display:"block", background:"linear-gradient(135deg,#B8960C,#C8B89A)", color:"#1a1a2e", borderRadius:10, padding:"10px 16px", fontWeight:800, fontSize:13, textDecoration:"none"}}>🏆 شاهد بطاقتك</a>
          : <div style={{fontSize:12, color:"rgba(201,163,106,.5)"}}>تواصل معنا لمعرفة رصيد تذاكرك</div>
        }
      </div>
      <div style={{marginTop:16, fontSize:13, color:T}}>مجموعة ريتام للشاليهات 🏖️</div>
    </div>
  );
}

function GuestPageEmbed({bookingId, mode}) {
  const [step,setStep] = useState("loading");
  const [booking,setBooking] = useState(null);
  const [rating,setRating] = useState(0);
  const [hover,setHover] = useState(0);
  const [comment,setComment] = useState("");
  const [submitted,setSubmitted] = useState(false);
  const [pdplConsent,setPdplConsent] = useState(false);
  const [chaletTerms,setChaletTerms] = useState<string | null>(null);
  const TERMS = chaletTerms || `شروط وأحكام الإقامة — مجموعة ريتام\n\n١. يُمنع إدخال المسكرات أو المخدرات.\n٢. يُمنع إقامة الحفلات الصاخبة.\n٣. المحافظة على نظافة الشاليه.\n٤. أي تلف يتحمله الضيف.\n٥. وقت تسجيل الخروج ١٢:٠٠ ظهراً.\n٦. يُمنع إدخال حيوانات أليفة.\n٧. في حالة الإلغاء قبل ٤٨ ساعة يُسترد المبلغ.`;

  useEffect(()=>{
    if(!bookingId){setStep("error");return;}
    async function load(){
      const data=await db("bookings","GET",null,`id=eq.${bookingId}`);
      if(!data||!data[0]){setStep("error");return;}
      setBooking(data[0]);
      if(mode==="review"){
        const rv=await db("reviews","GET",null,`booking_id=eq.${bookingId}`);
        if(rv&&rv[0]){setStep("done");return;}
        setStep("review");
      } else if(mode==="pool"){
        setStep("pool");
      } else {
        const cdata=await db("chalets","GET",null,`name=eq.${encodeURIComponent(data[0].chalet)}`);
        if(cdata&&cdata[0]&&cdata[0].terms) setChaletTerms(cdata[0].terms);
        const ci=await db("guest_checkins","GET",null,`booking_id=eq.${bookingId}`);
        if(ci&&ci[0]){setStep("confirmed");}
        else setStep("terms");
      }
    }
    load();
  },[]);

  async function acceptTerms(){
    const now=new Date().toISOString();
    if(!booking) return;
    const res=await db("guest_checkins","POST",{booking_id:Number(bookingId),chalet:booking.chalet,guest:booking.guest,phone:booking.phone,checked_in_at:now,terms_accepted:true,terms_accepted_at:now});
    if(res&&res[0]) setStep("confirmed");
  }
  async function submitReview(){
    if(!rating||!booking) return;
    await db("reviews","POST",{booking_id:Number(bookingId),chalet:booking.chalet,guest:booking.guest,rating,comment});
    // منح تذكرة ولاء
    if(booking.phone){
      const phone=booking.phone.replace(/[^0-9]/g,"").replace(/^966/,"0");
      const existing=await db("loyalty_cards","GET",null,`phone=eq.${phone}`);
      if(existing&&existing[0]){
        const cur=existing[0];
        const newTickets=cur.tickets>=2 ? 0 : cur.tickets+1;
        const newFree=cur.tickets>=2 ? cur.free_nights+1 : cur.free_nights;
        await db("loyalty_cards","PATCH",{tickets:newTickets,free_nights:newFree,total_reviews:cur.total_reviews+1,name:booking.guest,updated_at:new Date().toISOString()},cur.id);
      } else {
        await db("loyalty_cards","POST",{phone,name:booking.guest,tickets:1,free_nights:0,total_reviews:1});
      }
    }
    setSubmitted(true); setStep("done");
  }

  const GS = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Kufi+Arabic:wght@600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'IBM Plex Sans Arabic',sans-serif;background:#F5F0E8;min-height:100vh}`;
  const wrap = {fontFamily:"'IBM Plex Sans Arabic',sans-serif",minHeight:"100vh",background:"#F5F0E8",display:"flex",alignItems:"center",justifyContent:"center",padding:16};
  const card = {background:W,borderRadius:20,padding:24,maxWidth:480,width:"100%",boxShadow:"0 4px 24px rgba(59,42,28,.1)"};

  if(step==="loading"||(!booking&&step!=="error")) return <div dir="rtl" style={wrap}><style>{GS}</style><div style={{textAlign:"center",color:T}}><div style={{fontSize:40}}>⌛</div><div style={{marginTop:12,fontWeight:600}}>جاري التحميل...</div></div></div>;
  if(step==="error") return <div dir="rtl" style={wrap}><style>{GS}</style><div style={{...card,textAlign:"center"}}><div style={{fontSize:48}}>❌</div><div style={{fontSize:18,fontWeight:800,color:B,marginTop:12}}>رابط غير صحيح</div></div></div>;

  return (
    <div dir="rtl" style={wrap}>
      <style>{GS}</style>
      {step==="terms"&&(
        <div style={card}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:40,marginBottom:8}}>📋</div>
            <div style={{fontSize:20,fontWeight:800,color:B}}>أهلاً {booking.guest}!</div>
            <div style={{fontSize:13,color:T,marginTop:4}}>{booking.chalet}</div>
          </div>
          <div style={{background:"#FAF6F0",borderRadius:12,padding:16,marginBottom:16,maxHeight:260,overflowY:"auto"}}>
            <div style={{fontWeight:800,color:B,marginBottom:10,fontSize:14}}>📄 شروط وأحكام الإقامة</div>
            <div style={{fontSize:13,color:B,lineHeight:2,whiteSpace:"pre-line"}}>{TERMS}</div>
          </div>

          {/* إشعار خصوصية PDPL */}
          <div style={{background:"#EFF6FF",borderRadius:12,padding:14,marginBottom:16,border:"1px solid #BFDBFE"}}>
            <div style={{fontWeight:700,color:"#1E40AF",fontSize:13,marginBottom:8}}>🔒 إشعار حماية البيانات الشخصية</div>
            <div style={{fontSize:12,color:"#1E3A8A",lineHeight:1.8}}>
              وفقاً لنظام حماية البيانات الشخصية (PDPL)، تقوم مجموعة ريتام بجمع اسمك ورقم جوالك لأغراض إدارة الحجز وبرنامج الولاء وتحسين خدماتنا. لن تُشارَك بياناتك مع أطراف خارجية. يحق لك طلب الاطلاع على بياناتك أو تعديلها أو حذفها عبر التواصل معنا.
            </div>
          </div>

          {/* موافقة صريحة */}
          <label style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:16,cursor:"pointer"}}>
            <input type="checkbox" checked={pdplConsent} onChange={e=>setPdplConsent(e.target.checked)}
              style={{width:18,height:18,marginTop:2,accentColor:B,flexShrink:0,cursor:"pointer"}}/>
            <span style={{fontSize:13,color:B,lineHeight:1.7}}>
              أوافق على جمع واستخدام بياناتي الشخصية (الاسم ورقم الجوال) لأغراض إدارة الحجز وبرنامج الولاء وفق سياسة الخصوصية المذكورة أعلاه.
            </span>
          </label>

          <button onClick={acceptTerms} disabled={!pdplConsent} style={{
            width:"100%",border:"none",cursor:pdplConsent?"pointer":"not-allowed",borderRadius:12,
            fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:16,padding:14,
            background:pdplConsent?`linear-gradient(135deg,${B},#241A11)`:"#D1D5DB",
            color:pdplConsent?S:"#9CA3AF",transition:"all .2s",
          }}>
            ✅ أوافق وأسجّل دخولي
          </button>
        </div>
      )}
      {step==="confirmed"&&(
        <div style={{...card,textAlign:"center"}}>
          <div style={{fontSize:60,marginBottom:12}}>✅</div>
          <div style={{fontSize:22,fontWeight:800,color:B,marginBottom:8}}>تم تسجيل دخولك!</div>
          <div style={{fontSize:14,color:T,marginBottom:20}}>أهلاً وسهلاً في {booking.chalet}</div>
          <div style={{background:"rgba(107,95,82,.08)",borderRadius:12,padding:14,fontSize:13,color:T}}>
            🌡️ المكيف متاح · 📶 الواي فاي · 📞 للطوارئ اتصل بالإدارة
          </div>
        </div>
      )}
      {step==="review"&&(
        <div style={card}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:40,marginBottom:8}}>⭐</div>
            <div style={{fontSize:20,fontWeight:800,color:B}}>كيف كانت إقامتك؟</div>
            <div style={{fontSize:13,color:T,marginTop:4}}>{booking.chalet} · {booking.guest}</div>
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:16}}>
            {[1,2,3,4,5].map(s=>(
              <span key={s} onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(0)} onClick={()=>setRating(s)}
                style={{fontSize:44,cursor:"pointer",color:(hover||rating)>=s?"#F59E0B":"#D1D5DB"}}>
                {(hover||rating)>=s?"★":"☆"}
              </span>
            ))}
          </div>
          {rating>0&&<div style={{textAlign:"center",marginBottom:12,fontSize:14,fontWeight:600,color:T}}>{["","ضعيف 😞","مقبول 😐","جيد 😊","ممتاز 😄","رائع! 🌟"][rating]}</div>}
          <textarea placeholder="شاركنا تجربتك... (اختياري)" value={comment} onChange={e=>setComment(e.target.value)} rows={3}
            style={{width:"100%",padding:"12px 14px",border:"1.5px solid rgba(201,163,106,.4)",borderRadius:12,fontSize:14,fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:B,background:"#F5F0E8",outline:"none",resize:"none",marginBottom:16}}/>
          <button onClick={submitReview} disabled={!rating}
            style={{width:"100%",border:"none",cursor:rating?"pointer":"not-allowed",borderRadius:12,fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:16,padding:14,background:rating?`linear-gradient(135deg,${B},#241A11)`:"#D1D5DB",color:rating?S:"#fff"}}>
            إرسال التقييم ✈️
          </button>
        </div>
      )}
      {step==="done"&&<DoneCard booking={booking} submitted={submitted} B={B} T={T} card={card}/>}
      {step==="pool"&&(
        <div style={card}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:48,marginBottom:8}}>🏊</div>
            <div style={{fontSize:20,fontWeight:800,color:B}}>خيار المسبح</div>
            <div style={{fontSize:13,color:T,marginTop:4}}>{booking?.chalet} · {booking?.guest}</div>
            <div style={{fontSize:12,color:T,marginTop:6,background:"#FAF6F0",borderRadius:8,padding:"8px 12px"}}>
              تعبئة المسبح تتم مرة واحدة فقط خلال الإقامة
            </div>
          </div>
          <PoolGuestForm booking={booking} onDone={()=>setStep("pool_done")}/>
        </div>
      )}
      {step==="pool_done"&&(
        <div style={{...card,textAlign:"center"}}>
          <div style={{fontSize:60,marginBottom:12}}>✅</div>
          <div style={{fontSize:20,fontWeight:800,color:B,marginBottom:8}}>تم إرسال طلبك</div>
          <div style={{fontSize:13,color:T,lineHeight:1.8}}>سيتم مراجعة طلبك والرد عليك قريباً عبر واتساب</div>
          <div style={{marginTop:20,fontSize:12,color:T,opacity:.6}}>مجموعة ريتام للشاليهات 🏖️</div>
        </div>
      )}
    </div>
  );
}

function PoolGuestForm({booking, onDone}) {
  const [choice, setChoice] = useState<"ready"|"on_arrival"|"">("");
  const [readyTime, setReadyTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(()=>{
    if(booking?.pool_preference){setSent(true);}
  },[booking]);

  const options = [
    {val:"ready"      as const, icon:"⏰", title:"جاهز عند الوصول", sub:"أريد المسبح جاهزاً قبل وصولي"},
    {val:"on_arrival" as const, icon:"🕐", title:"تعبئة عند الوصول",  sub:"لا مشكلة أن تبدأ التعبئة عند وصولي"},
  ];

  async function submit(){
    if(!choice||!booking) return;
    setLoading(true);
    const pref = choice==="ready"&&readyTime ? `ready:${readyTime}` : choice;
    await db("bookings","PATCH",{pool_preference:pref,pool_approved:false},booking.id);
    setLoading(false);
    onDone();
  }

  if(sent) return (
    <div style={{textAlign:"center",padding:16}}>
      <div style={{fontSize:40,marginBottom:8}}>📋</div>
      <div style={{fontWeight:700,color:"#3B2A1C",marginBottom:4}}>طلبك السابق: {booking.pool_preference==="on_arrival"?"تعبئة عند الوصول":"جاهز عند الوصول"}</div>
      <div style={{fontSize:12,color:"#6B5F52"}}>يمكنك تغيير اختيارك</div>
      <button onClick={()=>setSent(false)} style={{marginTop:12,background:"#3B2A1C",color:"#C9A36A",border:"none",borderRadius:10,padding:"10px 22px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}>تغيير الاختيار</button>
    </div>
  );

  return (
    <div>
      <div style={{display:"grid",gap:10,marginBottom:16}}>
        {options.map(o=>(
          <div key={o.val} onClick={()=>setChoice(o.val)} style={{
            borderRadius:12,padding:"14px 16px",cursor:"pointer",
            border: choice===o.val ? "2px solid #3B2A1C" : "1.5px solid rgba(201,163,106,.4)",
            background: choice===o.val ? "#FAF6F0" : "#fff",
            transition:"all .15s",
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:28}}>{o.icon}</span>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:"#3B2A1C"}}>{o.title}</div>
                <div style={{fontSize:12,color:"#6B5F52",marginTop:2}}>{o.sub}</div>
              </div>
              {choice===o.val&&<span style={{marginRight:"auto",fontSize:18}}>✅</span>}
            </div>
            {choice==="ready"&&o.val==="ready"&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(201,163,106,.3)"}}>
                <label style={{fontSize:12,color:"#6B5F52",fontWeight:600,display:"block",marginBottom:6}}>وقت الوصول المتوقع (اختياري)</label>
                <input type="time" value={readyTime} onChange={e=>setReadyTime(e.target.value)}
                  style={{width:"100%",padding:"8px 12px",border:"1.5px solid rgba(201,163,106,.4)",borderRadius:8,fontSize:14,fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:"#3B2A1C",background:"#F5F0E8",outline:"none"}}/>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={submit} disabled={!choice||loading} style={{
        width:"100%",border:"none",cursor:choice?"pointer":"not-allowed",borderRadius:12,
        fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:16,padding:14,
        background:choice?"linear-gradient(135deg,#3B2A1C,#241A11)":"#D1D5DB",color:choice?"#C9A36A":"#fff",
        opacity:loading?.7:1,
      }}>{loading?"جاري الإرسال...":"إرسال الطلب 📨"}</button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   صفحة معلومات الشاليه للضيف — موقع، طريقة دخول، شروط
══════════════════════════════════════════════════════ */
function GuestInfoPage({bookingId}:{bookingId: string | null}) {
  const [step,setStep] = useState("loading");
  const [booking,setBooking] = useState<any>(null);
  const [chalet,setChalet] = useState<any>(null);

  useEffect(()=>{
    if(!bookingId){setStep("error");return;}
    (async()=>{
      const bdata=await db("bookings","GET",null,`id=eq.${bookingId}`);
      if(!bdata||!bdata[0]){setStep("error");return;}
      const b=bdata[0] as any;
      setBooking(b);
      const cdata=await db("chalets","GET",null,`name=eq.${encodeURIComponent(b.chalet)}`);
      setChalet((cdata&&cdata[0])||null);
      setStep("ready");
    })();
  },[]);

  const GS = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Kufi+Arabic:wght@600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'IBM Plex Sans Arabic',sans-serif;background:#F5F0E8;min-height:100vh}`;
  const wrap = {fontFamily:"'IBM Plex Sans Arabic',sans-serif",minHeight:"100vh",background:"#F5F0E8",display:"flex",alignItems:"center",justifyContent:"center",padding:16};
  const card = {background:"#fff",borderRadius:20,padding:24,maxWidth:480,width:"100%",boxShadow:"0 4px 24px rgba(59,42,28,.1)"};

  if(step==="loading") return <div dir="rtl" style={wrap}><style>{GS}</style><div style={{textAlign:"center",color:"#6B5F52"}}><div style={{fontSize:40}}>⌛</div><div style={{marginTop:12,fontWeight:600}}>جاري التحميل...</div></div></div>;
  if(step==="error") return <div dir="rtl" style={wrap}><style>{GS}</style><div style={{...card,textAlign:"center"}}><div style={{fontSize:48}}>❌</div><div style={{fontSize:18,fontWeight:800,color:"#3B2A1C",marginTop:12}}>رابط غير صحيح</div></div></div>;

  const section = (icon: string, title: string, content: string | null | undefined) => !content ? null : (
    <div style={{background:"#FAF6F0",borderRadius:12,padding:16,marginBottom:14}}>
      <div style={{fontWeight:800,color:"#3B2A1C",marginBottom:6,fontSize:14}}>{icon+" "+title}</div>
      <div style={{fontSize:13,color:"#6B5F52",whiteSpace:"pre-wrap",lineHeight:1.7}}>{content}</div>
    </div>
  );

  return (
    <div dir="rtl" style={wrap}>
      <style>{GS}</style>
      <div style={card}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:40,marginBottom:8}}>🏡</div>
          <div style={{fontSize:20,fontWeight:800,color:"#3B2A1C"}}>{"أهلاً "+booking.guest+"!"}</div>
          <div style={{fontSize:13,color:"#6B5F52",marginTop:4}}>{booking.chalet}</div>
          <div style={{fontSize:12,color:"#6B5F52",marginTop:6}}>
            {"⏰ دخول "+(booking.checkin_time||"-")+" · خروج "+(booking.checkout_time||"-")}
          </div>
        </div>
        {chalet?.map_url&&(
          <a href={chalet.map_url} target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",background:"linear-gradient(135deg,#3B2A1C,#241A11)",color:"#C9A36A",borderRadius:12,padding:14,fontWeight:800,fontSize:14,textDecoration:"none",marginBottom:14}}>
            📍 افتح الموقع في خرائط جوجل
          </a>
        )}
        {section("🔑","طريقة الدخول",chalet?.entry_method)}
        {section("📄","الشروط والأحكام",chalet?.terms)}
        {!chalet?.map_url&&!chalet?.entry_method&&!chalet?.terms&&(
          <div style={{textAlign:"center",color:"#6B5F52",fontSize:13,padding:"20px 0"}}>لا توجد تفاصيل إضافية بعد — تواصل معنا لأي استفسار</div>
        )}
        <div style={{marginTop:8,textAlign:"center",fontSize:13,color:"#6B5F52"}}>نتطلع لاستقبالكم 🌟 مجموعة ريتام للشاليهات</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   صفحة طلب الغرفة — تُفتح بمسح الباركود
══════════════════════════════════════════════════════ */
const ROOM_REQUEST_TYPES = [
  { val:"مفارش", icon:"🛏", label:"تغيير المفارش",    color:"#4338CA" },
  { val:"صابون",  icon:"🧴", label:"صابون / شامبو",    color:"#0284C7" },
  { val:"منديل",  icon:"🧻", label:"مناديل / ورق حمام",color:"#059669" },
  { val:"حشرات",  icon:"🐛", label:"بلاغ حشرات",       color:"#DC2626" },
  { val:"أخرى",   icon:"📋", label:"طلب آخر",          color:"#7C3AED" },
];

const SUPA_URL_ROOM = "https://kduoasfaqtrotesohqpf.supabase.co";
const SUPA_KEY_ROOM = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkdW9hc2ZhcXRyb3Rlc29ocXBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzIwODcsImV4cCI6MjA5NTU0ODA4N30.RTybT1rFOCbWMZ9qkjmk5j0z24RMFWlJSMATMdw8aNw";

function RoomRequestPage({ chalet, room }: { chalet: string; room: string }) {
  const [type,    setType]    = useState("");
  const [note,    setNote]    = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [err,     setErr]     = useState("");

  const GS = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Kufi+Arabic:wght@600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'IBM Plex Sans Arabic',sans-serif;background:#F5F0E8;min-height:100vh}`;
  const wrap = { fontFamily:"'IBM Plex Sans Arabic',sans-serif", minHeight:"100vh", background:"#F5F0E8", display:"flex", alignItems:"center", justifyContent:"center", padding:16 } as const;
  const card = { background:"#fff", borderRadius:20, padding:24, maxWidth:420, width:"100%", boxShadow:"0 4px 24px rgba(59,42,28,.1)" } as const;

  async function submit() {
    if (!type) return;
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${SUPA_URL_ROOM}/rest/v1/room_requests`, {
        method: "POST",
        headers: {
          "apikey": SUPA_KEY_ROOM,
          "Authorization": `Bearer ${SUPA_KEY_ROOM}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ chalet, room, type, note: note || null, resolved: false }),
      });
      if (!res.ok) { const t = await res.text(); setErr(t); setLoading(false); return; }
      setDone(true);
    } catch(e) {
      setErr("تعذّر الاتصال، تحقق من الإنترنت");
    }
    setLoading(false);
  }

  if (done) return (
    <div dir="rtl" style={wrap}><style>{GS}</style>
      <div style={{ ...card, textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:12 }}>✅</div>
        <div style={{ fontSize:22, fontWeight:800, color:"#3B2A1C", marginBottom:8 }}>تم إرسال طلبك</div>
        <div style={{ fontSize:14, color:"#6B5F52", marginBottom:20 }}>سنتواصل معك في أقرب وقت</div>
        <button onClick={()=>{ setDone(false); setType(""); setNote(""); }}
          style={{ background:"#3B2A1C", color:"#C9A36A", border:"none", borderRadius:12, padding:"12px 28px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'IBM Plex Sans Arabic',sans-serif" }}>
          إرسال طلب آخر
        </button>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={wrap}><style>{GS}</style>
      <div style={card}>
        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🛎️</div>
          <div style={{ fontSize:20, fontWeight:800, color:"#3B2A1C" }}>خدمة الغرف</div>
          <div style={{ fontSize:13, color:"#6B5F52", marginTop:6,
            background:"#FAF6F0", borderRadius:8, padding:"6px 12px", display:"inline-block" }}>
            {chalet} · {room}
          </div>
        </div>

        {/* Types */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          {ROOM_REQUEST_TYPES.map(t => (
            <div key={t.val} onClick={()=>setType(t.val)} style={{
              borderRadius:12, padding:"14px 12px", cursor:"pointer", textAlign:"center",
              border: type===t.val ? `2px solid ${t.color}` : "1.5px solid rgba(201,163,106,.35)",
              background: type===t.val ? t.color+"11" : "#fff",
              transition:"all .15s",
            }}>
              <div style={{ fontSize:28, marginBottom:6 }}>{t.icon}</div>
              <div style={{ fontSize:12, fontWeight:700, color: type===t.val ? t.color : "#3B2A1C" }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Note */}
        <textarea
          placeholder="تفاصيل إضافية (اختياري)..."
          value={note} onChange={e=>setNote(e.target.value)} rows={3}
          style={{ width:"100%", padding:"12px 14px", border:"1.5px solid rgba(201,163,106,.35)",
            borderRadius:12, fontSize:14, fontFamily:"'IBM Plex Sans Arabic',sans-serif", color:"#3B2A1C",
            background:"#F5F0E8", outline:"none", resize:"none", marginBottom:16 }}
        />

        {err&&<div style={{marginBottom:10,padding:"10px 14px",background:"#FEE2E2",borderRadius:10,fontSize:12,color:"#DC2626",fontWeight:600}}>⚠️ {err}</div>}
        <button onClick={submit} disabled={!type||loading} style={{
          width:"100%", border:"none", borderRadius:12, fontFamily:"'IBM Plex Sans Arabic',sans-serif",
          fontWeight:700, fontSize:16, padding:14,
          background: type ? "linear-gradient(135deg,#3B2A1C,#241A11)" : "#E5E7EB",
          color: type ? "#C9A36A" : "#9CA3AF",
          cursor: type ? "pointer" : "not-allowed", opacity: loading ? .7 : 1,
        }}>{loading ? "جاري الإرسال..." : "إرسال الطلب 🔔"}</button>
      </div>
    </div>
  );
}

function LoginPage({onLogin,onShowSignup,onShowForgot}: {onLogin:(u:AppUser)=>void; onShowSignup:()=>void; onShowForgot:()=>void}) {
  const [login,setLogin] = useState("");
  const [pass,setPass] = useState("");
  const [err,setErr] = useState("");
  const [loading,setLoading] = useState(false);

  async function doLogin() {
    if(!login||!pass){setErr("أدخل بيانات الدخول");return;}
    setLoading(true); setErr("");
    const {data,error} = await supabase.auth.signInWithPassword({email:login,password:pass});
    if(error||!data.user){setErr("بيانات الدخول غير صحيحة");setLoading(false);return;}
    const profiles = await db("profiles","GET",null,"id=eq."+data.user.id+"&select=*");
    const profile = profiles&&profiles[0];
    if(!profile){setErr("لا يوجد ملف تعريف لهذا الحساب");setLoading(false);return;}
    currentOwnerId = profile.owner_id as string;
    setCurrentOwnerId(profile.owner_id as string);
    onLogin(profile as unknown as AppUser);
    setLoading(false);
  }

  return (
    <div dir="rtl" style={{fontFamily:"'IBM Plex Sans Arabic',sans-serif",minHeight:"100vh",background:"#F5F0E8",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <style>{CSS}</style>
      <div style={{background:"#fff",borderRadius:20,padding:32,maxWidth:400,width:"100%",boxShadow:"0 8px 40px rgba(59,42,28,.12)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <Logo size={50}/>
          <div style={{fontWeight:800,color:B,fontSize:20,marginTop:12}}>مجموعة ريتام</div>
          <div style={{color:T,fontSize:13,marginTop:4}}>نظام إدارة الشاليهات</div>
        </div>
        {err&&<div style={{background:"#FFF5F5",border:"1px solid rgba(166,58,42,.2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#A63A2A",fontWeight:600}}>{err}</div>}
        <div style={{marginBottom:14}}>
          <label className="lbl">البريد الإلكتروني</label>
          <input className="inp" type="email" value={login} onChange={e=>setLogin(e.target.value)} placeholder="name@example.com" onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        <div style={{marginBottom:10}}>
          <label className="lbl">كلمة المرور</label>
          <input className="inp" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        <div style={{textAlign:"left",marginBottom:20}}>
          <span onClick={onShowForgot} style={{color:T,fontSize:12.5,cursor:"pointer",textDecoration:"underline"}}>نسيت كلمة المرور؟</span>
        </div>
        <button onClick={doLogin} disabled={loading}
          style={{width:"100%",border:"none",cursor:loading?"not-allowed":"pointer",borderRadius:12,fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:16,padding:14,background:"linear-gradient(135deg,#3B2A1C,#241A11)",color:"#C9A36A"}}>
          {loading?"جاري التحقق...":"تسجيل الدخول"}
        </button>
        <div style={{textAlign:"center",marginTop:18,fontSize:13,color:T}}>
          صاحب شاليه جديد؟ <span onClick={onShowSignup} style={{color:B,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>سجّل حسابك</span>
        </div>
      </div>
    </div>
  );
}

function ForgotPasswordPage({onBack}: {onBack:()=>void}) {
  const [email,setEmail] = useState("");
  const [err,setErr] = useState("");
  const [sent,setSent] = useState(false);
  const [loading,setLoading] = useState(false);

  async function doSend() {
    if(!email){setErr("أدخل بريدك الإلكتروني");return;}
    setLoading(true); setErr("");
    const {error} = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if(error){setErr(error.message||"تعذر إرسال الرابط");setLoading(false);return;}
    setSent(true); setLoading(false);
  }

  return (
    <div dir="rtl" style={{fontFamily:"'IBM Plex Sans Arabic',sans-serif",minHeight:"100vh",background:"#F5F0E8",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <style>{CSS}</style>
      <div style={{background:"#fff",borderRadius:20,padding:32,maxWidth:400,width:"100%",boxShadow:"0 8px 40px rgba(59,42,28,.12)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <Logo size={50}/>
          <div style={{fontWeight:800,color:B,fontSize:20,marginTop:12}}>نسيت كلمة المرور؟</div>
          <div style={{color:T,fontSize:13,marginTop:4}}>بنرسل لك رابط لإعادة تعيينها على بريدك الإلكتروني</div>
        </div>
        {err&&<div style={{background:"#FFF5F5",border:"1px solid rgba(166,58,42,.2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#A63A2A",fontWeight:600}}>{err}</div>}
        {sent ? (
          <div style={{background:"#E6F1EA",border:"1px solid rgba(107,114,88,.25)",borderRadius:10,padding:14,marginBottom:16,fontSize:13,color:"#1E6B45",fontWeight:600,textAlign:"center",lineHeight:1.8}}>
            ✅ تم إرسال رابط إعادة التعيين إلى<br/>{email}<br/>افتح بريدك واضغط على الرابط لتعيين كلمة مرور جديدة
          </div>
        ) : (
          <>
            <div style={{marginBottom:20}}>
              <label className="lbl">البريد الإلكتروني</label>
              <input className="inp" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" onKeyDown={e=>e.key==="Enter"&&doSend()}/>
            </div>
            <button onClick={doSend} disabled={loading}
              style={{width:"100%",border:"none",cursor:loading?"not-allowed":"pointer",borderRadius:12,fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:16,padding:14,background:"linear-gradient(135deg,#3B2A1C,#241A11)",color:"#C9A36A"}}>
              {loading?"جاري الإرسال...":"إرسال رابط إعادة التعيين"}
            </button>
          </>
        )}
        <div style={{textAlign:"center",marginTop:18,fontSize:13,color:T}}>
          <span onClick={onBack} style={{color:B,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>→ رجوع لتسجيل الدخول</span>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordPage({onDone}: {onDone:()=>void}) {
  const [pass,setPass] = useState("");
  const [pass2,setPass2] = useState("");
  const [err,setErr] = useState("");
  const [loading,setLoading] = useState(false);
  const [done,setDone] = useState(false);

  async function doReset() {
    if(pass.length<6){setErr("كلمة المرور 6 أحرف على الأقل");return;}
    if(pass!==pass2){setErr("كلمتا المرور غير متطابقتين");return;}
    setLoading(true); setErr("");
    const {error} = await supabase.auth.updateUser({password:pass});
    if(error){setErr(error.message||"تعذر تحديث كلمة المرور");setLoading(false);return;}
    setDone(true); setLoading(false);
  }

  return (
    <div dir="rtl" style={{fontFamily:"'IBM Plex Sans Arabic',sans-serif",minHeight:"100vh",background:"#F5F0E8",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <style>{CSS}</style>
      <div style={{background:"#fff",borderRadius:20,padding:32,maxWidth:400,width:"100%",boxShadow:"0 8px 40px rgba(59,42,28,.12)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <Logo size={50}/>
          <div style={{fontWeight:800,color:B,fontSize:20,marginTop:12}}>تعيين كلمة مرور جديدة</div>
        </div>
        {err&&<div style={{background:"#FFF5F5",border:"1px solid rgba(166,58,42,.2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#A63A2A",fontWeight:600}}>{err}</div>}
        {done ? (
          <>
            <div style={{background:"#E6F1EA",border:"1px solid rgba(107,114,88,.25)",borderRadius:10,padding:14,marginBottom:16,fontSize:13,color:"#1E6B45",fontWeight:600,textAlign:"center"}}>
              ✅ تم تحديث كلمة المرور بنجاح
            </div>
            <button onClick={onDone}
              style={{width:"100%",border:"none",cursor:"pointer",borderRadius:12,fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:16,padding:14,background:"linear-gradient(135deg,#3B2A1C,#241A11)",color:"#C9A36A"}}>
              متابعة لتسجيل الدخول
            </button>
          </>
        ) : (
          <>
            <div style={{marginBottom:14}}>
              <label className="lbl">كلمة المرور الجديدة</label>
              <input className="inp" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doReset()}/>
            </div>
            <div style={{marginBottom:20}}>
              <label className="lbl">تأكيد كلمة المرور</label>
              <input className="inp" type="password" value={pass2} onChange={e=>setPass2(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doReset()}/>
            </div>
            <button onClick={doReset} disabled={loading}
              style={{width:"100%",border:"none",cursor:loading?"not-allowed":"pointer",borderRadius:12,fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:16,padding:14,background:"linear-gradient(135deg,#3B2A1C,#241A11)",color:"#C9A36A"}}>
              {loading?"جاري التحديث...":"تحديث كلمة المرور"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SignupPage({onSignedUp,onBack}: {onSignedUp:(u:AppUser)=>void; onBack:()=>void}) {
  const [name,setName]     = useState("");
  const [business,setBusiness] = useState("");
  const [email,setEmail]   = useState("");
  const [pass,setPass]     = useState("");
  const [err,setErr]       = useState("");
  const [loading,setLoading] = useState(false);

  async function doSignup() {
    if(!name||!email||!pass){setErr("أكمل كل الحقول");return;}
    if(pass.length<6){setErr("كلمة المرور 6 أحرف على الأقل");return;}
    setLoading(true); setErr("");
    const {data,error} = await supabase.auth.signUp({email,password:pass});
    if(error||!data.user){setErr(error?.message||"تعذر إنشاء الحساب");setLoading(false);return;}
    const uid = data.user.id;
    const profileRes = await db("profiles","POST",{id:uid,owner_id:uid,role:"owner",name,email,chalet:business||null});
    if(!profileRes){setErr("تعذر إنشاء الملف الشخصي، حاول مرة أخرى");setLoading(false);return;}
    await db("subscriptions","POST",{owner_id:uid,plan_name:"تجريبي",status:"trial"});
    currentOwnerId = uid;
    setCurrentOwnerId(uid);
    onSignedUp(profileRes[0] as unknown as AppUser);
    setLoading(false);
  }

  return (
    <div dir="rtl" style={{fontFamily:"'IBM Plex Sans Arabic',sans-serif",minHeight:"100vh",background:"#F5F0E8",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <style>{CSS}</style>
      <div style={{background:"#fff",borderRadius:20,padding:32,maxWidth:420,width:"100%",boxShadow:"0 8px 40px rgba(59,42,28,.12)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <Logo size={50}/>
          <div style={{fontWeight:800,color:B,fontSize:20,marginTop:12}}>تسجيل حساب جديد</div>
          <div style={{color:T,fontSize:13,marginTop:4}}>لأصحاب الشاليهات — أضف شاليهاتك وأدرها بنفسك</div>
        </div>
        {err&&<div style={{background:"#FFF5F5",border:"1px solid rgba(166,58,42,.2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#A63A2A",fontWeight:600}}>{err}</div>}
        <div style={{marginBottom:14}}>
          <label className="lbl">اسمك</label>
          <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="محمد"/>
        </div>
        <div style={{marginBottom:14}}>
          <label className="lbl">اسم النشاط/الشاليه (اختياري)</label>
          <input className="inp" value={business} onChange={e=>setBusiness(e.target.value)} placeholder="شاليهات الواحة"/>
        </div>
        <div style={{marginBottom:14}}>
          <label className="lbl">البريد الإلكتروني</label>
          <input className="inp" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/>
        </div>
        <div style={{marginBottom:20}}>
          <label className="lbl">كلمة المرور</label>
          <input className="inp" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doSignup()}/>
        </div>
        <button onClick={doSignup} disabled={loading}
          style={{width:"100%",border:"none",cursor:loading?"not-allowed":"pointer",borderRadius:12,fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,fontSize:16,padding:14,background:"linear-gradient(135deg,#3B2A1C,#241A11)",color:"#C9A36A"}}>
          {loading?"جاري إنشاء الحساب...":"إنشاء الحساب"}
        </button>
        <div style={{textAlign:"center",marginTop:18,fontSize:13,color:T}}>
          عندك حساب؟ <span onClick={onBack} style={{color:B,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>تسجيل الدخول</span>
        </div>
      </div>
    </div>
  );
}

// ── بطاقة الولاء للضيف ──────────────────────────────────────────────────────
const SUPA_URL_G = "https://kduoasfaqtrotesohqpf.supabase.co";
const SUPA_KEY_G = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkdW9hc2ZhcXRyb3Rlc29ocXBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1NzExOTcsImV4cCI6MjA2MzE0NzE5N30.LKqDMEZLnrNHfAJnCvwzb0_ZVhkVqkJi7MaGvGWRnkU";

async function guestDb(table: string, method = "GET", body?: object, filter?: string) {
  const url = `${SUPA_URL_G}/rest/v1/${table}${filter ? "?" + filter : ""}`;
  const headers: Record<string,string> = { "apikey": SUPA_KEY_G, "Authorization": `Bearer ${SUPA_KEY_G}`, "Content-Type": "application/json" };
  if (method !== "GET") headers["Prefer"] = method === "POST" ? "return=representation" : "return=minimal";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) return null;
  if (method === "PATCH" || method === "DELETE") return null;
  return res.json().catch(() => null);
}

function LoyaltyPage({ phone }: { phone: string }) {
  const [card, setCard] = useState<LoyaltyCard | null>(null);
  const [loading, setLoading] = useState(true);
  const GS = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Kufi+Arabic:wght@600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'IBM Plex Sans Arabic',sans-serif;background:#1a1a2e;min-height:100vh}`;
  const wrap = { fontFamily:"'IBM Plex Sans Arabic',sans-serif", minHeight:"100vh", background:"linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 };

  useEffect(() => {
    if (!phone) { setLoading(false); return; }
    guestDb("loyalty_cards", "GET", undefined, `phone=eq.${phone}`).then(data => {
      setCard(data?.[0] || null);
      setLoading(false);
    });
  }, [phone]);

  if (loading) return (
    <div dir="rtl" style={wrap}><style>{GS}</style>
      <div style={{ color:"#C8B89A", fontSize:40, textAlign:"center" }}>⌛</div>
    </div>
  );

  const tickets = card?.tickets || 0;
  const freeNights = card?.free_nights || 0;
  const totalReviews = card?.total_reviews || 0;

  return (
    <div dir="rtl" style={wrap}>
      <style>{GS}</style>
      <div style={{ maxWidth:380, width:"100%" }}>
        {/* الهيدر */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:14, color:"#C8B89A", letterSpacing:3, marginBottom:8 }}>مجموعة ريتام</div>
          <div style={{ fontSize:28, fontWeight:800, color:"#fff" }}>بطاقة الولاء</div>
          <div style={{ fontSize:13, color:"rgba(200,184,154,.6)", marginTop:4 }}>اجمع 3 تذاكر واحصل على ليلة مجانية</div>
        </div>

        {/* البطاقة الرئيسية */}
        <div style={{
          background:"linear-gradient(135deg,#2C1810,#3D2B1A)",
          borderRadius:24, padding:28, marginBottom:16,
          border:"1px solid rgba(201,163,106,.3)",
          boxShadow:"0 20px 60px rgba(0,0,0,.5)",
          position:"relative", overflow:"hidden",
        }}>
          {/* زخرفة */}
          <div style={{ position:"absolute", top:-30, left:-30, width:120, height:120, background:"rgba(201,163,106,.07)", borderRadius:"50%" }}/>
          <div style={{ position:"absolute", bottom:-20, right:-20, width:80, height:80, background:"rgba(201,163,106,.05)", borderRadius:"50%" }}/>

          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
              <div>
                <div style={{ fontSize:11, color:"rgba(201,163,106,.6)", letterSpacing:1 }}>العميل</div>
                <div style={{ fontSize:18, fontWeight:800, color:"#C8B89A", marginTop:2 }}>{card?.name || "ضيف ريتام"}</div>
              </div>
              <div style={{ fontSize:28 }}>🏆</div>
            </div>

            {/* طوابع التذاكر */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, color:"rgba(201,163,106,.6)", marginBottom:12 }}>تذاكرك ({tickets}/3)</div>
              <div style={{ display:"flex", gap:12 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    flex:1, aspectRatio:"1", borderRadius:16,
                    background: i < tickets ? "linear-gradient(135deg,#B8960C,#C8B89A)" : "rgba(201,163,106,.1)",
                    border: i < tickets ? "2px solid #C8B89A" : "2px dashed rgba(201,163,106,.3)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:28, transition:"all .3s",
                    boxShadow: i < tickets ? "0 4px 16px rgba(200,184,154,.3)" : "none",
                  }}>
                    {i < tickets ? "🎫" : ""}
                  </div>
                ))}
              </div>
            </div>

            {/* شريط التقدم */}
            <div style={{ background:"rgba(201,163,106,.1)", borderRadius:99, height:6, marginBottom:8 }}>
              <div style={{ width:`${(tickets/3)*100}%`, height:"100%", background:"linear-gradient(90deg,#B8960C,#C8B89A)", borderRadius:99, transition:"width .5s" }}/>
            </div>
            <div style={{ fontSize:11, color:"rgba(201,163,106,.5)", textAlign:"center" }}>
              {tickets === 3 ? "🎉 مبروك! لديك ليلة مجانية" : `${3 - tickets} تذكرة متبقية للليلة المجانية`}
            </div>
          </div>
        </div>

        {/* الإحصائيات */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div style={{ background:"rgba(255,255,255,.05)", borderRadius:16, padding:16, border:"1px solid rgba(201,163,106,.15)" }}>
            <div style={{ fontSize:24, fontWeight:800, color:"#C8B89A" }}>{totalReviews}</div>
            <div style={{ fontSize:12, color:"rgba(200,184,154,.6)", marginTop:2 }}>إجمالي التقييمات</div>
          </div>
          <div style={{ background:"rgba(255,255,255,.05)", borderRadius:16, padding:16, border:"1px solid rgba(201,163,106,.15)" }}>
            <div style={{ fontSize:24, fontWeight:800, color: freeNights > 0 ? "#4ADE80" : "#C8B89A" }}>{freeNights}</div>
            <div style={{ fontSize:12, color:"rgba(200,184,154,.6)", marginTop:2 }}>ليالٍ مجانية</div>
          </div>
        </div>

        {freeNights > 0 && (
          <div style={{ background:"linear-gradient(135deg,rgba(74,222,128,.15),rgba(34,197,94,.1))", border:"1px solid rgba(74,222,128,.3)", borderRadius:16, padding:16, textAlign:"center" }}>
            <div style={{ fontSize:24, marginBottom:4 }}>🎁</div>
            <div style={{ fontWeight:800, color:"#4ADE80", fontSize:15 }}>لديك {freeNights} ليلة مجانية!</div>
            <div style={{ fontSize:12, color:"rgba(74,222,128,.7)", marginTop:4 }}>تواصل معنا عبر واتساب لحجزها</div>
          </div>
        )}

        <div style={{ textAlign:"center", marginTop:20, fontSize:11, color:"rgba(200,184,154,.3)" }}>مجموعة ريتام للشاليهات © 2025</div>
      </div>
    </div>
  );
}

const SUPA_URL_CL = "https://kduoasfaqtrotesohqpf.supabase.co";
const SUPA_KEY_CL = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkdW9hc2ZhcXRyb3Rlc29ocXBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1NzExOTcsImV4cCI6MjA2MzE0NzE5N30.LKqDMEZLnrNHfAJnCvwzb0_ZVhkVqkJi7MaGvGWRnkU";

const CLEAN_TASK_STRINGS: Record<string, Record<string, string>> = {
  hi: {
    title: "सफाई कार्य",
    subtitle: "नीचे दिए गए कार्य को पूरा करें",
    done_btn: "✅ काम पूरा हो गया",
    note_ph: "कोई टिप्पणी (वैकल्पिक)...",
    done_msg: "शुक्रिया! काम दर्ज कर लिया गया।",
    chalet_label: "शाले:",
    task_label: "कार्य:",
    media_label: "📸 फोटो / वीडियो जोड़ें (अनिवार्य)",
    media_btn: "📷 फाइल चुनें",
    media_err: "⚠️ कृपया पहले फोटो या वीडियो अपलोड करें",
    uploading: "अपलोड हो रहा है...",
  },
  ar: {
    title: "مهمة نظافة",
    subtitle: "أكمل المهمة المطلوبة",
    done_btn: "✅ تم الانتهاء",
    note_ph: "ملاحظة (اختياري)...",
    done_msg: "شكراً! تم تسجيل المهمة.",
    chalet_label: "الشاليه:",
    task_label: "المهمة:",
    media_label: "📸 أرفق صورة أو فيديو (إلزامي)",
    media_btn: "📷 اختر ملف",
    media_err: "⚠️ الرجاء إرفاق صورة أو فيديو أولاً",
    uploading: "جاري الرفع...",
  },
  en: {
    title: "Cleaning Task",
    subtitle: "Complete the task below",
    done_btn: "✅ Task Done",
    note_ph: "Note (optional)...",
    done_msg: "Thank you! Task recorded.",
    chalet_label: "Chalet:",
    task_label: "Task:",
    media_label: "📸 Attach Photo / Video (required)",
    media_btn: "📷 Choose File",
    media_err: "⚠️ Please attach a photo or video first",
    uploading: "Uploading...",
  },
};

function CleanTaskWorkerPage({ logId, taskName, chalet, lang }: { logId: string | null; taskName: string | null; chalet: string | null; lang: string }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const s = CLEAN_TASK_STRINGS[lang] || CLEAN_TASK_STRINGS.hi;
  const wrap = { fontFamily:"'IBM Plex Sans Arabic',sans-serif", minHeight:"100vh", background:"#F0F7F0", display:"flex", alignItems:"center", justifyContent:"center", padding:16 } as const;
  const card = { background:"#fff", borderRadius:20, padding:28, maxWidth:400, width:"100%", boxShadow:"0 4px 24px rgba(0,0,0,.1)" } as const;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setErr("");
    const url = URL.createObjectURL(file);
    setMediaPreview(url);
  }

  async function markDone() {
    if (!logId) return;
    if (!mediaFile) { setErr(s.media_err); return; }
    setLoading(true); setErr("");
    try {
      setUploading(true);
      const ext = mediaFile.name.split(".").pop() || (mediaFile.type.startsWith("video") ? "mp4" : "jpg");
      const fileName = `log-${logId}-${Date.now()}.${ext}`;
      const upRes = await fetch(`${SUPA_URL_CL}/storage/v1/object/cleaning-media/${fileName}`, {
        method: "POST",
        headers: {
          "apikey": SUPA_KEY_CL,
          "Authorization": `Bearer ${SUPA_KEY_CL}`,
          "Content-Type": mediaFile.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: mediaFile,
      });
      setUploading(false);
      if (!upRes.ok) { setErr("خطأ في رفع الملف"); setLoading(false); return; }
      const mediaUrl = `${SUPA_URL_CL}/storage/v1/object/public/cleaning-media/${fileName}`;

      const res = await fetch(`${SUPA_URL_CL}/rest/v1/cleaning_logs?id=eq.${logId}`, {
        method: "PATCH",
        headers: { "apikey": SUPA_KEY_CL, "Authorization": `Bearer ${SUPA_KEY_CL}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify({ status: "done", done_at: new Date().toISOString(), done_note: note || null, worker_done: true, done_media_url: mediaUrl }),
      });
      if (!res.ok) { setErr("خطأ في الاتصال"); setLoading(false); return; }
      setDone(true);
    } catch { setErr("تعذّر الاتصال"); }
    setLoading(false);
  }

  if (done) return (
    <div style={wrap}>
      <div style={{ ...card, textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
        <div style={{ fontSize:20, fontWeight:800, color:"#166534" }}>{s.done_msg}</div>
      </div>
    </div>
  );

  const isVideo = mediaFile?.type.startsWith("video");

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🧹</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#166534" }}>{s.title}</div>
          <div style={{ fontSize:13, color:"#6B7280", marginTop:4 }}>{s.subtitle}</div>
        </div>
        <div style={{ background:"#F0FDF4", borderRadius:12, padding:16, marginBottom:20, border:"1px solid #BBF7D0" }}>
          {chalet && <div style={{ fontSize:13, color:"#374151", marginBottom:6 }}><b>{s.chalet_label}</b> {chalet}</div>}
          {taskName && <div style={{ fontSize:15, fontWeight:700, color:"#166534" }}><b>{s.task_label}</b> {taskName}</div>}
        </div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={s.note_ph}
          style={{ width:"100%", borderRadius:10, border:"1.5px solid #D1FAE5", padding:"10px 12px", fontSize:14, resize:"none", height:80, marginBottom:16, fontFamily:"inherit" }}/>

        {/* رفع صورة/فيديو */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#166534", marginBottom:8 }}>{s.media_label}</div>
          <label style={{
            display:"block", border:"2px dashed #BBF7D0", borderRadius:12, padding:"14px", textAlign:"center",
            cursor:"pointer", background: mediaPreview ? "#F0FDF4" : "#fff", transition:"background .2s",
          }}>
            {mediaPreview ? (
              isVideo
                ? <video src={mediaPreview} style={{ maxWidth:"100%", maxHeight:180, borderRadius:8 }} controls/>
                : <img src={mediaPreview} alt="preview" style={{ maxWidth:"100%", maxHeight:180, borderRadius:8, objectFit:"cover" }}/>
            ) : (
              <div>
                <div style={{ fontSize:32, marginBottom:6 }}>📷</div>
                <div style={{ fontSize:13, color:"#6B7280" }}>{s.media_btn}</div>
              </div>
            )}
            <input type="file" accept="image/*,video/*" capture="environment" style={{ display:"none" }} onChange={onFileChange}/>
          </label>
        </div>

        {err && <div style={{ color:"#DC2626", fontSize:13, marginBottom:12 }}>{err}</div>}
        <button onClick={markDone} disabled={loading} style={{
          width:"100%", border:"none", borderRadius:12, padding:14,
          background: loading ? "#9CA3AF" : "linear-gradient(135deg,#166534,#15803D)",
          color:"#fff", fontSize:16, fontWeight:800, cursor: loading ? "not-allowed" : "pointer", fontFamily:"inherit",
        }}>{uploading ? s.uploading : loading ? "..." : s.done_btn}</button>
      </div>
    </div>
  );
}

function AppWrapper() {
  const [ready,setReady]       = useState(false);
  const [isGuest,setIsGuest]   = useState(false);
  const [guestParams,setGuestParams] = useState<{bookingId:string|null; mode:string; chalet:string|null; room:string|null}>({bookingId:null,mode:"checkin",chalet:null,room:null});
  const [currentUser,setCurrentUser] = useState<AppUser | null>(null);
  const [showSignup,setShowSignup]   = useState(false);
  const [showForgot,setShowForgot]   = useState(false);
  const [isRecovery,setIsRecovery]   = useState(false);

  useEffect(()=>{
    const p = new URLSearchParams(window.location.search);
    if(p.get("guest")==="1"){
      setGuestParams({bookingId:p.get("b"),mode:p.get("m")||"checkin",chalet:p.get("ch"),room:p.get("rm")});
      setIsGuest(true);
      setReady(true);
      return;
    }
    const {data:authListener} = supabase.auth.onAuthStateChange((event)=>{
      if(event==="PASSWORD_RECOVERY") setIsRecovery(true);
    });
    (async()=>{
      const {data:{session}} = await supabase.auth.getSession();
      if(session?.user){
        const profiles = await db("profiles","GET",null,"id=eq."+session.user.id+"&select=*");
        const profile = profiles&&profiles[0];
        if(profile){
          currentOwnerId = profile.owner_id as string;
          setCurrentOwnerId(profile.owner_id as string);
          setCurrentUser(profile as unknown as AppUser);
        }
      }
      setReady(true);
    })();
    return ()=>{authListener.subscription.unsubscribe();};
  },[]);

  if(!ready) return null;
  if(isRecovery){
    return <ResetPasswordPage onDone={()=>{
      supabase.auth.signOut();
      currentOwnerId=null; setCurrentOwnerId(null);
      setCurrentUser(null); setIsRecovery(false);
    }}/>;
  }
  if(isGuest){
    if(guestParams.mode==="chalet"&&guestParams.chalet)
      return <ChaletPublicPage chaletName={guestParams.chalet}/>;
    if(guestParams.mode==="room"&&guestParams.chalet&&guestParams.room)
      return <RoomRequestPage chalet={guestParams.chalet} room={guestParams.room}/>;
    if(guestParams.mode==="cleantask"){
      const p=new URLSearchParams(window.location.search);
      return <CleanTaskWorkerPage logId={p.get("log")} taskName={p.get("task")} chalet={p.get("ch")} lang={p.get("lang")||"hi"}/>;
    }
    if(guestParams.mode==="loyalty"){
      const p=new URLSearchParams(window.location.search);
      return <LoyaltyPage phone={p.get("phone")||""}/>;
    }
    if(guestParams.mode==="info")
      return <GuestInfoPage bookingId={guestParams.bookingId}/>;
    return <GuestPageEmbed bookingId={guestParams.bookingId} mode={guestParams.mode}/>;
  }
  if(!currentUser){
    if(showSignup) return <SignupPage onSignedUp={u=>setCurrentUser(u)} onBack={()=>setShowSignup(false)}/>;
    if(showForgot) return <ForgotPasswordPage onBack={()=>setShowForgot(false)}/>;
    return <LoginPage onLogin={u=>setCurrentUser(u)} onShowSignup={()=>setShowSignup(true)} onShowForgot={()=>setShowForgot(true)}/>;
  }
  return <App currentUser={currentUser} onLogout={()=>{supabase.auth.signOut();currentOwnerId=null;setCurrentOwnerId(null);setCurrentUser(null);}}/>;
}

function App({ currentUser = { role: "admin", name: "المستخدم" } as AppUser, onLogout = () => {} }: { currentUser: AppUser; onLogout: () => void }) {
  const isAdmin        = currentUser.role === "admin";
  const isStaff        = currentUser.role === "staff";
  const isChaletMgr    = currentUser.role === "chalet_manager";
  const isMobile       = useIsMobile();
  const [dark, toggleDark] = useDarkMode();
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [goalMdl,setGoalMdl]       = useState<Chalet | null>(null);
  const [bkDetail,setBkDetail]     = useState<Booking | null>(null);

  const [tab,setTab]           = useState("dashboard");
  const [chalets,setChalets]   = useState<Chalet[]>([]);
  const [bookings,setBookings] = useState<Booking[]>([]);
  const [maint,setMaint]       = useState<MaintenanceRequest[]>([]);
  const [wallet,setWallet]     = useState<WalletTransaction[]>([]);
  const [cleaning,setCleaning] = useState<CleaningTransaction[]>([]);
  const [clMdl,setClMdl]       = useState<CleaningTransaction | null>(null);
  const [clnMdl,setClnMdl]     = useState(false);
  const [clExp,setClExp]       = useState<CleaningExpense[]>([]);
  const [clExpMdl,setClExpMdl] = useState<Partial<CleaningExpense> | null>(null);
  const [clTasks,setClTasks]   = useState<CleaningTask[]>([]);
  const [clLogs,setClLogs]     = useState<CleaningLog[]>([]);
  const [clTaskMdl,setClTaskMdl] = useState<Partial<CleaningTask> | null>(null);
  const [clSelCh,setClSelCh]   = useState<string | null>(null);
  const [expenses,setExpenses] = useState<Expense[]>([]);
  const [fixedExpenses,setFixedExpenses] = useState<FixedExpense[]>([]);
  const [fxMdl,setFxMdl] = useState<Partial<FixedExpense> | null>(null);
  const [cleanWorkers,setCleanWorkers] = useState<CleaningWorker[]>([]);
  const [cwMdl,setCwMdl] = useState<Partial<CleaningWorker> | null>(null);
  const [loyaltyCards,setLoyaltyCards] = useState<LoyaltyCard[]>([]);
  const [roomReqs,setRoomReqs] = useState<Record<string,unknown>[]>([]);
  const [qrMdl,setQrMdl]       = useState<{chalet:string; rooms:string[]} | null>(null);
  const [users,setUsers]       = useState<AppUser[]>([]);
  const [rooms,setRooms]       = useState<Room[]>([]);
  const [reviews,setReviews]   = useState<Review[]>([]);
  const [guestRatings,setGuestRatings]   = useState<GuestRating[]>([]);
  const [blockedGuests,setBlockedGuests] = useState<BlockedGuest[]>([]);
  const [investors,setInvestors] = useState<Investor[]>([]);
  const [invMdl,setInvMdl]       = useState<Partial<Investor> | null>(null);
  const [invPeriod,setInvPeriod] = useState<"this_month"|"last_month"|"this_year">("this_month");
  const [loading,setLoading]   = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [fch,setFch]           = useState("الكل");
  const [bkStatus,setBkStatus] = useState("الكل");
  const [mStatus,setMStatus]   = useState<string>("open");
  const [walletTab,setWalletTab] = useState<"ins"|"cln"|"obl">("ins");
  const [bkFrom,setBkFrom]     = useState(monthStart());
  const [bkTo,setBkTo]         = useState(monthEnd());
  const [bkLang,setBkLang]     = useState<"ar"|"hi">(()=>{ try{ return (localStorage.getItem("bk_lang") as "ar"|"hi") || "ar"; }catch{ return "ar"; } });
  const [bkCollapsed,setBkCollapsed] = useState<Record<string,boolean>>({});
  const bt = (key: string): string => BK_I18N[bkLang][key] ?? BK_I18N.ar[key] ?? key;
  useEffect(()=>{ try{ localStorage.setItem("bk_lang", bkLang); }catch{} },[bkLang]);
  const [selChalet,setSelChalet] = useState<Chalet | null>(null);

  const [bMdl,setBMdl]       = useState<Partial<Booking> | null>(null);
  const [mMdl,setMMdl]       = useState<Partial<MaintenanceRequest> | null>(null);
  const [mOld,setMOld]       = useState<MaintenanceRequest | null>(null);
  const [cMdl,setCMdl]       = useState<Partial<Chalet> | null>(null);
  const [imgUploading,setImgUploading] = useState(false);
  const [iMdl,setIMdl]       = useState(false);
  const [wMdl,setWMdl]       = useState<Partial<WalletTransaction> | null>(null);
  const [coMdl,setCoMdl]     = useState<Booking | null>(null);
  const [exMdl,setExMdl]     = useState<Partial<Expense> | null>(null);
  const [uMdl,setUMdl]       = useState<(Partial<AppUser> & {password?:string}) | null>(null);
  const [uErr,setUErr]       = useState("");
  const [addRoomMdl,setAddRoomMdl] = useState<Partial<Room> | null>(null);
  const [grMdl,setGrMdl]     = useState<{booking:Booking; rating:number; note:string} | null>(null);
  const [blockMdl,setBlockMdl] = useState<{booking:Booking; reason:string} | null>(null);

  useEffect(()=>{
    if(tab==="smart"&&selChalet){
      rooms.filter(r=>r.chalet===selChalet.name&&TUYA_DEVICES[r.id]).forEach(async r=>{
        const s=await fetchDeviceStatus(r.id);
        if(s) setRooms(p=>p.map(x=>x.id===r.id?{...x,_acOn:s.ac_on,_acTemp:s.ac_temp,_acMode:s.ac_mode,_acSpeed:s.ac_speed}:x));
      });
    }
  },[selChalet]);

  useEffect(()=>{
    if(typeof document!=="undefined"){
      document.body.style.overflow="auto";
      document.documentElement.style.overflow="auto";
    }
    // عرض البيانات المخزنة فوراً إن وُجدت
    try {
      const cached = localStorage.getItem("reetam_cache");
      if(cached) {
        const d = JSON.parse(cached);
        if(d.chalets)   setChalets(d.chalets);
        if(d.bookings)  setBookings(d.bookings);
        if(d.maint)     setMaint(d.maint);
        if(d.wallet)    setWallet(d.wallet);
        if(d.expenses)  setExpenses(d.expenses);
        if(d.rooms)     setRooms(d.rooms);
        if(d.maint)     setMaint(d.maint);
        setLoading(false);
        setRefreshing(true);
      }
    } catch {}
    loadAll();
  },[]);

  // تحديث فوري عند أي تغيير في قاعدة البيانات
  useRealtimeSync(loadAll);

  async function loadAll() {
    try {
      const [c,b,m,w,cl,cle,ctasks,clogs,sd,rm,rv,ex,us,rr] = await Promise.all([
        db("chalets"), db("bookings"), db("maintenance"), db("wallet"), db("cleaning"), db("cleaning_expenses"), db("cleaning_tasks"), db("cleaning_logs"),
        db("smart_devices"), db("rooms"), db("reviews"), db("expenses"), db("profiles"),
        db("room_requests","GET",null,"resolved=eq.false&order=created_at.desc"),
      ]);
      const [fx,cw,lc,gr,bg,inv] = await Promise.all([
        db("fixed_expenses").catch(()=>[]),
        db("cleaning_workers").catch(()=>[]),
        db("loyalty_cards","GET",null,"order=total_reviews.desc").catch(()=>[]),
        db("guest_ratings").catch(()=>[]),
        db("blocked_guests").catch(()=>[]),
        db("investors").catch(()=>[]),
      ]);
      const sdMap = {};
      (sd||[]).forEach(d=>{if(d.room_id)sdMap["room_"+d.room_id]=d;else sdMap[d.chalet]=d;});
      setChalets((c||[]).map(ch=>({...ch,_acOn:sdMap[ch.name]?.ac_on||false,_acTemp:sdMap[ch.name]?.ac_temp||22,_acMode:sdMap[ch.name]?.ac_mode||"cool",_acSpeed:sdMap[ch.name]?.ac_speed||"auto",_sdId:sdMap[ch.name]?.id||null})));
      setRooms((rm||[]).map(r=>({...r,_acOn:sdMap["room_"+r.id]?.ac_on||false,_acTemp:sdMap["room_"+r.id]?.ac_temp||22,_acMode:sdMap["room_"+r.id]?.ac_mode||"cool",_acSpeed:sdMap["room_"+r.id]?.ac_speed||"auto",_sdId:sdMap["room_"+r.id]?.id||null})));
      if(!ctasks) console.error("⚠️ cleaning_tasks فشل التحميل — تحقق من RLS في Supabase");
      if(!clogs)  console.error("⚠️ cleaning_logs فشل التحميل");
      setBookings(b||[]); setMaint(m||[]); setWallet(w||[]); setCleaning(cl||[]); setClExp(cle||[]); setClTasks(ctasks||[]); setClLogs(clogs||[]);
      setReviews(rv||[]); setExpenses(ex||[]); setUsers(us||[]); setRoomReqs(rr||[]); setFixedExpenses(fx||[]); setCleanWorkers(cw||[]); setLoyaltyCards(lc||[]);
      setGuestRatings(gr||[]); setBlockedGuests(bg||[]); setInvestors((inv||[]) as unknown as Investor[]);
      // حفظ البيانات الأساسية في cache للتحميل الفوري القادم
      try {
        localStorage.setItem("reetam_cache", JSON.stringify({
          chalets: (c||[]), bookings: (b||[]), maint: (m||[]),
          wallet: (w||[]), expenses: (ex||[]), rooms: (rm||[]),
          ts: Date.now()
        }));
      } catch {}
      setLoading(false);
      setRefreshing(false);
    } catch(e) { console.error(e); setLoading(false); setRefreshing(false); }
  }

  const names    = chalets.map(c=>c.name);

  // ── عزل بيانات مدير الشاليه على شاليهه فقط (يمنع تسرّب أرقام/حجوزات باقي الشاليهات) ──
  const scChalets  = isChaletMgr ? chalets.filter(c=>c.name===currentUser.chalet)  : chalets;
  const scBookings = isChaletMgr ? bookings.filter(b=>b.chalet===currentUser.chalet) : bookings;
  const scMaint    = isChaletMgr ? maint.filter(m=>m.chalet===currentUser.chalet)    : maint;
  const scExpenses = isChaletMgr ? expenses.filter(e=>e.chalet===currentUser.chalet) : expenses;
  const scWallet   = isChaletMgr ? wallet.filter(w=>w.chalet===currentUser.chalet)   : wallet;
  const scFixedExpenses = isChaletMgr ? fixedExpenses.filter(fx=>fx.chalet===currentUser.chalet) : fixedExpenses;
  const scNames    = isChaletMgr ? scChalets.map(c=>c.name) : names;

  const totRev   = useMemo(()=>{const br=scBookings.filter(b=>b.status==="completed"||b.status==="confirmed").reduce((s,b)=>s+Number(b.price),0);const pr=scChalets.reduce((s,c)=>s+Number(c.prev_revenue||0),0);return br+pr;},[scBookings,scChalets]);
  const walletBal  = useMemo(()=>scWallet.reduce((s,t)=>t.type==="إيداع"?s+t.amount:s-t.amount,0),[scWallet]);
  const cleaningBal= useMemo(()=>cleaning.reduce((s,t)=>t.type==="إيداع"?s+t.amount:s-t.amount,0),[cleaning]);
  const actB     = scBookings.filter(b=>b.status==="confirmed"||b.status==="pending").length;
  const opM      = scMaint.filter(m=>m.status==="open").length;
  const mCost    = scMaint.filter(m=>m.cost).reduce((s,m)=>s+Number(m.cost),0);
  const cBal     = useMemo(()=>{const map={};scChalets.forEach(c=>{map[c.name]=0;});scWallet.forEach(t=>{if(!Object.prototype.hasOwnProperty.call(map,t.chalet))return;if(t.type==="إيداع")map[t.chalet]+=t.amount;else map[t.chalet]=Math.max(0,map[t.chalet]-t.amount);});return map;},[scWallet,scChalets]);
  const cStats   = useMemo(()=>{
    const now=new Date(); const y=now.getFullYear(); const mo=now.getMonth();
    // precompute maps once instead of filtering per chalet
    const bMap: Record<string,Booking[]>={};
    for(const b of scBookings){if(!bMap[b.chalet])bMap[b.chalet]=[];bMap[b.chalet].push(b);}
    const mMap: Record<string,typeof maint[0][]>={};
    for(const m of scMaint){if(!mMap[m.chalet])mMap[m.chalet]=[];mMap[m.chalet].push(m);}
    const exMap: Record<string,typeof expenses[0][]>={};
    for(const e of scExpenses){if(!e.chalet)continue;if(!exMap[e.chalet])exMap[e.chalet]=[];exMap[e.chalet].push(e);}
    return scChalets.map(c=>{
      const cb=bMap[c.name]||[];
      const cm=mMap[c.name]||[];
      const ce=exMap[c.name]||[];
      const earned=cb.filter(b=>b.status==="completed"||b.status==="confirmed");
      const rev=earned.reduce((s,b)=>s+Number(b.price),0);
      const monthRev=earned.filter(b=>b.date_from&&new Date(b.date_from).getFullYear()===y&&new Date(b.date_from).getMonth()===mo).reduce((s,b)=>s+Number(b.price),0);
      const monthMaint=cm.filter(m=>Number(m.cost)>0&&m.maint_date&&new Date(m.maint_date).getFullYear()===y&&new Date(m.maint_date).getMonth()===mo).reduce((s,m)=>s+Number(m.cost),0);
      const monthMisc=ce.filter(e=>e.expense_date&&new Date(e.expense_date).getFullYear()===y&&new Date(e.expense_date).getMonth()===mo).reduce((s,e)=>s+Number(e.amount),0);
      const monthExp=monthMaint+monthMisc;
      // ليالٍ محجوزة هذا الشهر (مقصوصة على حدود الشهر) ونسبة الإشغال
      const mStart=new Date(y,mo,1), mEnd=new Date(y,mo+1,1), dim=new Date(y,mo+1,0).getDate();
      const nights=earned.filter(b=>b.date_from&&b.date_to).reduce((s,b)=>{const f=new Date(b.date_from),t=new Date(b.date_to);const a=f>mStart?f:mStart,e=t<mEnd?t:mEnd;return s+Math.max(0,Math.round((e.getTime()-a.getTime())/86400000));},0);
      return {
        nights, occ: dim>0?Math.round(nights/dim*100):0,
        ...c,
        rev,
        totalRev:(Number(c.prev_revenue)||0)+rev,
        monthRev,monthExp,
        mtot:cm.length,
        mop:cm.filter(m=>m.status==="open").length,
        mip:cm.filter(m=>m.status==="in_progress").length,
        mdn:cm.filter(m=>m.status==="done").length,
        ins:cBal[c.name]||0,
        goal:Number(c.monthly_goal||0),
      };
    });
  },[scChalets,scBookings,scMaint,scExpenses,cBal]);

  const invPeriodRange = ()=>{
    const now=new Date();
    if(invPeriod==="last_month"){
      const d=new Date(now.getFullYear(),now.getMonth()-1,1);
      const y=d.getFullYear(), m=d.getMonth();
      const last=new Date(y,m+1,0).getDate();
      return { from:`${y}-${String(m+1).padStart(2,"0")}-01`, to:`${y}-${String(m+1).padStart(2,"0")}-${String(last).padStart(2,"0")}` };
    }
    if(invPeriod==="this_year") return { from:`${now.getFullYear()}-01-01`, to:`${now.getFullYear()}-12-31` };
    return { from:monthStart(), to:monthEnd() };
  };
  const invPeriodLabel = invPeriod==="last_month"?"الشهر الماضي":invPeriod==="this_year"?"هذا العام":"هذا الشهر";
  const chaletNetForPeriod = useMemo(()=>{
    const { from, to } = invPeriodRange();
    const map: Record<string,{rev:number;mex:number;net:number}> = {};
    names.forEach(n=>{
      const rev = bookings.filter(b=>b.chalet===n&&(b.status==="completed"||b.status==="confirmed")&&b.date_from>=from&&b.date_from<=to).reduce((s,b)=>s+Number(b.price),0);
      const mex = maint.filter(m=>m.chalet===n&&Number(m.cost)>0&&m.maint_date&&m.maint_date>=from&&m.maint_date<=to).reduce((s,m)=>s+Number(m.cost),0);
      map[n] = { rev, mex, net: rev-mex };
    });
    return map;
  },[names,bookings,maint,invPeriod]);

  const eC = {name:"",loc:"",cap:"",price:"",wprice:"",ins:"",description:"",st:"active",img:null,allow_overnight:true,allow_hourly:true};
  const eB = {chalet:names[0]||"",guest:"",phone:"",date_from:"",date_to:"",price:"",status:"confirmed",note:""};
  const eM = {chalet:names[0]||"",issue:"",maint_date:"",priority:"متوسط",status:"open",cost:"",note:"",req:"",image:null};

  // عند تغيير اسم الشاليه، نحدّث الاسم في كل الجداول المرتبطة حتى لا تنكسر الروابط القديمة
  async function renameChaletEverywhere(oldName: string, newName: string): Promise<void> {
    if(!oldName || oldName===newName) return;
    const tables = ["bookings","maintenance","expenses","fixed_expenses","wallet","cleaning","cleaning_expenses","cleaning_tasks","rooms","smart_devices","reviews","room_requests"];
    await Promise.all(tables.map(t=>{
      const url = `${SUPA_URL}/rest/v1/${t}?chalet=eq.${encodeURIComponent(oldName)}`;
      return fetch(url,{
        method:"PATCH",
        headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,"Content-Type":"application/json"},
        body:JSON.stringify({chalet:newName}),
      }).catch(()=>null);
    }));
  }

  async function svC(f: Partial<Chalet>): Promise<void> {
    const openDate=f.open_date?f.open_date+"-01":null;
    const body={name:f.name,loc:f.loc,cap:Number(f.cap),price:Number(f.price),wprice:Number(f.wprice),ins:Number(f.ins),description:f.description,st:f.st,img:f.img||null,gallery:f.gallery||null,amenities:f.amenities||null,allow_overnight:f.allow_overnight!==false,allow_hourly:!!f.allow_hourly,hourly_slots:f.hourly_slots||null,open_date:openDate,prev_revenue:Number(f.prev_revenue)||0,terms:f.terms||null,entry_method:f.entry_method||null,map_url:f.map_url||null};
    if(f.id){
      const oldChalet = chalets.find(c=>c.id===f.id);
      const res = await db("chalets","PATCH",body as Record<string,unknown>,f.id);
      if(!res){ alert("فشل حفظ التعديلات:\n"+lastDbError); return; }
      if(oldChalet && f.name && oldChalet.name!==f.name) await renameChaletEverywhere(oldChalet.name, f.name);
    }else{
      const res = await db("chalets","POST",body as Record<string,unknown>);
      if(!res){ alert("فشل إضافة الشاليه:\n"+lastDbError); return; }
      if(Number(f.ins)>0)await db("wallet","POST",{trans_date:td(),type:"إيداع",chalet:f.name,cat:"تأمين",amount:Number(f.ins),note:"رصيد افتتاحي"});
    }
    await loadAll();setCMdl(null);
  }
  async function dlC(id: number): Promise<void> {if(!window.confirm("حذف الشاليه نهائياً؟ لا يمكن التراجع."))return;await db("chalets","DELETE",null,id);await loadAll();}
  // عند فشل الحفظ (شبكة/صلاحيات) db() يرجّع null بصمت — لازم نوقف هنا ونبلّغ المستخدم بدل إغلاق النموذج وكأنه نجح،
  // لأن هذا بالضبط ما كان يخلي المستخدم يظن إن الحجز اختفى ثم يضيفه من جديد يدوياً فيتكرر.
  async function svB(f: Partial<Booking>): Promise<void> {
    const body={chalet:f.chalet,guest:f.guest,phone:f.phone,date_from:f.date_from,date_to:f.date_to,checkin_time:f.checkin_time||null,checkout_time:f.checkout_time||null,price:Number(f.price),status:f.status,note:f.note};
    const result = f.id
      ? await db("bookings","PATCH",body as Record<string,unknown>,f.id)
      : await db("bookings","POST",body as Record<string,unknown>);
    if(!result){ alert("تعذّر حفظ الحجز، تحقق من الاتصال وحاول مرة أخرى. بياناتك لم تُفقد."); return; }
    await loadAll();
    setBMdl(null);
  }

  // ── تقييم الضيوف بعد الخروج وحظرهم ──
  function normPhone(p?: string | null): string {
    if(!p) return "";
    let d = p.replace(/[^0-9]/g,"");
    if(d.startsWith("0")) d = "966"+d.slice(1);
    return d;
  }
  function findBlockRecord(phone?: string | null): BlockedGuest | undefined {
    const n = normPhone(phone);
    if(!n) return undefined;
    return blockedGuests.find(g=>normPhone(g.phone)===n);
  }
  function isGuestBlocked(phone?: string | null): boolean {
    return !!findBlockRecord(phone);
  }
  function isCheckedOut(b: Booking): boolean {
    return b.status==="completed" || (!!b.date_to && b.date_to < td());
  }
  async function svGuestRating(): Promise<void> {
    if(!grMdl||!grMdl.rating) return;
    const b = grMdl.booking;
    await db("guest_ratings","POST",{booking_id:b.id,chalet:b.chalet,guest:b.guest,phone:b.phone||null,rating:grMdl.rating,note:grMdl.note||null});
    await loadAll();
    setGrMdl(null);
  }
  async function confirmBlockGuest(): Promise<void> {
    if(!blockMdl) return;
    const b = blockMdl.booking;
    await db("blocked_guests","POST",{phone:normPhone(b.phone),guest:b.guest,reason:blockMdl.reason||null});
    await loadAll();
    setBlockMdl(null);
  }
  async function unblockGuest(phone?: string | null): Promise<void> {
    const rec = findBlockRecord(phone);
    if(!rec) return;
    if(!window.confirm(bt("unblockConfirm"))) return;
    await db("blocked_guests","DELETE",null,rec.id);
    await loadAll();
  }
  function buildPreArrivalMsg(b: Booking): string {
    const checkinTime  = b.checkin_time  || "الوقت المتفق عليه";
    const checkoutTime = b.checkout_time || "الوقت المتفق عليه";
    const poolUrl = `https://reetam-chalets.vercel.app?guest=1&b=${b.id}&m=pool`;
    const ch = chalets.find(c=>c.name===b.chalet);
    const dayLabel = b.date_from===td() ? "اليوم" : "غداً";
    const sections = [
      `مرحباً ${b.guest} 👋`,
      `نذكّركم بحجزكم في *${b.chalet}* ${dayLabel} إن شاء الله 🏡`,
      `*التفاصيل:*\n⏰ وقت الدخول: ${checkinTime}\n⏰ وقت الخروج: ${checkoutTime}`,
    ];
    if(ch?.map_url) sections.push(`📍 *الموقع:*\n${ch.map_url}`);
    if(ch?.entry_method) sections.push(`🔑 *طريقة الدخول:*\n${ch.entry_method}`);
    sections.push(`🏊 *بخصوص المسبح:*\nتعبئة المسبح تتم مرة واحدة فقط — يرجى اختيار ما يناسبكم:\n${poolUrl}`);
    if(ch?.terms) sections.push(`📄 *الشروط والأحكام:*\n${ch.terms}`);
    sections.push(
      `*تذكير مهم:*\n• يرجى الالتزام بوقت الدخول والخروج المحدد\n• في حال التأخر عن وقت الخروج يُطبّق رسوم إضافية`,
      `نتطلع لاستقبالكم وتمنياتنا لكم بإقامة ممتعة 🌟\n*ريتام للشاليهات*`,
    );
    return sections.join("\n\n");
  }
  function buildPoolApprovalMsg(b: Booking): string {
    const pref = b.pool_preference || "";
    const isReady = pref.startsWith("ready");
    const time = pref.includes(":") ? pref.split(":").slice(1).join(":") : "";
    const poolLine = isReady
      ? `✅ المسبح سيكون جاهزاً عند وصولكم${time ? " الساعة " + time : ""}`
      : "✅ سيتم تعبئة المسبح فور وصولكم مباشرة";
    return `مرحباً ${b.guest} 👋

تم تأكيد طلب المسبح الخاص بحجزكم في *${b.chalet}* 🏊

${poolLine}

نتطلع لاستقبالكم 🌟
*ريتام للشاليهات*`;
  }
  const [preArrMdl, setPreArrMdl] = useState<{booking: Booking} | null>(null);

  // ── تنبيه الوصول خلال ساعة ──
  const [nowTick,setNowTick] = useState(Date.now());
  useEffect(()=>{ const t=setInterval(()=>setNowTick(Date.now()),30000); return ()=>clearInterval(t); },[]);
  useEffect(()=>{
    if(typeof Notification!=="undefined"&&Notification.permission==="default") Notification.requestPermission().catch(()=>{});
  },[]);
  function checkinDateTime(b: Booking): Date | null {
    if(!b.date_from||!b.checkin_time) return null;
    const parts=b.checkin_time.split(":");
    const h=Number(parts[0]), m=Number(parts[1]||0);
    if(isNaN(h)) return null;
    const d=new Date(b.date_from+"T00:00:00");
    d.setHours(h,m,0,0);
    return d;
  }
  const soonArrivals = useMemo(()=>{
    return scBookings.filter(b=>{
      if(b.status!=="confirmed") return false;
      const dt=checkinDateTime(b);
      if(!dt) return false;
      const diffMin=(dt.getTime()-nowTick)/60000;
      return diffMin>0&&diffMin<=60;
    }).sort((a,b)=>(checkinDateTime(a)!.getTime())-(checkinDateTime(b)!.getTime()));
  },[scBookings,nowTick]);
  const [notifiedArrivals,setNotifiedArrivals] = useState<Set<number>>(new Set());
  useEffect(()=>{
    soonArrivals.forEach(b=>{
      if(notifiedArrivals.has(b.id)) return;
      setNotifiedArrivals(p=>new Set(p).add(b.id));
      if(typeof Notification!=="undefined"&&Notification.permission==="granted"){
        new Notification("⏰ وصول خلال ساعة",{body:`${b.guest} — ${b.chalet} الساعة ${b.checkin_time}`});
      }
    });
  },[soonArrivals]);
  async function svM(f: Partial<MaintenanceRequest>, old?: MaintenanceRequest | null): Promise<void> {const cost=Number(f.cost)||0;const wasDone=old?.status==="done";const isDone=f.status==="done";const isNew=!f.id;const body={chalet:f.chalet,issue:f.issue,maint_date:f.maint_date,priority:f.priority,status:f.status,cost,note:f.note,req:f.req,image:f.image||null};if(f.id)await db("maintenance","PATCH",body as Record<string,unknown>,f.id);else await db("maintenance","POST",body as Record<string,unknown>);if(cost>0&&isDone&&(isNew||!wasDone))await db("wallet","POST",{trans_date:f.maint_date||td(),type:"سحب صيانة",chalet:f.chalet,cat:"صيانة",amount:cost,note:f.issue||"صيانة"});await loadAll();setMMdl(null);}
  async function svAC(chalet: string, field: string, value: unknown, roomId: number | null = null): Promise<void> {if(roomId){const room=rooms.find(r=>r.id===roomId);const body={chalet,room_id:roomId,room_name:room?.name||"",ac_on:field==="ac_on"?value:(room?._acOn||false),ac_temp:field==="ac_temp"?value:(room?._acTemp||22),ac_mode:field==="ac_mode"?value:(room?._acMode||"cool"),ac_speed:field==="ac_speed"?value:(room?._acSpeed||"auto"),updated_at:new Date().toISOString()};if(room?._sdId){await db("smart_devices","PATCH",body as Record<string,unknown>,room._sdId);}else{const res=await db("smart_devices","POST",body as Record<string,unknown>);if(res?.[0])setRooms(p=>p.map(x=>x.id===roomId?{...x,_sdId:(res[0] as Room).id}:x));}await sendACCommand(roomId,field,value);}else{const ch=chalets.find(x=>x.name===chalet);const body={chalet,ac_on:field==="ac_on"?value:(ch?._acOn||false),ac_temp:field==="ac_temp"?value:(ch?._acTemp||22),ac_mode:field==="ac_mode"?value:(ch?._acMode||"cool"),ac_speed:field==="ac_speed"?value:(ch?._acSpeed||"auto"),updated_at:new Date().toISOString()};if(ch?._sdId){await db("smart_devices","PATCH",body as Record<string,unknown>,ch._sdId);}else{const res=await db("smart_devices","POST",body as Record<string,unknown>);if(res?.[0])setChalets(p=>p.map(x=>x.name===chalet?{...x,_sdId:(res[0] as Chalet).id}:x));}}}
  async function svCln(chalet: string, amount: string | number, note: string): Promise<void> {const amt=Number(amount);if(!amt||!chalet)return;await db("cleaning","POST",{trans_date:td(),type:"إيداع",chalet,amount:amt,note:note||"إيداع نظافة"});await loadAll();setClnMdl(false);}
  async function payFixedExpense(fx: FixedExpense): Promise<void> {await db("expenses","POST",{chalet:fx.chalet,category:fx.category||"مصروف ثابت",amount:Number(fx.amount),note:fx.name,expense_date:td()});await loadAll();}
  // تأكيد الاطلاع على تذكير الإيجار ينقله للشهر القادم فقط — بدون أي تسجيل مالي في جدول المصاريف.
  async function acknowledgeRent(fx: FixedExpense): Promise<void> {await db("fixed_expenses","PATCH",{last_acknowledged:td()},fx.id);await loadAll();}
  async function svI(chalet: string, amount: string | number, note: string): Promise<void> {const amt=Number(amount);if(!amt||!chalet)return;await db("wallet","POST",{trans_date:td(),type:"إيداع",chalet,cat:"تأمين",amount:amt,note:note||"إيداع تأمين"});await loadAll();setIMdl(false);}
  async function handleCheckout(booking: Booking, amt: number, pay: string, receivedBy: string): Promise<void> {
    await db("bookings","PATCH",{status:"completed",price:amt,received_by:receivedBy||null},booking.id);
    // مهمة تنظيف تلقائية بعد الخروج — جدول cleaning_tasks ما فيه عمود note، إرساله كان يفشّل كل عملية الإضافة بصمت
    // (PostgREST يرفض أي حقل غير موجود في الجدول)، فلا تنشأ مهمة التنظيف أبداً. التاريخ صار جزء من العنوان بدلاً منه.
    await db("cleaning_tasks","POST",{
      chalet: booking.chalet,
      title: `تنظيف بعد خروج ${booking.guest} · ${td()}`,
      frequency: "مرة واحدة",
      category: "تنظيف عام",
      active: true,
      assigned_to: "",
    });
    await loadAll();
    setCoMdl(null);
  }
  function sendBookingsToWorkersHindi(bks: Booking[]): void {
    // للعمال المتحدثين بالهندية: قائمة بالشاليه ورقم جوال الزبون ووقت الدخول والخروج
    const fmtDate = (s?: string) => {
      if (!s) return "-";
      const d = new Date(s);
      return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
    };
    const lines = [
      `🏠 *बुकिंग सूची — रीतम ग्रुप*`,
      `🗓️ ${fmtDate(td())}`,
      ``,
      ...bks.map((b,i) => {
        const phone = (b.phone||"").replace(/[^0-9]/g,"").replace(/^0/,"966") || "-";
        const inStr = fmtDate(b.date_from) + (b.checkin_time?` ${b.checkin_time}`:"");
        const outStr = fmtDate(b.date_to) + (b.checkout_time?` ${b.checkout_time}`:"");
        return `${i+1}. 🏠 शैले: *${b.chalet}*\n📞 फोन: ${phone}\n🟢 चेक-इन: ${inStr}\n🔴 चेक-आउट: ${outStr}`;
      }),
      ``,
      `_रीतम सिस्टम से स्वचालित सूची_`,
    ];
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  const TABS = [
    {id:"dashboard",  l:"الرئيسية",          g:"التشغيل"},
    {id:"bookings",   l:"الحجوزات",          g:"التشغيل"},
    {id:"chalets",    l:"الشاليهات",         g:"التشغيل"},
    {id:"maintenance",l:"الصيانة",           g:"التشغيل"},
    {id:"cleaning",   l:"النظافة",           g:"التشغيل"},
    {id:"smart",      l:"التحكم الذكي",      g:"التشغيل"},
    {id:"finance",    l:"المالية",           g:"المال"},
    {id:"wallets",    l:"المحافظ",           g:"المال"},
    {id:"investors",  l:"المستثمرون",        g:"المال"},
    {id:"loyalty",    l:"الولاء والتقييمات", g:"العملاء"},
    {id:"settings",   l:"الإعدادات",         g:"النظام"},
  ];

  function allowedTabs(t) {
    if(isAdmin) return true;
    if(isChaletMgr) return ["dashboard","bookings","maintenance","loyalty","smart","finance"].includes(t.id);
    if(isStaff)     return ["dashboard","bookings","chalets","maintenance"].includes(t.id);
    return ["dashboard","bookings"].includes(t.id);
  }

  function AddRoomMdl(){
    const [rname,setRname]=useState("");
    if(!addRoomMdl) return null;
    return (
      <Mdl onClose={()=>setAddRoomMdl(null)} title={"إضافة غرفة — "+addRoomMdl}>
        <div style={{marginBottom:16}}><label className="lbl">اسم الغرفة</label><input className="inp" value={rname} onChange={e=>setRname(e.target.value)} placeholder="مثال: غرفة 1"/></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
          {["الصالة","غرفة 1","غرفة 2","غرفة 3","المسبح","المطبخ"].map(n=>(
            <button key={n} className="btn" onClick={()=>setRname(n)} style={{padding:"6px 12px",fontSize:12,background:rname===n?B:SL,color:rname===n?S:B,border:"1.5px solid rgba(201,163,106,.3)"}}>{n}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn bo" onClick={()=>setAddRoomMdl(null)}>إلغاء</button>
          <button className="btn bp" onClick={async()=>{if(!rname)return;await db("rooms","POST",{chalet:addRoomMdl,name:rname});await loadAll();setAddRoomMdl(null);}}>+ إضافة</button>
        </div>
      </Mdl>
    );
  }

  function InsMdl(){
    const [ch,setCh]=useState(names[0]||"");
    const [amt,setAmt]=useState("");
    const [nt,setNt]=useState("");
    return (
      <Mdl onClose={()=>setIMdl(false)} title="إضافة تأمين">
        <p style={{color:T,fontSize:13,marginBottom:16}}>المبلغ سيُضاف فوراً لمحفظة التأمين</p>
        <div style={{marginBottom:12}}><label className="lbl">الشاليه</label><select className="inp" value={ch} onChange={e=>setCh(e.target.value)}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
        <div style={{marginBottom:12}}><label className="lbl">المبلغ (ريال)</label><input className="inp" type="number" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="0"/></div>
        <div style={{marginBottom:20}}><label className="lbl">ملاحظة</label><input className="inp" value={nt} onChange={e=>setNt(e.target.value)} placeholder="مثال: تأمين شهر يونيو"/></div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn bo" onClick={()=>setIMdl(false)}>إلغاء</button>
          <button className="btn bp" onClick={()=>svI(ch,amt,nt)}>حفظ وإضافة</button>
        </div>
      </Mdl>
    );
  }

  function CheckoutMdl({booking}) {
    const [amt,setAmt]=useState(String(booking.price||""));
    const [pay,setPay]=useState("نقد");
    const defaultRecv = currentUser.name||currentUser.username||"";
    const knownReceivers = Array.from(new Set([
      ...users.map(u=>u.name||u.username).filter(Boolean),
      ...bookings.map(b=>b.received_by).filter(Boolean),
    ])).sort((a,b)=>a.localeCompare(b,"ar"));
    const [recv,setRecv]=useState(defaultRecv);
    const [addingNew,setAddingNew]=useState(knownReceivers.length===0);
    const [loading,setLoading]=useState(false);
    return (
      <Mdl onClose={()=>setCoMdl(null)} title="🚪 تسجيل الخروج">
        <div style={{background:SL,borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{fontWeight:800,color:B,fontSize:15,marginBottom:4}}>{booking.guest}</div>
          <div style={{fontSize:13,color:T}}>{booking.chalet} · خروج: {fd(booking.date_to)}</div>
          <div style={{fontSize:12,color:T,marginTop:4}}>{fn(booking.date_from,booking.date_to)+" ليلة · "+Number(booking.price).toLocaleString("en-US")+" ر"}</div>
        </div>
        <div style={{marginBottom:12}}><label className="lbl">💰 المبلغ المدفوع (ريال)</label><input className="inp" type="number" value={amt} onChange={e=>setAmt(e.target.value)}/></div>
        <div style={{marginBottom:12}}>
          <label className="lbl">طريقة الدفع</label>
          <div style={{display:"flex",gap:8}}>
            {[{v:"نقد",i:"💵"},{v:"تحويل",i:"📱"},{v:"مدى",i:"💳"}].map(m=>(
              <button key={m.v} className="btn" onClick={()=>setPay(m.v)} style={{flex:1,padding:"10px 0",fontSize:13,background:pay===m.v?B:SL,color:pay===m.v?S:B,border:"1.5px solid rgba(201,163,106,.3)"}}>
                {m.i} {m.v}
              </button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:20}}>
          <label className="lbl">👤 استلم المبلغ *</label>
          {addingNew
            ? <div style={{display:"flex",gap:6}}>
                <input className="inp" value={recv} onChange={e=>setRecv(e.target.value)} placeholder="اسم الشخص" autoFocus/>
                {knownReceivers.length>0 && (
                  <button type="button" className="btn bsm" onClick={()=>{setAddingNew(false);setRecv(defaultRecv);}}
                    style={{background:SL,color:B,padding:"0 12px",flexShrink:0}}>القائمة</button>
                )}
              </div>
            : <select className="inp" value={recv} onChange={e=>{
                if(e.target.value==="__new__"){setAddingNew(true);setRecv("");}
                else setRecv(e.target.value);
              }}>
                {!knownReceivers.includes(recv)&&recv&&<option value={recv}>{recv}</option>}
                {knownReceivers.map(n=><option key={n} value={n}>{n}</option>)}
                <option value="__new__">+ إضافة اسم جديد...</option>
              </select>
          }
          {!recv.trim() && <div style={{fontSize:11,color:"#A63A2A",marginTop:4}}>لازم تحدد من استلم المبلغ</div>}
        </div>
        <div style={{background:"#FEF3C7",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#92400E",fontWeight:600}}>
          سيتم تسجيل {Number(amt||0).toLocaleString("en-US")} ريال في الإيرادات
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn bo" onClick={()=>setCoMdl(null)}>إلغاء</button>
          <button className="btn bp" disabled={loading||!recv.trim()} onClick={async()=>{setLoading(true);await handleCheckout(booking,Number(amt||0),pay,recv.trim());setLoading(false);}}>
            {loading?"جاري...":"✅ تأكيد الخروج"}
          </button>
        </div>
      </Mdl>
    );
  }

  if(loading) {
    return (
      <div dir="rtl" style={{fontFamily:"'IBM Plex Sans Arabic',sans-serif",background:OW,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <style>{CSS}</style>
        <div style={{textAlign:"center"}}>
          <Logo size={60}/>
          <div style={{color:T,marginTop:16,fontSize:16,fontWeight:600}}>جاري التحميل...</div>
        </div>
      </div>
    );
  }

  // ─── Sidebar ──────────────────────────────────────────────────────────────
  const SIDE_W = 250;
  const roleLabel = isAdmin ? "أدمن" : isChaletMgr ? "مدير شاليه" : "موظف";
  const userName  = currentUser.name || currentUser.username || "";
  const pendingCount = bookings.filter(b=>b.status==="pending").length;

  const sideBrand = (
    <div className="rs-brand">
      <div className="rs-brand-mark"><Logo size={30}/></div>
      <div>
        <div className="rs-brand-name">مجموعة ريتام</div>
        <div className="rs-brand-sub">نظام إدارة الشاليهات</div>
      </div>
    </div>
  );
  const sideNav = (count:number, afterPick?:()=>void) => (
    <nav className="rs-nav" aria-label="القائمة الرئيسية">
      {TABS.filter(allowedTabs).map((t,i,arr)=>(
        <React.Fragment key={t.id}>
          {(i===0||arr[i-1].g!==t.g)&&<div className="x-nav-group">{t.g}</div>}
          <button type="button" onClick={()=>{setTab(t.id);afterPick?.();}}
            className={"rs-item"+(tab===t.id?" active":"")} aria-current={tab===t.id?"page":undefined}>
            <NavIcon id={t.id}/>
            <span>{t.l}</span>
            {t.id==="bookings"&&count>0&&<span className="rs-count">{count}</span>}
            {t.id==="maintenance"&&opM>0&&<span className="rs-count">{opM}</span>}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
  const sideFoot = (
    <div className="rs-foot">
      <button type="button" className="rs-theme" onClick={toggleDark}>
        <span>{dark?"الوضع النهاري":"الوضع الليلي"}</span>
        <NavIcon id={dark?"sun":"moon"}/>
      </button>
      <div className="rs-user">
        <div className="rs-avatar">{userName.trim().charAt(0)||"م"}</div>
        <div style={{flex:1,minWidth:0}}>
          <div className="rs-user-name">{userName}</div>
          <div className="rs-user-role">{roleLabel}</div>
        </div>
        <button type="button" className="rs-logout" onClick={onLogout}>خروج</button>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={{fontFamily:"var(--f-body)",background:"var(--bg)",color:"var(--text)",minHeight:"100vh"}}>
      <style>{CSS}</style>

      {/* ── Sidebar Desktop ── */}
      {!isMobile && (
        <aside className="rs-side" style={{width:SIDE_W,position:"fixed",top:0,right:0,height:"100vh",zIndex:50,overflowY:"auto"}}>
          {sideBrand}
          {sideNav(actB)}
          {sideFoot}
        </aside>
      )}

      {/* ── Mobile Header ── */}
      {isMobile && (
        <>
          <div className="rs-topbar">
            <button type="button" className="rs-iconbtn" aria-label="فتح القائمة" onClick={()=>setDrawerOpen(true)}>
              <NavIcon id="menu"/>
            </button>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Logo size={26}/>
              <span style={{color:"var(--side-strong)",fontFamily:"var(--f-display)",fontWeight:700,fontSize:15}}>مجموعة ريتام</span>
            </div>
            <button type="button" className="rs-iconbtn" aria-label={dark?"الوضع النهاري":"الوضع الليلي"} onClick={toggleDark}>
              <NavIcon id={dark?"sun":"moon"}/>
            </button>
          </div>

          {/* Drawer Overlay */}
          {drawerOpen&&(
            <div style={{position:"fixed",inset:0,zIndex:300,display:"flex"}}>
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)"}} onClick={()=>setDrawerOpen(false)}/>
              <aside className="rs-side" style={{position:"relative",width:270,maxWidth:"85vw",height:"100%",overflowY:"auto",zIndex:301}}>
                {sideBrand}
                {sideNav(pendingCount, ()=>setDrawerOpen(false))}
                {sideFoot}
              </aside>
            </div>
          )}
        </>
      )}

      {/* ── Main Content ── */}
      <div style={{marginRight:isMobile?0:SIDE_W,minHeight:"100vh"}}>
        {/* شريط التحديث */}
        {refreshing&&(
          <div style={{position:"fixed",top:0,left:0,right:0,height:3,zIndex:9999,background:"linear-gradient(90deg,transparent,#C9A36A,#8B7355,transparent)",backgroundSize:"200% 100%",animation:"shimmer 1.2s linear infinite"}}/>
        )}
        <main style={{maxWidth:1100,margin:"0 auto",padding:isMobile?"14px 12px":"24px 20px",paddingBottom:isMobile?80:60}}>

          {/* ── Dashboard ── */}
          {tab==="dashboard"&&(()=>{
            const now=new Date();
            const y=now.getFullYear(), mo=now.getMonth();
            const activeStatuses=["completed","confirmed"];
            const inMonth=(d:string|undefined,yy:number,mm:number)=>!!d&&new Date(d).getFullYear()===yy&&new Date(d).getMonth()===mm;
            const monthBks=scBookings.filter(b=>activeStatuses.includes(b.status)&&inMonth(b.date_from,y,mo));
            const monthRev=monthBks.reduce((s,b)=>s+Number(b.price),0);
            const lastMo=mo===0?11:mo-1; const lastY=mo===0?y-1:y;
            const lastMonthRev=scBookings.filter(b=>activeStatuses.includes(b.status)&&inMonth(b.date_from,lastY,lastMo)).reduce((s,b)=>s+Number(b.price),0);
            const diff=lastMonthRev>0?Math.round((monthRev-lastMonthRev)/lastMonthRev*100):null;
            const yearRev=scBookings.filter(b=>activeStatuses.includes(b.status)&&b.date_from&&new Date(b.date_from).getFullYear()===y).reduce((s,b)=>s+Number(b.price),0);
            const monthExp=scExpenses.filter(e=>inMonth(e.expense_date,y,mo)).reduce((s,e)=>s+Number(e.amount),0)
              + scMaint.filter(m=>m.cost&&inMonth(m.maint_date,y,mo)).reduce((s,m)=>s+Number(m.cost),0);
            const netProfit=monthRev-monthExp;
            const margin=monthRev>0?Math.round(netProfit/monthRev*100):0;
            const daysInMonth=new Date(y,mo+1,0).getDate();
            const activeChaletsCount=scChalets.filter(c=>c.st!=="inactive").length||scChalets.length;
            const monthStartD=new Date(y,mo,1), monthEndD=new Date(y,mo+1,1);
            const bookedNights=scBookings.filter(b=>activeStatuses.includes(b.status)&&b.date_from&&b.date_to).reduce((s,b)=>{
              const from=new Date(b.date_from), to=new Date(b.date_to);
              const start=from>monthStartD?from:monthStartD, end=to<monthEndD?to:monthEndD;
              return s+Math.max(0,Math.round((end.getTime()-start.getTime())/86400000));
            },0);
            const availableNights=activeChaletsCount*daysInMonth;
            const occupancyPct=availableNights>0?Math.round(bookedNights/availableNights*100):0;
            const adr=bookedNights>0?Math.round(monthRev/bookedNights):0;
            const revpar=availableNights>0?Math.round(monthRev/availableNights):0;
            const monthName=now.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{month:"long"});

            // ── قائمة موحّدة لكل ما يحتاج تصرّفاً اليوم، مرتبة حسب الأولوية ──
            type Act={label:string;primary?:boolean;onClick:()=>void|Promise<void>};
            type Item={key:string;tone:"bad"|"warn"|"info"|"muted";icon:string;title:string;desc:React.ReactNode;acts:Act[]};
            const items:Item[]=[];
            const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
            const yesterday=new Date(today); yesterday.setDate(today.getDate()-1);
            scBookings.filter(b=>{
              if(b.status!=="confirmed"&&b.status!=="pending") return false;
              if(!b.date_to) return false;
              const to=new Date(b.date_to); const toD=new Date(to.getFullYear(),to.getMonth(),to.getDate());
              return toD<=today&&toD>=yesterday;
            }).forEach(b=>items.push({key:"co"+b.id,tone:"bad",icon:"door",title:"تسجيل خروج: "+b.guest,desc:b.chalet+" · "+fd(b.date_to)+" · "+Number(b.price).toLocaleString("en-US")+" ر.س",acts:[{label:"تسجيل خروج",primary:true,onClick:()=>setCoMdl(b)}]}));
            soonArrivals.forEach(b=>{
              const dt=checkinDateTime(b); const mins=dt?Math.max(0,Math.round((dt.getTime()-nowTick)/60000)):0;
              items.push({key:"sa"+b.id,tone:"warn",icon:"clock",title:"وصول خلال "+mins+" دقيقة: "+b.guest,desc:<>{b.chalet+" · دخول "+(b.checkin_time||"")}{b.pre_arrival_sent&&<> · <span className="x-pos">أُرسلت الرسالة</span></>}{!b.phone&&<> · <span className="x-neg">لا يوجد جوال</span></>}</>,acts:[{label:b.pre_arrival_sent?"إعادة إرسال":"إرسال رسالة الوصول",primary:!b.pre_arrival_sent,onClick:()=>setPreArrMdl({booking:b})}]});
            });
            const tomStr=new Date(Date.now()+86400000).toISOString().slice(0,10);
            scBookings.filter(b=>b.status==="confirmed"&&b.date_from===tomStr).forEach(b=>{
              items.push({key:"tm"+b.id,tone:b.pre_arrival_sent?"muted":"info",icon:"msg",title:"وصول غداً: "+b.guest,desc:<>{b.chalet}{b.checkin_time&&" · دخول "+b.checkin_time}{b.pre_arrival_sent?<> · <span className="x-pos">أُرسلت الرسالة</span></>:" · لم تُرسل رسالة الوصول"}{!b.phone&&<> · <span className="x-neg">لا يوجد جوال</span></>}</>,acts:[{label:b.pre_arrival_sent?"إعادة إرسال":"إرسال",primary:!b.pre_arrival_sent,onClick:()=>setPreArrMdl({booking:b})}]});
            });
            const poolLabel=(pref:string)=>{if(!pref)return "-";if(pref==="on_arrival")return "تعبئة عند الوصول";if(pref.startsWith("ready")){const t=pref.split(":").slice(1).join(":");return t?"جاهز عند الوصول · الساعة "+t:"جاهز عند الوصول";}return pref;};
            scBookings.filter(b=>b.pool_preference&&!b.pool_approved&&b.status==="confirmed").forEach(b=>{
              items.push({key:"pl"+b.id,tone:"info",icon:"pool",title:"طلب تجهيز المسبح: "+b.guest,desc:b.chalet+" · "+poolLabel(b.pool_preference||"")+" · دخول "+fd(b.date_from),acts:[
                {label:"موافقة وإرسال",primary:true,onClick:async()=>{await db("bookings","PATCH",{pool_approved:true},b.id);await loadAll();const msg=encodeURIComponent(buildPoolApprovalMsg(b));const phone=b.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966")||"";if(phone)window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");}},
                {label:"رفض",onClick:async()=>{await db("bookings","PATCH",{pool_preference:null,pool_approved:false},b.id);await loadAll();}},
              ]});
            });
            roomReqs.forEach((r:any)=>{
              const rt=ROOM_REQUEST_TYPES.find(x=>x.val===r.type)||{label:r.type};
              const ago=Math.round((Date.now()-new Date(r.created_at).getTime())/60000);
              const agoStr=ago<1?"الآن":ago<60?`منذ ${ago} د`:`منذ ${Math.round(ago/60)} س`;
              items.push({key:"rr"+r.id,tone:"muted",icon:"bell",title:"طلب غرفة: "+rt.label,desc:<>{r.chalet+" · "+r.room+" · "+agoStr}{r.note&&<> · «{r.note}»</>}</>,acts:[{label:"تم",onClick:async()=>{await db("room_requests","PATCH",{resolved:true},r.id);await loadAll();}}]});
            });
            scFixedExpenses.filter(fx=>fx.active&&fx.category==="إيجار").map(fx=>({fx,info:nextDueInfo(fx)})).filter(x=>x.info&&x.info.daysUntil<=RENT_REMINDER_DAYS).sort((a,b)=>a.info!.daysUntil-b.info!.daysUntil).forEach(({fx,info})=>{
              const d=info!.daysUntil;
              items.push({key:"rn"+fx.id,tone:d<0?"bad":"warn",icon:"home",title:d<0?"إيجار متأخر "+Math.abs(d)+" يوم":d===0?"الإيجار يستحق اليوم":"الإيجار يستحق بعد "+d+" يوم",desc:fx.chalet+" · "+fx.name+" · "+Number(fx.amount).toLocaleString("en-US")+" ر.س · "+formatDueDate(info!.nextDue),acts:[{label:"تم",onClick:()=>acknowledgeRent(fx)}]});
            });
            {
              const thisYM=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
              const paidNames=new Set(scExpenses.filter(e=>e.expense_date?.startsWith(thisYM)).map(e=>e.note));
              scFixedExpenses.filter(fx=>fx.active&&fx.category!=="إيجار"&&!paidNames.has(fx.name)).forEach(fx=>{
                items.push({key:"fx"+fx.id,tone:"warn",icon:"receipt",title:"مصروف ثابت لم يُسدَّد: "+fx.name,desc:fx.chalet+" · "+(fx.category||"")+" · "+Number(fx.amount).toLocaleString("en-US")+" ر.س",acts:[{label:"تسديد",onClick:()=>payFixedExpense(fx)}]});
              });
            }
            const rank={bad:0,warn:1,info:2,muted:3};
            items.sort((a,b)=>rank[a.tone]-rank[b.tone]);

            const upcoming=scBookings.filter(b=>b.status!=="cancelled"&&b.status!=="completed").map(b=>{const from=new Date(b.date_from);return{...b,daysLeft:Math.round((new Date(from.getFullYear(),from.getMonth(),from.getDate()).getTime()-today.getTime())/86400000)};}).filter(b=>b.daysLeft>=-1).sort((a,b)=>a.daysLeft-b.daysLeft).slice(0,6);
            const hour=now.getHours();
            const greet=hour<12?"صباح الخير":"مساء الخير";
            const firstName=(currentUser.name||currentUser.username||"").trim().split(" ")[0];

            return (
            <div className="x-page">
              <PageHead title={greet+(firstName?"، "+firstName:"")}
                sub={now.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{weekday:"long",year:"numeric",month:"long",day:"numeric"})+(items.length?" · "+items.length+" أمور تحتاجك":" · لا شيء عاجل")}>
                <button className="btn bo" onClick={()=>setTab("bookings")}><Icon n="cal"/>التقويم</button>
                <button className="btn bp" onClick={()=>setBMdl({...eB})}><Icon n="plus"/>حجز جديد</button>
              </PageHead>

              <div className="x-kpis">
                <Kpi hero label={"إيرادات "+monthName} badge={diff!==null?<Pill tone="">{(diff>0?"+":"")+diff+"% عن الشهر الماضي"}</Pill>:undefined}
                  value={<SAR v={monthRev}/>} sub={monthBks.length+" حجز · إيرادات العام "+yearRev.toLocaleString("en-US")+" ر.س"}/>
                <Kpi label="صافي الربح" badge={monthRev>0?<Pill tone={margin>=40?"ok":margin>=0?"warn":"bad"}>{"هامش "+margin+"%"}</Pill>:undefined}
                  value={<SAR v={netProfit}/>} tone={netProfit<0?"neg":undefined} sub={"مصاريف "+monthExp.toLocaleString("en-US")+" ر.س"}/>
                <Kpi label="نسبة الإشغال" value={<>{occupancyPct}<small>%</small></>} sub={bookedNights.toLocaleString("en-US")+" من "+availableNights.toLocaleString("en-US")+" ليلة متاحة"}>
                  <Track pct={occupancyPct} tone={toneFor(occupancyPct)}/>
                </Kpi>
                <Kpi label="متوسط سعر الليلة" value={<SAR v={adr}/>} sub={"العائد لكل ليلة متاحة "+revpar.toLocaleString("en-US")+" ر.س"}/>
              </div>

              <div className="x-card">
                <CardHead icon="bell" title="يحتاج تصرّفك اليوم" sub={items.length?"مرتبة حسب الأولوية":undefined}/>
                {items.length===0
                  ? <Empty>كل شيء تحت السيطرة، لا توجد مهام عاجلة الآن</Empty>
                  : <div className="x-list">{items.map(it=>(
                      <div key={it.key} className="x-li">
                        <div className={"x-ic "+it.tone}><Icon n={it.icon}/></div>
                        <div className="meta"><b>{it.title}</b><span>{it.desc}</span></div>
                        <div className="acts">{it.acts.map((a,i)=><ActBtn key={i} primary={a.primary} onClick={a.onClick}>{a.label}</ActBtn>)}</div>
                      </div>
                    ))}</div>}
              </div>

              <div className="x-grid2">
                <MonthlyChart bookings={scBookings} expenses={scExpenses} maint={scMaint} B={B} T={T} SI={SI} SL={SL}/>
                <div className="x-card">
                  <CardHead icon="cal" title="الحجوزات القادمة"><button className="btn bo bsm" onClick={()=>setTab("bookings")}>الكل</button></CardHead>
                  {upcoming.length===0 ? <Empty>لا توجد حجوزات قادمة</Empty> : (
                    <div className="x-list">{upcoming.map(b=>{
                      const isIn=b.daysLeft<0, isToday=b.daysLeft===0;
                      const tone=isIn?"warn":isToday?"bad":b.daysLeft<=3?"ok":"muted";
                      return (
                        <div key={b.id} className="x-li click" onClick={()=>setBkDetail(b)}>
                          <span style={{minWidth:64,display:"inline-flex",justifyContent:"center"}}><Pill tone={tone}>{isIn?"داخل الآن":isToday?"اليوم":b.daysLeft===1?"غداً":"بعد "+b.daysLeft+" يوم"}</Pill></span>
                          <div className="meta"><b>{b.guest}</b><span>{b.chalet+" · "+fn(b.date_from,b.date_to)+" ليلة"}</span></div>
                          <span className="amt"><SAR v={Number(b.price)}/></span>
                        </div>
                      );
                    })}</div>
                  )}
                </div>
              </div>

              {cStats.length>0&&(
                <div className="x-card">
                  <CardHead icon="home" title="أداء الشاليهات هذا الشهر"><button className="btn bo bsm" onClick={()=>setTab("chalets")}>إدارة الشاليهات</button></CardHead>
                  <div className="tbl-wrap"><table className="x-tbl">
                    <thead><tr><th>الشاليه</th><th>الإيرادات</th><th>الصافي</th><th>الإشغال</th><th>هدف الشهر</th><th>تنبيهات</th></tr></thead>
                    <tbody>{cStats.map(c=>{
                      const net=c.monthRev-c.monthExp;
                      const gp=c.goal>0?Math.round(net/c.goal*100):null;
                      const rentDue=scFixedExpenses.some(fx=>fx.chalet===c.name&&fx.active&&fx.category==="إيجار"&&(()=>{const i=nextDueInfo(fx);return !!i&&i.daysUntil<=RENT_REMINDER_DAYS;})());
                      return (
                        <tr key={c.id}>
                          <td className="strong">{c.name}</td>
                          <td><SAR v={c.monthRev} unit={false}/></td>
                          <td className={net<0?"x-neg":""}><SAR v={net} unit={false}/></td>
                          <td><div className="x-barrow"><Track pct={c.occ} tone={toneFor(c.occ)}/><span>{c.occ}%</span></div></td>
                          <td>{gp===null?<span className="x-muted">—</span>:<div className="x-barrow"><Track pct={gp} tone={toneFor(gp,100,60)}/><span dir="ltr">{gp}%</span></div>}</td>
                          <td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{c.mop>0&&<Pill tone="bad">{c.mop+" صيانة"}</Pill>}{rentDue&&<Pill tone="warn">إيجار</Pill>}{!c.mop&&!rentDue&&<Pill tone="ok">سليم</Pill>}</div></td>
                        </tr>
                      );
                    })}</tbody>
                  </table></div>
                </div>
              )}
            </div>
            );
          })()}

          {/* ── Chalets ── */}
          {tab==="chalets"&&(
            <ChaletsTab
              cStats={cStats}
              rooms={rooms}
              loading={loading}
              fixedExpenses={scFixedExpenses}
              onAdd={()=>setCMdl({...eC})}
              onEdit={c=>setCMdl({...c})}
              onDelete={dlC}
              onGoal={c=>setGoalMdl({id:c.id,name:c.name,goal:c.goal||""})}
              onQr={(chalet,chRooms)=>setQrMdl({chalet,rooms:chRooms})}
              onImgChange={async(id,dataUrl)=>{
                setChalets(p=>p.map(x=>x.id===id?{...x,img:dataUrl}:x));
                await db("chalets","PATCH",{img:dataUrl},id);
              }}
              onAddRent={chalet=>setFxMdl({chalet,name:"إيجار",amount:0,frequency:"monthly",category:"إيجار",active:true})}
              onEditRent={fx=>setFxMdl({...fx})}
              onAcknowledgeRent={acknowledgeRent}
            />
          )}

          {/* ── Bookings ── */}
          {tab==="bookings"&&(()=>{
            const scoped = bookings.filter(b=>
              (fch==="الكل"||b.chalet===fch)&&
              (!bkFrom||!b.date_to||b.date_to>=bkFrom)&&
              (!bkTo||!b.date_from||b.date_from<=bkTo)&&
              (isAdmin||isStaff||(isChaletMgr&&b.chalet===currentUser.chalet))
            );
            const visibleBookings = scoped.filter(b=>bkStatus==="الكل"||b.status===bkStatus);
            const vbNights = visibleBookings.reduce((s,b)=>s+fn(b.date_from,b.date_to),0);
            const earned = visibleBookings.filter(b=>b.status!=="cancelled");
            const vbRevenue = earned.reduce((s,b)=>s+Number(b.price),0);
            const avgBooking = earned.length?Math.round(vbRevenue/earned.length):0;
            const statusTone: Record<string,"ok"|"warn"|"bad"|"muted"> = {confirmed:"ok",pending:"warn",cancelled:"bad",completed:"muted"};
            const filtersOn = fch!=="الكل"||bkStatus!=="الكل"||!!bkFrom||!!bkTo;
            return (
            <div className="x-page">
              <PageHead title={bt("title")} sub={bkLang==="ar"?"التقويم فوق، وكل الحجوزات تحت":undefined}>
                <button className="btn bo" onClick={()=>setBkLang(l=>l==="ar"?"hi":"ar")}><Icon n="globe"/>{bkLang==="ar"?"हिंदी":"عربي"}</button>
                <button className="btn bo" onClick={()=>sendBookingsToWorkersHindi(visibleBookings)} disabled={visibleBookings.length===0}><Icon n="send"/>{bkLang==="ar"?"إرسال للعمال":"कर्मचारियों को भेजें"}</button>
                <button className="btn bp" onClick={()=>setBMdl({...eB})}><Icon n="plus"/>{bt("addBooking").replace(/^\+\s*/,"")}</button>
              </PageHead>

              <div className="x-kpis">
                <Kpi label={bkLang==="ar"?"عدد الحجوزات":"बुकिंग की संख्या"} value={visibleBookings.length.toLocaleString("en-US")}/>
                <Kpi label={bkLang==="ar"?"الليالي":"रातें"} value={vbNights.toLocaleString("en-US")}/>
                <Kpi label={bkLang==="ar"?"الإجمالي":"कुल"} value={<SAR v={vbRevenue}/>} sub={bkLang==="ar"?"بدون الملغي":undefined}/>
                <Kpi label={bkLang==="ar"?"متوسط الحجز":"औसत"} value={<SAR v={avgBooking}/>}/>
              </div>

              <BookingCalendar
                bookings={isChaletMgr?bookings.filter(b=>b.chalet===currentUser.chalet):bookings}
                names={isChaletMgr?[currentUser.chalet]:names}
                onSelectBooking={b=>setBkDetail(b)}
                onAddAt={(chalet,dateISO)=>setBMdl({...eB,chalet,date_from:dateISO,date_to:dateISO})}
              />

              {(isAdmin||isStaff)&&<BlockedGuestsBanner guests={blockedGuests} onUnblock={unblockGuest}/>}

              <div className="x-card">
                <div className="x-card-h">
                  <Seg label={bt("status")} value={bkStatus} onChange={v=>setBkStatus(v)}
                    options={[{v:"الكل",l:bt("allStatuses"),c:scoped.length},...Object.entries(STATUS).map(([k,v])=>({v:k,l:bt(STATUS_LABEL_KEY[k]||"")||v.label,c:scoped.filter(b=>b.status===k).length}))]}/>
                  <div className="x-toolbar">
                    {!isChaletMgr&&(
                      <select className="x-select" aria-label={bt("chalet")} value={fch} onChange={e=>setFch(e.target.value)}>
                        <option value="الكل">{bt("allChalets")}</option>
                        {names.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    <input className="x-select" type="date" aria-label={bt("from")} value={bkFrom} onChange={e=>setBkFrom(e.target.value)}/>
                    <input className="x-select" type="date" aria-label={bt("to")} value={bkTo} onChange={e=>setBkTo(e.target.value)}/>
                    <button className="btn bo bsm" onClick={()=>{setBkFrom(monthStart());setBkTo(monthEnd());}}>{bt("thisMonth")}</button>
                    {filtersOn&&<button className="btn bo bsm" onClick={()=>{setFch("الكل");setBkStatus("الكل");setBkFrom("");setBkTo("");}}>{bt("showAll")}</button>}
                  </div>
                </div>
                {visibleBookings.length===0 ? (
                  <Empty>{bkLang==="ar"?"لا توجد حجوزات مطابقة":"कोई मेल खाती बुकिंग नहीं"}</Empty>
                ) : (
                  <div className="tbl-wrap"><table className="x-tbl">
                    <thead><tr>
                      <th>{bt("guest")}</th><th>{bt("chalet")}</th><th>{bt("period")}</th><th>{bt("nights")}</th><th>{bt("price")}</th><th>{bt("status")}</th><th className="end"><span className="x-hide-sm">{bt("actions")}</span></th>
                    </tr></thead>
                    <tbody>{visibleBookings.map(b=>{
                      const sc=STATUS[b.status]||{label:b.status};
                      const scLabel=bt(STATUS_LABEL_KEY[b.status]||"")||sc.label;
                      return (
                        <tr key={b.id} style={{cursor:"pointer"}} onClick={()=>setBkDetail(b)}>
                          <td>
                            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                              <b>{b.guest}</b>
                              {b.pre_arrival_sent&&<Pill tone="info">أُرسلت الرسالة</Pill>}
                              {isGuestBlocked(b.phone)&&<Pill tone="bad">{bt("blocked")}</Pill>}
                            </div>
                            <div className="x-mono x-muted" style={{fontSize:13,textAlign:"right"}}>{b.phone||"-"}</div>
                          </td>
                          <td>{b.chalet}</td>
                          <td>{fd(b.date_from)}<div className="x-muted" style={{fontSize:13}}>{"إلى "+fd(b.date_to)}</div></td>
                          <td>{fn(b.date_from,b.date_to)}</td>
                          <td className="strong"><SAR v={Number(b.price)}/></td>
                          <td><Pill tone={statusTone[b.status]||"muted"} dot>{scLabel}</Pill></td>
                          <td className="end" onClick={e=>e.stopPropagation()}>
                            <RowActionsMenu actions={[
                              {label:bt("edit"), onClick:e=>{e.stopPropagation();setBMdl({...b})}},
                              {label:bt("preArrival"), onClick:e=>{e.stopPropagation();setPreArrMdl({booking:b});}},
                              {label:bt("whatsappCheckin"), onClick:e=>{e.stopPropagation();const url=`https://reetam-chalets.vercel.app?guest=1&b=${b.id}&m=checkin`;const msg=`مرحباً ${b.guest} 👋%0aأهلاً بك في ${b.chalet}%0a%0aرابط تسجيل الدخول:%0a${encodeURIComponent(url)}`;const phone=b.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");}},
                              {label:bt("sendReview"), onClick:e=>{e.stopPropagation();const url=`https://reetam-chalets.vercel.app?guest=1&b=${b.id}&m=review`;const msg=`${b.guest} 😊%0aرابط التقييم:%0a${encodeURIComponent(url)}`;const phone=b.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");}},
                              ...(isCheckedOut(b)?[{label:bt("rateGuest"), onClick:(e:React.MouseEvent)=>{e.stopPropagation();setGrMdl({booking:b,rating:0,note:""});}}]:[]),
                              {label:isGuestBlocked(b.phone)?bt("unblock"):bt("block"), color:"#A63A2A", onClick:e=>{e.stopPropagation();if(isGuestBlocked(b.phone))unblockGuest(b.phone);else setBlockMdl({booking:b,reason:""});}},
                              {label:bt("delete"), color:"#A63A2A", onClick:async e=>{e.stopPropagation();if(window.confirm(bt("deleteConfirm"))){await db("bookings","DELETE",null,b.id);await loadAll();}}},
                            ]}/>
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table></div>
                )}
              </div>
            </div>
            );
          })()}

          {/* ── Finance ── */}
          {tab==="finance"&&(isAdmin||isStaff||isChaletMgr)&&(
            <FinancialTab
              bookings={scBookings} maintenance={scMaint} wallet={scWallet} names={scNames}
              expenses={scExpenses}
              fixedExpenses={scFixedExpenses}
              lockedChalet={isChaletMgr?currentUser.chalet:undefined}
              onAddExpense={()=>setExMdl({chalet:(isChaletMgr?currentUser.chalet:names[0])||"",category:"إيجار",amount:"",note:"",expense_date:td()})}
              onAddFixedExpense={()=>setFxMdl({chalet:(isChaletMgr?currentUser.chalet:names[0])||"",name:"",amount:0,frequency:"monthly",category:"إيجار",active:true})}
              onPayFixedExpense={payFixedExpense}
              onEdit={t=>setWMdl({...t})}
              onReload={loadAll}
            />
          )}

          {/* ── Investors ── */}
          {tab==="investors"&&isAdmin&&(()=>{
            const totalNet=names.reduce((s,n)=>s+((chaletNetForPeriod[n]?.net)||0),0);
            const partnerNames=new Set(investors.map(iv=>iv.name));
            const incomplete=names.filter(n=>{const l=investors.filter(iv=>iv.chalet===n);return l.length>0&&l.reduce((s,iv)=>s+Number(iv.percentage||0),0)!==100;}).length;
            return (
            <div className="x-page">
              <PageHead title="المستثمرون" sub="حصة كل شريك من صافي ربح الشاليه (الإيرادات ناقص الصيانة)">
                <Seg label="الفترة" value={invPeriod} onChange={v=>setInvPeriod(v)} options={[{v:"this_month",l:"هذا الشهر"},{v:"last_month",l:"الشهر الماضي"},{v:"this_year",l:"هذا العام"}]}/>
              </PageHead>
              <div className="x-kpis">
                <Kpi hero label={"الأرباح القابلة للتوزيع · "+invPeriodLabel} value={<SAR v={totalNet}/>}/>
                <Kpi label="عدد الشركاء" value={partnerNames.size} sub={"في "+names.length+" شاليه"}/>
                <Kpi label="شاليهات نسبها غير مكتملة" value={incomplete} tone={incomplete?"neg":"pos"} sub={incomplete?"مجموع النسب لا يساوي 100%":"كل النسب مكتملة"}/>
              </div>
              {names.length===0 && <div className="x-card"><Empty>أضف شاليهات أولاً</Empty></div>}
              {names.map(n=>{
                const chInvestors = investors.filter(iv=>iv.chalet===n);
                const totalPct = chInvestors.reduce((s,iv)=>s+Number(iv.percentage||0),0);
                const stats = chaletNetForPeriod[n] || {rev:0,mex:0,net:0};
                return (
                  <div key={n} className="x-card">
                    <CardHead icon="home" title={n} sub={<>صافي {invPeriodLabel}: <b className={stats.net<0?"x-neg":"x-pos"}><SAR v={stats.net}/></b></>}>
                      {chInvestors.length>0&&<Pill tone={totalPct===100?"ok":"warn"}>{"مجموع النسب "+totalPct+"%"}</Pill>}
                      <button className="btn bo bsm" onClick={()=>setInvMdl({chalet:n,name:"",phone:"",percentage:0,note:""})}><Icon n="plus" s={15}/>شريك</button>
                    </CardHead>
                    {chInvestors.length===0
                      ? <Empty>لا يوجد شركاء لهذا الشاليه</Empty>
                      : <div className="tbl-wrap"><table className="x-tbl">
                          <thead><tr><th>الشريك</th><th>النسبة</th><th>نصيبه</th><th className="x-hide-sm">الجوال</th><th className="end"></th></tr></thead>
                          <tbody>
                            {chInvestors.map(iv=>{
                              const share = Math.round(stats.net * (Number(iv.percentage)||0) / 100);
                              return (
                                <tr key={iv.id}>
                                  <td className="strong">{iv.name}</td>
                                  <td><div className="x-barrow"><Track pct={Number(iv.percentage)||0}/><span>{Number(iv.percentage)+"%"}</span></div></td>
                                  <td className={"strong "+(share<0?"x-neg":"")}><SAR v={share}/></td>
                                  <td className="x-mono x-muted x-hide-sm">{iv.phone||"-"}</td>
                                  <td className="end">
                                    <div style={{display:"inline-flex",gap:6}}>
                                      <button className="btn bsm bshare" onClick={()=>{
                                        const lines=[
                                          `📊 *تقرير حصتك — ${n}*`,
                                          `🗓️ الفترة: ${invPeriodLabel}`,
                                          ``,
                                          `💵 إيرادات الشاليه: ${stats.rev.toLocaleString("en-US")} ر`,
                                          `🔧 تكاليف الصيانة: ${stats.mex.toLocaleString("en-US")} ر`,
                                          `📈 صافي ربح الشاليه: ${stats.net.toLocaleString("en-US")} ر`,
                                          `🤝 نسبتك: ${Number(iv.percentage)}%`,
                                          ``,
                                          `*نصيبك: ${share.toLocaleString("en-US")} ر*`,
                                          ``,
                                          `_تقرير آلي من نظام إدارة ريتام_`,
                                        ];
                                        const phone = iv.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");
                                        const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join("\n"))}`;
                                        window.open(url,"_blank");
                                      }}><Icon n="send" s={15}/>إرسال التقرير</button>
                                      <button className="btn bo bsm" aria-label="تعديل" onClick={()=>setInvMdl({...iv})}><Icon n="edit" s={15}/></button>
                                      <button className="btn bd bsm" aria-label="حذف" onClick={async()=>{if(window.confirm("حذف "+iv.name+"؟")){await db("investors","DELETE",null,iv.id);await loadAll();}}}><Icon n="trash" s={15}/></button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table></div>
                    }
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* ── Maintenance ── */}
          {tab==="maintenance"&&(()=>{
            const scoped=maint.filter(m=>(fch==="الكل"||m.chalet===fch)&&(isAdmin||isStaff||(isChaletMgr&&m.chalet===currentUser.chalet)));
            const cnt=(k:string)=>k==="all"?scoped.length:scoped.filter(m=>m.status===k).length;
            const list=scoped.filter(m=>mStatus==="all"||m.status===mStatus).sort((a,b)=>{const p={عالي:0,متوسط:1,منخفض:2};const s={open:0,in_progress:1,done:2};return(p[a.priority]??1)-(p[b.priority]??1)||(s[a.status]??1)-(s[b.status]??1);});
            const ym=td().slice(0,7);
            const monthCost=scoped.filter(m=>m.cost&&m.maint_date?.startsWith(ym)).reduce((s,m)=>s+Number(m.cost),0);
            const highOpen=scoped.filter(m=>m.status==="open"&&m.priority==="عالي").length;
            const prTone=(p:string)=>p==="عالي"?"bad":p==="متوسط"?"warn":"muted";
            const stTone=(s:string)=>s==="open"?"bad":s==="in_progress"?"warn":"ok";
            return (
            <div className="x-page">
              <PageHead title="الصيانة" sub="الطلبات مرتبة حسب الأولوية">
                <button className="btn bp" onClick={()=>{setMOld(null);setMMdl({...eM});}}><Icon n="plus"/>طلب صيانة</button>
              </PageHead>
              <div className="x-kpis">
                <Kpi label="مفتوح" value={cnt("open")} tone={cnt("open")?"neg":undefined} sub={highOpen?highOpen+" بأولوية عالية":"لا يوجد طلب عاجل"}/>
                <Kpi label="قيد التنفيذ" value={cnt("in_progress")}/>
                <Kpi label="تكاليف هذا الشهر" value={<SAR v={monthCost}/>}/>
                <Kpi label="إجمالي التكاليف" value={<SAR v={scoped.filter(m=>m.cost).reduce((s,m)=>s+Number(m.cost),0)}/>} sub="منذ البداية"/>
              </div>
              <div className="x-card">
                <div className="x-card-h">
                  <Seg label="الحالة" value={mStatus} onChange={v=>setMStatus(v)} options={[{v:"open",l:"مفتوح",c:cnt("open")},{v:"in_progress",l:"قيد التنفيذ",c:cnt("in_progress")},{v:"done",l:"منتهي",c:cnt("done")},{v:"all",l:"الكل",c:cnt("all")}]}/>
                  {!isChaletMgr&&(
                    <select className="x-select" aria-label="الشاليه" value={fch} onChange={e=>setFch(e.target.value)}>
                      <option value="الكل">كل الشاليهات</option>
                      {cStats.map(c=><option key={c.name} value={c.name}>{c.name+(c.mop?" ("+c.mop+" مفتوح)":"")}</option>)}
                    </select>
                  )}
                </div>
                {list.length===0 ? <Empty>لا توجد طلبات بهذه الحالة</Empty> : (
                  <div className="x-list">{list.map(m=>(
                    <div key={m.id} className="x-li">
                      <div className={"x-ic "+prTone(m.priority)}><Icon n="wrench"/></div>
                      <div className="meta"><b>{m.issue}</b><span>{m.chalet+" · "+fd(m.maint_date)+(m.req?" · بلّغ عنه "+m.req:"")}</span></div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                        <Pill tone={prTone(m.priority)}>{"أولوية "+m.priority}</Pill>
                        <Pill tone={stTone(m.status)} dot>{MS[m.status]?.label||m.status}</Pill>
                        {m.image&&<img src={m.image} alt="صورة المشكلة" onClick={()=>window.open(m.image,"_blank")} style={{width:36,height:36,objectFit:"cover",borderRadius:8,cursor:"pointer",border:"1px solid var(--border)"}}/>}
                      </div>
                      <span className="amt">{m.cost?<SAR v={Number(m.cost)}/>:<span className="x-muted">—</span>}</span>
                      <div className="acts">
                        <button className="btn bo bsm" onClick={()=>{setMOld({...m});setMMdl({...m});}}><Icon n="edit" s={15}/>{m.status==="done"?"تعديل":"تحديث الحالة"}</button>
                        <button className="btn bd bsm" aria-label="حذف" onClick={async()=>{if(!window.confirm("حذف طلب الصيانة؟"))return;await db("maintenance","DELETE",null,m.id);await loadAll();}}><Icon n="trash" s={15}/></button>
                      </div>
                    </div>
                  ))}</div>
                )}
              </div>
            </div>
            );
          })()}

          {/* ── Wallets: التأمين + النظافة ── */}
          {tab==="wallets"&&isAdmin&&(()=>{
            const insIn=wallet.filter(t=>t.type==="إيداع").reduce((s,t)=>s+t.amount,0), insOut=wallet.filter(t=>t.type!=="إيداع").reduce((s,t)=>s+t.amount,0);
            const clIn=cleaning.filter(t=>t.type==="إيداع").reduce((s,t)=>s+t.amount,0), clOut=cleaning.filter(t=>t.type!=="إيداع").reduce((s,t)=>s+t.amount,0);
            const clBal=(n:string)=>cleaning.filter(t=>t.chalet===n).reduce((s,t)=>t.type==="إيداع"?s+t.amount:s-t.amount,0);
            const lowIns=cStats.filter(c=>c.ins<500);
            const ym=td().slice(0,7);
            const clExpMonth=clExp.filter(e=>e.expense_date?.startsWith(ym)).reduce((s,e)=>s+Number(e.amount),0);
            const ledger=walletTab==="ins"?[...wallet].reverse():[...cleaning].reverse();
            return (
            <div className="x-page">
              <PageHead title="المحافظ" sub="محفظة التأمين ومحفظة النظافة">
                <button className="btn bo" onClick={()=>setClExpMdl({chalet:names[0]||"",category:"رواتب",amount:"",note:"",expense_date:td()})}><Icon n="receipt"/>التزام نظافة</button>
                <button className="btn bo" onClick={()=>setClnMdl(true)}><Icon n="plus"/>رصيد نظافة</button>
                <button className="btn bp" onClick={()=>setIMdl(true)}><Icon n="plus"/>إضافة تأمين</button>
              </PageHead>
              <div className="x-kpis">
                <Kpi hero label="محفظة التأمين" value={<SAR v={walletBal}/>} sub={"إيداعات "+insIn.toLocaleString("en-US")+" · صرف "+insOut.toLocaleString("en-US")}/>
                <Kpi label="محفظة النظافة" value={<SAR v={cleaningBal}/>} sub={"إيداعات "+clIn.toLocaleString("en-US")+" · صرف "+clOut.toLocaleString("en-US")}/>
                <Kpi label="التزامات النظافة هذا الشهر" value={<SAR v={clExpMonth}/>}/>
                <Kpi label="تأمين منخفض" value={<>{lowIns.length}<small> شاليه</small></>} tone={lowIns.length?"neg":"pos"} sub={lowIns.length?lowIns.map(c=>c.name).join("، "):"كل الأرصدة فوق 500 ر.س"}/>
              </div>
              <div className="x-card">
                <CardHead icon="home" title="الرصيد لكل شاليه"/>
                <div className="tbl-wrap"><table className="x-tbl">
                  <thead><tr><th>الشاليه</th><th>التأمين</th><th>النظافة</th><th>طلبات الصيانة</th><th>الحالة</th></tr></thead>
                  <tbody>{cStats.map(c=>(
                    <tr key={c.id}><td className="strong">{c.name}</td><td className={c.ins<500?"x-neg strong":""}><SAR v={c.ins} unit={false}/></td><td><SAR v={clBal(c.name)} unit={false}/></td><td>{c.mtot}</td><td>{c.ins<500?<Pill tone="bad">تأمين منخفض</Pill>:<Pill tone="ok">جيد</Pill>}</td></tr>
                  ))}</tbody>
                </table></div>
              </div>
              <div className="x-card">
                <div className="x-card-h">
                  <h2><Icon n="receipt"/>سجل الحركات</h2>
                  <Seg label="المحفظة" value={walletTab} onChange={v=>setWalletTab(v)} options={[{v:"ins",l:"التأمين",c:wallet.length},{v:"cln",l:"النظافة",c:cleaning.length},{v:"obl",l:"التزامات النظافة",c:clExp.length}]}/>
                </div>
                {walletTab!=="obl" ? (ledger.length===0?<Empty>لا توجد حركات</Empty>:
                  <div className="tbl-wrap"><table className="x-tbl">
                    <thead><tr><th>التاريخ</th><th>الشاليه</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th className="end"></th></tr></thead>
                    <tbody>{ledger.map((t,i)=>(
                      <tr key={t.id||i}>
                        <td>{fd(t.trans_date)}</td><td className="strong">{t.chalet}</td>
                        <td><Pill tone={t.type==="إيداع"?"ok":"bad"}>{t.type}</Pill></td>
                        <td className={"strong "+(t.type==="إيداع"?"x-pos":"x-neg")}><span dir="ltr" style={{unicodeBidi:"isolate"}}>{(t.type==="إيداع"?"+":"−")+t.amount.toLocaleString("en-US")}</span></td>
                        <td className="x-muted">{t.note||"-"}</td>
                        <td className="end"><div style={{display:"inline-flex",gap:6}}>
                          <button className="btn bo bsm" aria-label="تعديل" onClick={()=>walletTab==="ins"?setWMdl({...t}):setClMdl({...t})}><Icon n="edit" s={15}/></button>
                          <button className="btn bd bsm" aria-label="حذف" onClick={async()=>{if(window.confirm("حذف هذا الصف؟")){await db(walletTab==="ins"?"wallet":"cleaning","DELETE",null,t.id);await loadAll();}}}><Icon n="trash" s={15}/></button>
                        </div></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                ) : (clExp.length===0?<Empty>لا توجد التزامات</Empty>:
                  <div className="tbl-wrap"><table className="x-tbl">
                    <thead><tr><th>التاريخ</th><th>الشاليه</th><th>الفئة</th><th>المبلغ</th><th>ملاحظة</th><th className="end"></th></tr></thead>
                    <tbody>{[...clExp].reverse().map((e,i)=>(
                      <tr key={e.id||i}>
                        <td>{fd(e.expense_date)}</td><td className="strong">{e.chalet}</td><td><Pill tone="muted">{e.category}</Pill></td>
                        <td className="strong x-neg"><span dir="ltr" style={{unicodeBidi:"isolate"}}>{"−"+Number(e.amount).toLocaleString("en-US")}</span></td>
                        <td className="x-muted">{e.note||"-"}</td>
                        <td className="end"><div style={{display:"inline-flex",gap:6}}>
                          <button className="btn bo bsm" aria-label="تعديل" onClick={()=>setClExpMdl({...e})}><Icon n="edit" s={15}/></button>
                          <button className="btn bd bsm" aria-label="حذف" onClick={async()=>{if(window.confirm("حذف؟")){await db("cleaning_expenses","DELETE",null,e.id);await loadAll();}}}><Icon n="trash" s={15}/></button>
                        </div></td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr><td colSpan={3}>إجمالي الالتزامات</td><td className="x-neg"><SAR v={clExp.reduce((s,e)=>s+Number(e.amount),0)}/></td><td colSpan={2}/></tr></tfoot>
                  </table></div>
                )}
              </div>
            </div>
            );
          })()}

          {/* ── Cleaning: المهام والفريق ── */}
          {tab==="cleaning"&&(()=>{
            const month=new Date().toISOString().slice(0,7);
            const chNames=clSelCh?[clSelCh]:[...new Set(clTasks.map(t=>t.chalet))];
            const activeTasks=clTasks.filter(t=>t.active!==false&&chNames.includes(t.chalet));
            const monthLogs=clLogs.filter(l=>l.log_date?.startsWith(month));
            const doneCnt=activeTasks.filter(t=>monthLogs.some(l=>l.task_id===t.id&&l.supervisor_ok)).length;
            const waitCnt=activeTasks.filter(t=>monthLogs.some(l=>l.task_id===t.id&&(l.worker_done||l.status==="done"))&&!monthLogs.some(l=>l.task_id===t.id&&l.supervisor_ok)).length;
            const pctAll=activeTasks.length?Math.round(doneCnt/activeTasks.length*100):0;
            return (
            <div className="x-page">
              <PageHead title="النظافة" sub="مهام هذا الشهر وفريق العمل">
                <select className="x-select" aria-label="الشاليه" value={clSelCh||""} onChange={e=>setClSelCh(e.target.value||null)}>
                  <option value="">كل الشاليهات</option>
                  {names.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <button className="btn bo" onClick={()=>setCwMdl({name:"",phone:"",language:"hi",active:true})}><Icon n="users"/>إضافة عامل</button>
                <button className="btn bp" onClick={()=>setClTaskMdl({chalet:names[0]||"",title:"",frequency:"أسبوعي",category:"مسبح",assigned_to:"",active:true})}><Icon n="plus"/>إضافة مهمة</button>
              </PageHead>
              <div className="x-kpis">
                <Kpi label="إنجاز المشرف هذا الشهر" value={<>{pctAll}<small>%</small></>} sub={doneCnt+" من "+activeTasks.length+" مهام مؤكدة"}><Track pct={pctAll} tone={toneFor(pctAll,100,50)}/></Kpi>
                <Kpi label="بانتظار تأكيدك" value={waitCnt} sub="أنجزها العامل ولم تُراجع"/>
                <Kpi label="رصيد محفظة النظافة" value={<SAR v={cleaningBal}/>} sub={isAdmin?<button className="x-back" style={{minHeight:0}} onClick={()=>{setWalletTab("cln");setTab("wallets");}}>عرض السجل</button>:undefined}/>
              </div>

              {chNames.map(chName=>{
                const tasks = clTasks.filter(t=>t.chalet===chName&&t.active!==false);
                if(!tasks.length) return null;
                const logs  = clLogs.filter(l=>l.chalet===chName&&l.log_date?.startsWith(month));
                const done  = tasks.filter(t=>logs.some(l=>l.task_id===t.id&&l.supervisor_ok));
                const workerDone = tasks.filter(t=>logs.some(l=>l.task_id===t.id));
                const pct   = tasks.length>0?Math.round(done.length/tasks.length*100):0;
                return (
                  <div key={chName} className="x-card">
                    <CardHead icon="broom" title={chName} sub={"العامل "+workerDone.length+"/"+tasks.length+" · المشرف "+done.length+"/"+tasks.length}>
                      <div className="x-barrow" style={{minWidth:150}}><Track pct={pct} tone={toneFor(pct,100,50)}/><b className="x-num">{pct+"%"}</b></div>
                    </CardHead>
                    <div className="tbl-wrap"><table className="x-tbl">
                      <thead><tr><th>المهمة</th><th>التكرار</th><th>العامل</th><th>المشرف</th><th className="end"></th></tr></thead>
                      <tbody>
                        {tasks.map(task=>{
                          const log = logs.find(l=>l.task_id===task.id);
                          const isDone = log?.supervisor_ok||log?.status==="done";
                          const workerOk = log?.worker_done||log?.status==="done";
                          return (
                            <tr key={task.id}>
                              <td className="strong">{task.title}<div className="x-muted" style={{fontSize:13,fontWeight:400}}>{task.category}</div></td>
                              <td className="x-muted">{task.frequency}</td>
                              <td>{workerOk?<Pill tone="ok">أنجز</Pill>:log?.status==="sent"?<Pill tone="info">أُرسلت</Pill>:<Pill tone="muted">لم يبدأ</Pill>}</td>
                              <td>{isDone
                                ? <Pill tone="ok">مؤكد</Pill>
                                : <ActBtn primary={!!workerOk} onClick={async()=>{
                                    if(log){await db("cleaning_logs","PATCH",{supervisor_ok:true,status:"done"},log.id);}
                                    else{await db("cleaning_logs","POST",{task_id:task.id,chalet:chName,log_date:td(),worker_done:true,supervisor_ok:true,status:"done"});}
                                    await loadAll();
                                  }}>تأكيد</ActBtn>}
                              </td>
                              <td className="end">
                                <div style={{display:"inline-flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                                  {!isDone&&cleanWorkers.filter(w=>w.active).length>0&&(
                                    <SendTaskBtn task={task} workers={cleanWorkers.filter(w=>w.active)} log={log||null} onSent={loadAll}/>
                                  )}
                                  <button className="btn bo bsm" aria-label="تعديل" onClick={()=>setClTaskMdl({...task})}><Icon n="edit" s={15}/></button>
                                  <button className="btn bd bsm" aria-label="حذف" onClick={async()=>{if(window.confirm("حذف المهمة؟")){await db("cleaning_tasks","DELETE",null,task.id);await loadAll();}}}><Icon n="trash" s={15}/></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table></div>
                  </div>
                );
              })}
              {clTasks.length===0&&<div className="x-card"><Empty>لا توجد مهام بعد، أضف مهام النظافة لكل شاليه</Empty></div>}

              <div className="x-card">
                <CardHead icon="users" title="فريق النظافة"/>
                {cleanWorkers.length===0 ? <Empty>لا يوجد عمال، أضف فريق النظافة</Empty> : (
                  <div className="x-list">{cleanWorkers.map(w=>(
                    <div key={w.id} className="x-li">
                      <div className="x-avatar">{(w.name||"؟").charAt(0)}</div>
                      <div className="meta"><b>{w.name}</b><span className="x-mono" style={{textAlign:"right"}}>{w.phone}</span></div>
                      <Pill tone="muted">{w.language==="hi"?"هندية":w.language==="ar"?"عربية":"إنجليزية"}</Pill>
                      <Pill tone={w.active?"ok":"muted"} dot>{w.active?"نشط":"موقف"}</Pill>
                      <div className="acts">
                        <ActBtn onClick={async()=>{await db("cleaning_workers","PATCH",{active:!w.active},w.id);await loadAll();}}>{w.active?"إيقاف":"تفعيل"}</ActBtn>
                        <button className="btn bo bsm" aria-label="تعديل" onClick={()=>setCwMdl({...w})}><Icon n="edit" s={15}/></button>
                        <button className="btn bd bsm" aria-label="حذف" onClick={async()=>{if(window.confirm("حذف العامل؟")){await db("cleaning_workers","DELETE",null,w.id);await loadAll();}}}><Icon n="trash" s={15}/></button>
                      </div>
                    </div>
                  ))}</div>
                )}
              </div>
            </div>
            );
          })()}

          {/* ── Smart Control ── */}
          {tab==="smart"&&(()=>{
            const allowed=chalets.filter(c=>isAdmin||isStaff||(isChaletMgr&&c.name===currentUser.chalet));
            const cur=(selChalet&&allowed.find(c=>c.id===selChalet.id))||allowed[0];
            if(!cur) return <div className="x-page"><PageHead title="التحكم الذكي"/><div className="x-card"><Empty>أضف شاليهات أولاً</Empty></div></div>;
            const chRooms=rooms.filter(r=>r.chalet===cur.name);
            const onCount=chRooms.filter(r=>r._acOn).length;
            return (
            <div className="x-page">
              <PageHead title="التحكم الذكي" sub={onCount+" من "+chRooms.length+" مكيفات تعمل في "+cur.name}>
                <ActBtn onClick={async()=>{for(const r of chRooms)await svAC(cur.name,"ac_on",false,r.id);}}>إيقاف الكل</ActBtn>
                <ActBtn primary onClick={async()=>{for(const r of chRooms)await svAC(cur.name,"ac_on",true,r.id);}}>تشغيل الكل</ActBtn>
                <button className="btn bo bsm" onClick={()=>setAddRoomMdl(cur.name)}><Icon n="plus" s={15}/>غرفة</button>
              </PageHead>
              {allowed.length>1&&(
                <Seg label="الشاليه" value={cur.id} onChange={id=>setSelChalet(allowed.find(c=>c.id===id)||null)}
                  options={allowed.map(c=>({v:c.id,l:c.name,c:rooms.filter(r=>r.chalet===c.name&&r._acOn).length+"/"+rooms.filter(r=>r.chalet===c.name).length}))}/>
              )}
              {chRooms.length===0 ? <div className="x-card"><Empty>لا توجد غرف لهذا الشاليه، أضف غرفة لبدء التحكم بمكيفها</Empty></div> : (
                <div className="x-rooms">
                  {chRooms.map(room=>{
                    const isOn=room._acOn||false;const temp=room._acTemp||22;const mode=room._acMode||"cool";const speed=room._acSpeed||"auto";
                    return (
                      <div key={room.id} className={"x-card x-room"+(isOn?"":" off")}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <b style={{fontSize:16}}>{room.name}</b>
                          <Pill tone={isOn?"ok":"muted"} dot>{isOn?"يعمل":"مطفأ"}</Pill>
                        </div>
                        <div className="x-temp">
                          <button className="btn bo" style={{width:44,padding:0}} aria-label="خفض الحرارة" disabled={!isOn} onClick={async()=>{const t=Math.max(16,temp-1);setRooms(p=>p.map(x=>x.id===room.id?{...x,_acTemp:t}:x));await svAC(cur.name,"ac_temp",t,room.id);}}>−</button>
                          <span className="deg">{temp}°</span>
                          <button className="btn bo" style={{width:44,padding:0}} aria-label="رفع الحرارة" disabled={!isOn} onClick={async()=>{const t=Math.min(30,temp+1);setRooms(p=>p.map(x=>x.id===room.id?{...x,_acTemp:t}:x));await svAC(cur.name,"ac_temp",t,room.id);}}>+</button>
                        </div>
                        <div>
                          <div className="x-lbl">الوضع</div>
                          <div className="x-seg">{[{id:"cool",l:"تبريد"},{id:"heat",l:"تدفئة"},{id:"fan",l:"هواء"},{id:"auto",l:"تلقائي"}].map(m=>(
                            <button key={m.id} type="button" disabled={!isOn} aria-pressed={isOn&&mode===m.id} onClick={async()=>{setRooms(p=>p.map(x=>x.id===room.id?{...x,_acMode:m.id}:x));await svAC(cur.name,"ac_mode",m.id,room.id);}}>{m.l}</button>
                          ))}</div>
                        </div>
                        <div>
                          <div className="x-lbl">المروحة</div>
                          <div className="x-seg">{[{id:"auto",l:"تلقائي"},{id:"low",l:"بطيء"},{id:"med",l:"متوسط"},{id:"high",l:"سريع"}].map(sp=>(
                            <button key={sp.id} type="button" disabled={!isOn} aria-pressed={isOn&&speed===sp.id} onClick={async()=>{setRooms(p=>p.map(x=>x.id===room.id?{...x,_acSpeed:sp.id}:x));await svAC(cur.name,"ac_speed",sp.id,room.id);}}>{sp.l}</button>
                          ))}</div>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button className={"btn "+(isOn?"bo":"bp")} style={{flex:1}} onClick={async()=>{const newOn=!isOn;setRooms(p=>p.map(x=>x.id===room.id?{...x,_acOn:newOn}:x));await svAC(cur.name,"ac_on",newOn,room.id);}}><Icon n="power"/>{isOn?"إيقاف":"تشغيل"}</button>
                          <button className="btn bd" style={{width:42,padding:0}} aria-label={"حذف "+room.name} onClick={async()=>{if(!window.confirm("حذف غرفة "+room.name+"؟"))return;await db("rooms","DELETE",null,room.id);await loadAll();}}><Icon n="trash" s={16}/></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })()}

          {/* ── Reviews ── */}
          {/* ── Loyalty + Reviews ── */}
          {tab==="loyalty"&&(
            <LoyaltyAdminPage
              cards={loyaltyCards}
              reviews={(isAdmin||isStaff)?reviews:reviews.filter(r=>isChaletMgr&&r.chalet===currentUser.chalet)}
              onReload={loadAll}
            />
          )}

          {/* ── Settings ── */}
          {tab==="settings"&&isAdmin&&(
            <SettingsTab
              users={users}
              onAdd={()=>setUMdl({name:"",username:"",email:"",password:"",role:"staff",chalet:""})}
              onEdit={u=>setUMdl({...u})}
              onReload={loadAll}
            />
          )}

        </main>
      </div>



      {/* ── Modals ── */}
      {coMdl&&<CheckoutMdl booking={coMdl}/>}

      {cMdl&&(
        <Mdl onClose={()=>setCMdl(null)} title={cMdl.id?"تعديل الشاليه":"إضافة شاليه جديد"}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"span 2"}}><label className="lbl">اسم الشاليه</label><input className="inp" value={cMdl.name} onChange={e=>setCMdl(p=>({...p,name:e.target.value}))} placeholder="مثال: شاليه الياسمين"/></div>
            <div><label className="lbl">الموقع</label><input className="inp" value={cMdl.loc||""} onChange={e=>setCMdl(p=>({...p,loc:e.target.value}))} placeholder="الرياض"/></div>
            <div><label className="lbl">السعة</label><input className="inp" type="number" value={cMdl.cap||""} onChange={e=>setCMdl(p=>({...p,cap:e.target.value}))} placeholder="10"/></div>
            <div><label className="lbl">سعر الليلة</label><input className="inp" type="number" value={cMdl.price||""} onChange={e=>setCMdl(p=>({...p,price:e.target.value}))} placeholder="500"/></div>
            <div><label className="lbl">سعر الويكند</label><input className="inp" type="number" value={cMdl.wprice||""} onChange={e=>setCMdl(p=>({...p,wprice:e.target.value}))} placeholder="800"/></div>
            <div><label className="lbl">رصيد التأمين الافتتاحي</label><input className="inp" type="number" value={cMdl.ins||""} onChange={e=>setCMdl(p=>({...p,ins:e.target.value}))} placeholder="2000"/></div>
            <div><label className="lbl">الحالة</label><select className="inp" value={cMdl.st||"active"} onChange={e=>setCMdl(p=>({...p,st:e.target.value}))}><option value="active">نشط</option><option value="inactive">موقف</option></select></div>
            <div><label className="lbl">تاريخ الافتتاح</label><input className="inp" type="month" value={cMdl.open_date||""} onChange={e=>setCMdl(p=>({...p,open_date:e.target.value}))}/></div>
            <div><label className="lbl">الإيراد السابق (ريال)</label><input className="inp" type="number" value={cMdl.prev_revenue||""} onChange={e=>setCMdl(p=>({...p,prev_revenue:e.target.value}))} placeholder="0"/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">الوصف</label><textarea className="inp" rows={2} value={cMdl.description||""} onChange={e=>setCMdl(p=>({...p,description:e.target.value}))} placeholder="وصف مختصر..."/></div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">📍 رابط الموقع (خرائط جوجل)</label>
              <input className="inp" dir="ltr" value={cMdl.map_url||""} onChange={e=>setCMdl(p=>({...p,map_url:e.target.value}))} placeholder="https://maps.app.goo.gl/..."/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">🔑 طريقة الدخول (رمز القفل، تسليم المفتاح...)</label>
              <textarea className="inp" rows={2} value={cMdl.entry_method||""} onChange={e=>setCMdl(p=>({...p,entry_method:e.target.value}))} placeholder="مثال: قفل رقمي — الرمز 1234#، يُرسل قبل الوصول بساعة"/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">📄 الشروط والأحكام الخاصة بهذا الشاليه</label>
              <textarea className="inp" rows={3} value={cMdl.terms||""} onChange={e=>setCMdl(p=>({...p,terms:e.target.value}))} placeholder="تُضاف لرسالة ما قبل الوصول تلقائياً..."/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">المميزات (افصل بفاصلة)</label>
              <input className="inp" value={cMdl.amenities||""} onChange={e=>setCMdl(p=>({...p,amenities:e.target.value}))} placeholder="مسبح خاص، واي فاي، مطبخ مجهز، موقف سيارات"/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">صورة الشاليه</label>
              <label style={{display:"block",border:"2px dashed rgba(201,163,106,.5)",borderRadius:10,padding:14,textAlign:"center",cursor:"pointer",background:SL}}>
                {imgUploading?<div style={{color:T,padding:"30px 0"}}>⏳ جاري الرفع...</div>:cMdl.img?<div style={{position:"relative"}}><img src={cMdl.img} alt="preview" style={{width:"100%",height:140,objectFit:"cover",borderRadius:7}}/><button type="button" onClick={e=>{e.preventDefault();setCMdl(p=>({...p,img:null}));}} style={{position:"absolute",top:5,left:5,background:"rgba(166,58,42,.85)",color:"#fff",border:"none",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:11}}>حذف</button></div>:<div style={{color:T}}><div style={{fontSize:28,marginBottom:4}}>📷</div><div style={{fontWeight:600,fontSize:13}}>اضغط لرفع صورة</div></div>}
                <input type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{
                  const file=e.target.files?.[0]; if(!file) return;
                  setImgUploading(true);
                  const url = await uploadChaletImage(file);
                  setImgUploading(false);
                  if(url) setCMdl(p=>({...p,img:url}));
                  else alert("فشل رفع الصورة، تأكد من وجود bucket باسم chalet-images في Supabase Storage");
                }}/>
              </label>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">معرض الصور (تظهر للزبون في رابط الشاليه)</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8,marginBottom:8}}>
                {(()=>{
                  let gal: unknown[] = [];
                  try { gal = cMdl.gallery ? JSON.parse(cMdl.gallery as string) : []; } catch { gal = []; }
                  return gal.map((g,i)=>(
                    <div key={i} style={{position:"relative",height:70}}>
                      <img src={galleryUrl(g)||""} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:7}}/>
                      <button type="button" onClick={()=>{
                        const next = gal.filter((_,gi)=>gi!==i);
                        setCMdl(p=>({...p,gallery:JSON.stringify(next)}));
                      }} style={{position:"absolute",top:2,left:2,background:"rgba(166,58,42,.85)",color:"#fff",border:"none",borderRadius:4,width:18,height:18,fontSize:11,cursor:"pointer",lineHeight:1}}>✕</button>
                    </div>
                  ));
                })()}
                <label style={{height:70,border:"2px dashed rgba(201,163,106,.5)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:SL,fontSize:imgUploading?12:22,color:T,textAlign:"center"}}>
                  {imgUploading?"⏳":"+"}
                  <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>{
                    const files = Array.from(e.target.files||[]) as File[];
                    if(!files.length) return;
                    let gal: unknown[] = [];
                    try { gal = cMdl.gallery ? JSON.parse(cMdl.gallery as string) : []; } catch { gal = []; }
                    setImgUploading(true);
                    for(const file of files){
                      const url = await uploadChaletImage(file);
                      if(url) gal = [...gal, url];
                    }
                    setImgUploading(false);
                    setCMdl(p=>({...p,gallery:JSON.stringify(gal)}));
                  }}/>
                </label>
              </div>
            </div>
            <div style={{gridColumn:"span 2",background:SL,borderRadius:10,padding:14,border:"1px solid rgba(201,163,106,.25)"}}>
              <label className="lbl" style={{marginBottom:10}}>أنواع الحجز المسموحة للزبون</label>
              <div style={{display:"flex",gap:18,marginBottom:cMdl.allow_hourly?14:0}}>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:B,cursor:"pointer"}}>
                  <input type="checkbox" checked={cMdl.allow_overnight!==false} onChange={e=>setCMdl(p=>({...p,allow_overnight:e.target.checked}))}/> مبيت (تاريخ وصول/مغادرة)
                </label>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:B,cursor:"pointer"}}>
                  <input type="checkbox" checked={!!cMdl.allow_hourly} onChange={e=>setCMdl(p=>({...p,allow_hourly:e.target.checked}))}/> بالساعة (فترات محددة)
                </label>
              </div>
              {cMdl.allow_hourly && (()=>{
                let slots: {name:string;from:string;to:string;price:string}[] = [];
                try { slots = cMdl.hourly_slots ? JSON.parse(cMdl.hourly_slots as string) : []; } catch { slots = []; }
                const update = (next:typeof slots) => setCMdl(p=>({...p,hourly_slots:JSON.stringify(next)}));
                return (
                  <div>
                    {slots.map((s,i)=>(
                      <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"center"}}>
                        <input className="inp" placeholder="اسم الفترة (صباحي)" value={s.name} onChange={e=>{const n=[...slots];n[i]={...n[i],name:e.target.value};update(n);}} style={{padding:"6px 8px",fontSize:12}}/>
                        <input className="inp" type="time" value={s.from} onChange={e=>{const n=[...slots];n[i]={...n[i],from:e.target.value};update(n);}} style={{padding:"6px 8px",fontSize:12}}/>
                        <input className="inp" type="time" value={s.to} onChange={e=>{const n=[...slots];n[i]={...n[i],to:e.target.value};update(n);}} style={{padding:"6px 8px",fontSize:12}}/>
                        <input className="inp" type="number" placeholder="السعر" value={s.price} onChange={e=>{const n=[...slots];n[i]={...n[i],price:e.target.value};update(n);}} style={{padding:"6px 8px",fontSize:12}}/>
                        <button type="button" onClick={()=>update(slots.filter((_,si)=>si!==i))} style={{background:"rgba(166,58,42,.15)",color:"#A63A2A",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer"}}>✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={()=>update([...slots,{name:"",from:"",to:"",price:""}])}
                      style={{background:"transparent",border:"1.5px dashed rgba(201,163,106,.5)",borderRadius:8,padding:"6px 14px",fontSize:12,color:T,cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}>+ إضافة فترة</button>
                  </div>
                );
              })()}
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setCMdl(null)}>إلغاء</button>
            <SaveBtn onClick={()=>svC(cMdl)}/>
          </div>
        </Mdl>
      )}

      {bMdl&&(
        <Mdl onClose={()=>setBMdl(null)} title={bMdl.id?bt("editBookingTitle"):bt("addBookingTitle")}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"span 2"}}><label className="lbl">{bt("guestName")}</label><input className="inp" value={bMdl.guest||""} onChange={e=>setBMdl(p=>({...p,guest:e.target.value}))}/></div>
            <div>
              <label className="lbl">{bt("phone")}</label>
              <input className="inp" value={bMdl.phone||""} onChange={e=>setBMdl(p=>({...p,phone:e.target.value}))}/>
              {isGuestBlocked(bMdl.phone)&&<div style={{marginTop:4,fontSize:11,color:"#A63A2A",fontWeight:700}}>{bt("blockedWarning")}{findBlockRecord(bMdl.phone)?.reason?" — "+findBlockRecord(bMdl.phone)?.reason:""}</div>}
            </div>
            <div><label className="lbl">{bt("chalet")}</label><select className="inp" value={bMdl.chalet||""} onChange={e=>setBMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="lbl">{bt("arrival")}</label><input className="inp" type="date" value={bMdl.date_from||""} onChange={e=>setBMdl(p=>({...p,date_from:e.target.value}))}/></div>
            <div><label className="lbl">{bt("departure")}</label><input className="inp" type="date" value={bMdl.date_to||""} onChange={e=>setBMdl(p=>({...p,date_to:e.target.value}))}/></div>
            <div><label className="lbl">{bt("checkinTime")}</label><input className="inp" type="time" value={bMdl.checkin_time||""} onChange={e=>setBMdl(p=>({...p,checkin_time:e.target.value}))} placeholder="15:00"/></div>
            <div><label className="lbl">{bt("checkoutTime")}</label><input className="inp" type="time" value={bMdl.checkout_time||""} onChange={e=>setBMdl(p=>({...p,checkout_time:e.target.value}))} placeholder="12:00"/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">{bt("price")} (ريال)</label><input className="inp" type="number" value={bMdl.price||""} onChange={e=>setBMdl(p=>({...p,price:e.target.value}))}/></div>
            <div><label className="lbl">{bt("status")}</label><select className="inp" value={bMdl.status||"confirmed"} onChange={e=>setBMdl(p=>({...p,status:e.target.value}))}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{bt(STATUS_LABEL_KEY[k]||"")||v.label}</option>)}</select></div>
            <div><label className="lbl">{bkLang==="ar"?"ملاحظات":"टिप्पणियाँ"}</label><input className="inp" value={bMdl.note||""} onChange={e=>setBMdl(p=>({...p,note:e.target.value}))}/></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setBMdl(null)}>{bt("cancel")}</button>
            <SaveBtn label={bt("save")} onClick={()=>svB(bMdl)}/>
          </div>
        </Mdl>
      )}

      {grMdl&&(
        <Mdl onClose={()=>setGrMdl(null)} title={"⭐ "+bt("rateTitle")+" — "+grMdl.booking.guest}>
          <div style={{textAlign:"center",marginBottom:14,fontSize:12,color:T}}>{grMdl.booking.chalet} · {fd(grMdl.booking.date_from)} ← {fd(grMdl.booking.date_to)}</div>
          <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:16}}>
            {[1,2,3,4,5].map(s=>(
              <span key={s} onClick={()=>setGrMdl(p=>p&&({...p,rating:s}))} style={{fontSize:36,cursor:"pointer",color:grMdl.rating>=s?"#B08D2B":"#E5E7EB"}}>★</span>
            ))}
          </div>
          <label className="lbl">{bkLang==="ar"?"ملاحظة (اختياري)":"टिप्पणी (वैकल्पिक)"}</label>
          <textarea className="inp" rows={3} value={grMdl.note} onChange={e=>setGrMdl(p=>p&&({...p,note:e.target.value}))} placeholder={bt("ratePlaceholder")} style={{width:"100%",resize:"none"}}/>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setGrMdl(null)}>{bt("cancel")}</button>
            <SaveBtn label={bt("saveRating")} disabled={!grMdl.rating} onClick={svGuestRating}/>
          </div>
        </Mdl>
      )}

      {blockMdl&&(
        <Mdl onClose={()=>setBlockMdl(null)} title={"🚫 "+bt("blockTitle")+" — "+blockMdl.booking.guest}>
          <div style={{fontSize:12,color:T,marginBottom:12}}>{bt("blockDesc")}</div>
          <label className="lbl">{bkLang==="ar"?"سبب الحظر (اختياري)":"ब्लॉक करने का कारण (वैकल्पिक)"}</label>
          <textarea className="inp" rows={3} value={blockMdl.reason} onChange={e=>setBlockMdl(p=>p&&({...p,reason:e.target.value}))} placeholder={bt("blockReasonPlaceholder")} style={{width:"100%",resize:"none"}}/>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setBlockMdl(null)}>{bt("cancel")}</button>
            <SaveBtn label={bt("confirmBlock")} style={{background:"#A63A2A"}} onClick={confirmBlockGuest}/>
          </div>
        </Mdl>
      )}

      {invMdl&&(
        <Mdl onClose={()=>setInvMdl(null)} title={invMdl.id?"تعديل مستثمر":"+ إضافة مستثمر"}>
          <div style={{marginBottom:12}}><label className="lbl">الشاليه</label>
            <select className="inp" value={invMdl.chalet||""} onChange={e=>setInvMdl(p=>p&&({...p,chalet:e.target.value}))}>
              {names.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{marginBottom:12}}><label className="lbl">الاسم</label><input className="inp" value={invMdl.name||""} onChange={e=>setInvMdl(p=>p&&({...p,name:e.target.value}))} placeholder="اسم المستثمر"/></div>
          <div style={{marginBottom:12}}><label className="lbl">رقم الجوال (اختياري)</label><input className="inp" dir="ltr" value={invMdl.phone||""} onChange={e=>setInvMdl(p=>p&&({...p,phone:e.target.value}))} placeholder="05xxxxxxxx"/></div>
          <div style={{marginBottom:12}}><label className="lbl">نسبته من صافي ربح هذا الشاليه (%)</label><input className="inp" type="number" min={0} max={100} value={invMdl.percentage??0} onChange={e=>setInvMdl(p=>p&&({...p,percentage:Number(e.target.value)}))}/></div>
          <div style={{marginBottom:20}}><label className="lbl">ملاحظة (اختياري)</label><input className="inp" value={invMdl.note||""} onChange={e=>setInvMdl(p=>p&&({...p,note:e.target.value}))}/></div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setInvMdl(null)}>إلغاء</button>
            <SaveBtn label="حفظ" disabled={!invMdl.name||!invMdl.chalet} onClick={async()=>{
              const body={chalet:invMdl.chalet,name:invMdl.name,phone:invMdl.phone||null,percentage:Number(invMdl.percentage)||0,note:invMdl.note||null};
              if(invMdl.id)await db("investors","PATCH",body,invMdl.id);
              else await db("investors","POST",body);
              await loadAll();
              setInvMdl(null);
            }}/>
          </div>
        </Mdl>
      )}

      {mMdl&&(
        <Mdl onClose={()=>setMMdl(null)} title={mMdl.id?"تعديل طلب الصيانة":"طلب صيانة جديد"}>
          {mMdl.status==="done"&&Number(mMdl.cost)>0&&(<div style={{background:SL,borderRadius:9,padding:"9px 13px",marginBottom:14,fontSize:13,color:T,fontWeight:600,border:"1px solid "+S}}>{"سيُخصم "+Number(mMdl.cost).toLocaleString("en-US")+" ريال من محفظة التأمين"}</div>)}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label className="lbl">الشاليه</label><select className="inp" value={mMdl.chalet||""} onChange={e=>setMMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="lbl">التاريخ</label><input className="inp" type="date" value={mMdl.maint_date||""} onChange={e=>setMMdl(p=>({...p,maint_date:e.target.value}))}/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">وصف المشكلة</label><input className="inp" value={mMdl.issue||""} onChange={e=>setMMdl(p=>({...p,issue:e.target.value}))} placeholder="اوصف المشكلة..."/></div>
            <div><label className="lbl">مقدم الطلب</label><input className="inp" value={mMdl.req||""} onChange={e=>setMMdl(p=>({...p,req:e.target.value}))} placeholder="الاسم..."/></div>
            <div><label className="lbl">الأولوية</label><select className="inp" value={mMdl.priority||"متوسط"} onChange={e=>setMMdl(p=>({...p,priority:e.target.value}))}><option value="منخفض">منخفض</option><option value="متوسط">متوسط</option><option value="عالي">عالي</option></select></div>
            <div><label className="lbl">الحالة</label><select className="inp" value={mMdl.status||"open"} onChange={e=>setMMdl(p=>({...p,status:e.target.value}))}>{Object.entries(MS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
            <div><label className="lbl">التكلفة (ريال)</label><input className="inp" type="number" value={mMdl.cost||""} onChange={e=>setMMdl(p=>({...p,cost:e.target.value}))} placeholder="0"/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">ملاحظات</label><textarea className="inp" rows={2} value={mMdl.note||""} onChange={e=>setMMdl(p=>({...p,note:e.target.value}))}/></div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">صورة المشكلة 📷</label>
              <label style={{display:"block",border:"2px dashed rgba(201,163,106,.5)",borderRadius:10,padding:14,textAlign:"center",cursor:"pointer",background:SL}}>
                {mMdl.image?<div style={{position:"relative"}}><img src={mMdl.image} alt="preview" style={{width:"100%",height:160,objectFit:"cover",borderRadius:8}}/><button type="button" onClick={e=>{e.preventDefault();setMMdl(p=>({...p,image:null}));}} style={{position:"absolute",top:5,left:5,background:"rgba(166,58,42,.85)",color:"#fff",border:"none",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:11}}>حذف</button></div>:<div style={{color:T}}><div style={{fontSize:28,marginBottom:4}}>📷</div><div style={{fontWeight:600,fontSize:13}}>اضغط لرفع صورة</div></div>}
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>setMMdl(p=>({...p,image:ev.target.result}));r.readAsDataURL(file);}}/>
              </label>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setMMdl(null)}>إلغاء</button>
            <SaveBtn onClick={()=>svM(mMdl,mOld)}/>
          </div>
        </Mdl>
      )}

      {exMdl&&(
        <Mdl onClose={()=>setExMdl(null)} title="➕ إضافة مصروف">
          <div style={{marginBottom:12}}>
            <label className="lbl">الفئة</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {["إيجار","تنظيف","صيانة","إدارة","كهرباء","اشتراكات","غيره"].map(cat=>(
                <button key={cat} className="btn" onClick={()=>setExMdl(p=>({...p,category:cat}))} style={{padding:"7px 14px",fontSize:13,background:exMdl.category===cat?B:SL,color:exMdl.category===cat?S:B,border:"1.5px solid rgba(201,163,106,.3)"}}>{cat}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:12}}><label className="lbl">الشاليه</label><select className="inp" value={exMdl.chalet} onChange={e=>setExMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{marginBottom:12}}><label className="lbl">المبلغ (ريال)</label><input className="inp" type="number" value={exMdl.amount} onChange={e=>setExMdl(p=>({...p,amount:e.target.value}))} placeholder="0"/></div>
          <div style={{marginBottom:12}}><label className="lbl">التاريخ</label><input className="inp" type="date" value={exMdl.expense_date} onChange={e=>setExMdl(p=>({...p,expense_date:e.target.value}))}/></div>
          <div style={{marginBottom:20}}><label className="lbl">ملاحظة</label><input className="inp" value={exMdl.note||""} onChange={e=>setExMdl(p=>({...p,note:e.target.value}))} placeholder="اختياري..."/></div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setExMdl(null)}>إلغاء</button>
            <SaveBtn label="حفظ المصروف" disabled={!exMdl.amount||!exMdl.chalet} onClick={async()=>{await db("expenses","POST",{chalet:exMdl.chalet,category:exMdl.category,amount:Number(exMdl.amount),note:exMdl.note||"",expense_date:exMdl.expense_date});await loadAll();setExMdl(null);}}/>
          </div>
        </Mdl>
      )}

      {fxMdl&&(
        <Mdl onClose={()=>setFxMdl(null)} title={fxMdl.id?"تعديل المصروف الثابت":"إضافة مصروف ثابت"}>
          <div style={{marginBottom:12}}><label className="lbl">اسم المصروف</label><input className="inp" value={fxMdl.name||""} onChange={e=>setFxMdl(p=>({...p,name:e.target.value}))} placeholder="مثال: كهرباء، ماء، إنترنت"/></div>
          <div style={{marginBottom:12}}><label className="lbl">الشاليه</label><select className="inp" value={fxMdl.chalet} onChange={e=>setFxMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{marginBottom:12}}><label className="lbl">المبلغ (ريال)</label><input className="inp" type="number" value={fxMdl.amount||""} onChange={e=>setFxMdl(p=>({...p,amount:Number(e.target.value)}))} placeholder="0"/></div>
          <div style={{marginBottom:12}}>
            <label className="lbl">التكرار</label>
            <div style={{display:"flex",gap:6}}>
              {([["monthly","شهري"],["quarterly","ربع سنوي"],["yearly","سنوي"]] as [string,string][]).map(([v,l])=>(
                <button key={v} className="btn" onClick={()=>setFxMdl(p=>({...p,frequency:v as "monthly"|"quarterly"|"yearly"}))} style={{padding:"8px 16px",fontSize:13,background:fxMdl.frequency===v?"#5B4636":"#FAF6F0",color:fxMdl.frequency===v?"#fff":"#5B4636",border:"1.5px solid rgba(201,163,106,.3)"}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:12}}>
            <label className="lbl">الفئة</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["إيجار","تنظيف","صيانة","إدارة","كهرباء","اشتراكات","غيره"].map(cat=>(
                <button key={cat} className="btn" onClick={()=>setFxMdl(p=>({...p,category:cat}))} style={{padding:"7px 14px",fontSize:13,background:fxMdl.category===cat?"#5B4636":"#FAF6F0",color:fxMdl.category===cat?"#fff":"#5B4636",border:"1.5px solid rgba(201,163,106,.3)"}}>{cat}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:20}}>
            <label className="lbl">يوم الاستحقاق من الشهر (اختياري — لتفعيل تذكير الاستحقاق)</label>
            <input className="inp" type="number" min={1} max={31} value={fxMdl.due_day||""} onChange={e=>setFxMdl(p=>({...p,due_day:e.target.value?Number(e.target.value):undefined}))} placeholder="مثال: 5"/>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setFxMdl(null)}>إلغاء</button>
            <SaveBtn label={fxMdl.id?"حفظ التعديلات":"حفظ المصروف الثابت"} disabled={!fxMdl.name||!fxMdl.chalet||!fxMdl.amount} onClick={async()=>{
              const body={chalet:fxMdl.chalet,name:fxMdl.name,amount:Number(fxMdl.amount),frequency:fxMdl.frequency||"monthly",category:fxMdl.category||"إيجار",active:fxMdl.active!==false,due_day:fxMdl.due_day?Number(fxMdl.due_day):null};
              if(fxMdl.id) await db("fixed_expenses","PATCH",body,fxMdl.id);
              else await db("fixed_expenses","POST",body);
              await loadAll();setFxMdl(null);
            }}/>
          </div>
        </Mdl>
      )}

      {uMdl&&(
        <Mdl onClose={()=>{setUMdl(null);setUErr("");}} title={uMdl.id?"تعديل المستخدم":"إضافة مستخدم جديد"}>
          {uErr&&<div style={{background:"#FFF5F5",border:"1px solid rgba(166,58,42,.2)",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#A63A2A",fontWeight:600}}>{uErr}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label className="lbl">الاسم</label><input className="inp" value={uMdl.name||""} onChange={e=>setUMdl(p=>({...p,name:e.target.value}))} placeholder="مثال: سالم"/></div>
            <div><label className="lbl">اسم المستخدم</label><input className="inp" value={uMdl.username||""} onChange={e=>setUMdl(p=>({...p,username:e.target.value}))} placeholder="staff1"/></div>
            <div><label className="lbl">البريد الإلكتروني</label><input className="inp" value={uMdl.email||""} disabled={!!uMdl.id} onChange={e=>setUMdl(p=>({...p,email:e.target.value}))} placeholder="example@email.com" style={uMdl.id?{opacity:.6}:{}}/></div>
            <div><label className="lbl">كلمة المرور</label><input className="inp" type="password" value={uMdl.password||""} onChange={e=>setUMdl(p=>({...p,password:e.target.value}))} placeholder={uMdl.id?"اتركها فارغة إذا لم تتغير":"6 أحرف على الأقل"}/></div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">الصلاحية</label>
              <div style={{display:"flex",gap:8}}>
                {[{v:"admin",l:"أدمن",d:"كل شيء"},{v:"staff",l:"موظف",d:"حجوزات وصيانة"},{v:"chalet_manager",l:"مدير شاليه",d:"شاليه واحد فقط"}].map(r=>(
                  <button key={r.v} className="btn" onClick={()=>setUMdl(p=>({...p,role:r.v}))} style={{flex:1,padding:"9px 4px",fontSize:12,background:uMdl.role===r.v?B:SL,color:uMdl.role===r.v?S:B,border:"1.5px solid rgba(201,163,106,.3)",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <span style={{fontWeight:800}}>{r.l}</span>
                    <span style={{fontSize:10,opacity:.7}}>{r.d}</span>
                  </button>
                ))}
              </div>
            </div>
            {uMdl.role==="chalet_manager"&&(
              <div style={{gridColumn:"span 2"}}>
                <label className="lbl">الشاليه المخصص</label>
                <select className="inp" value={uMdl.chalet||""} onChange={e=>setUMdl(p=>({...p,chalet:e.target.value}))}>
                  <option value="">اختر الشاليه...</option>
                  {names.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setUMdl(null)}>إلغاء</button>
            <SaveBtn disabled={!uMdl.name||(!uMdl.id&&(!uMdl.email||!uMdl.password))} onClick={async()=>{
              if(!uMdl.name) return;
              setUErr("");
              const result = await callTeamMemberFn({
                userId: uMdl.id||undefined,
                email: uMdl.email||undefined,
                password: uMdl.password||undefined,
                name: uMdl.name,
                username: uMdl.username||null,
                role: uMdl.role,
                chalet: uMdl.role==="chalet_manager"?(uMdl.chalet||null):null,
              });
              if(result?.error){ setUErr(result.error); return; }
              await loadAll(); setUMdl(null);
            }}/>
          </div>
        </Mdl>
      )}

      {clTaskMdl&&(
        <Mdl onClose={()=>setClTaskMdl(null)} title={clTaskMdl.id?"تعديل مهمة":"إضافة مهمة نظافة"}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"span 2"}}><label className="lbl">اسم المهمة</label><input className="inp" value={clTaskMdl.title||""} onChange={e=>setClTaskMdl(p=>({...p,title:e.target.value}))} placeholder="مثال: تنظيف المسبح"/></div>
            <div><label className="lbl">الشاليه</label><select className="inp" value={clTaskMdl.chalet||""} onChange={e=>setClTaskMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="lbl">الفئة</label><select className="inp" value={clTaskMdl.category||"مسبح"} onChange={e=>setClTaskMdl(p=>({...p,category:e.target.value}))}>
              <option value="مسبح">🏊 مسبح</option>
              <option value="حمامات">🚿 حمامات</option>
              <option value="مطبخ">🍳 مطبخ</option>
              <option value="أثاث وغرف">🛋️ أثاث وغرف</option>
              <option value="خارجي">🌿 خارجي</option>
              <option value="مبيدات">🪲 مبيدات</option>
              <option value="عام">📦 عام</option>
            </select></div>
            <div><label className="lbl">التكرار</label><select className="inp" value={clTaskMdl.frequency||"أسبوعي"} onChange={e=>setClTaskMdl(p=>({...p,frequency:e.target.value}))}>
              <option value="يومي">يومي</option>
              <option value="مرتين أسبوعياً">مرتين أسبوعياً</option>
              <option value="أسبوعي">أسبوعي</option>
              <option value="بعد كل حجز">بعد كل حجز</option>
              <option value="شهري">شهري</option>
            </select></div>
            <div><label className="lbl">المسؤول</label><input className="inp" value={clTaskMdl.assigned_to||""} onChange={e=>setClTaskMdl(p=>({...p,assigned_to:e.target.value}))} placeholder="اسم العامل"/></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setClTaskMdl(null)}>إلغاء</button>
            <SaveBtn style={{background:"#3D7A5A"}} onClick={async()=>{
              const body={chalet:clTaskMdl.chalet,title:clTaskMdl.title,category:clTaskMdl.category,frequency:clTaskMdl.frequency,assigned_to:clTaskMdl.assigned_to||"",active:true};
              if(clTaskMdl.id)await db("cleaning_tasks","PATCH",body,clTaskMdl.id);
              else await db("cleaning_tasks","POST",body);
              await loadAll();setClTaskMdl(null);
            }}/>
          </div>
        </Mdl>
      )}
      {clExpMdl&&(
        <Mdl onClose={()=>setClExpMdl(null)} title={clExpMdl.id?"تعديل التزام":"إضافة التزام نظافة"}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label className="lbl">التاريخ</label><input className="inp" type="date" value={clExpMdl.expense_date||td()} onChange={e=>setClExpMdl(p=>({...p,expense_date:e.target.value}))}/></div>
            <div><label className="lbl">الشاليه</label><select className="inp" value={clExpMdl.chalet||""} onChange={e=>setClExpMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="lbl">الفئة</label><select className="inp" value={clExpMdl.category||"رواتب"} onChange={e=>setClExpMdl(p=>({...p,category:e.target.value}))}>
              <option value="رواتب">رواتب</option>
              <option value="مواد تنظيف">مواد تنظيف</option>
              <option value="معدات">معدات</option>
              <option value="أخرى">أخرى</option>
            </select></div>
            <div><label className="lbl">المبلغ (ريال)</label><input className="inp" type="number" value={clExpMdl.amount||""} onChange={e=>setClExpMdl(p=>({...p,amount:e.target.value}))}/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">ملاحظة</label><input className="inp" value={clExpMdl.note||""} onChange={e=>setClExpMdl(p=>({...p,note:e.target.value}))}/></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setClExpMdl(null)}>إلغاء</button>
            <SaveBtn style={{background:"#3D7A5A"}} onClick={async()=>{
              const body={chalet:clExpMdl.chalet,category:clExpMdl.category,amount:Number(clExpMdl.amount),note:clExpMdl.note||"",expense_date:clExpMdl.expense_date||td()};
              if(clExpMdl.id)await db("cleaning_expenses","PATCH",body,clExpMdl.id);
              else await db("cleaning_expenses","POST",body);
              await loadAll();setClExpMdl(null);
            }}/>
          </div>
        </Mdl>
      )}
      {clnMdl&&(()=>{
        function ClnMdlInner(){
          const [ch,setCh]=useState(names[0]||"");
          const [amt,setAmt]=useState("");
          const [nt,setNt]=useState("");
          return (
            <Mdl onClose={()=>setClnMdl(false)} title="إضافة رصيد نظافة">
              <p style={{color:T,fontSize:13,marginBottom:16}}>المبلغ سيُضاف فوراً لمحفظة النظافة</p>
              <div style={{marginBottom:12}}><label className="lbl">الشاليه</label><select className="inp" value={ch} onChange={e=>setCh(e.target.value)}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              <div style={{marginBottom:12}}><label className="lbl">المبلغ (ريال)</label><input className="inp" type="number" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="500"/></div>
              <div style={{marginBottom:20}}><label className="lbl">ملاحظة</label><input className="inp" value={nt} onChange={e=>setNt(e.target.value)} placeholder="رصيد نظافة شهر يونيو"/></div>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button className="btn bo" onClick={()=>setClnMdl(false)}>إلغاء</button>
                <SaveBtn label="إضافة" style={{background:"#3D7A5A"}} onClick={()=>svCln(ch,amt,nt)}/>
              </div>
            </Mdl>
          );
        }
        return <ClnMdlInner/>;
      })()}
      {clMdl&&(
        <Mdl onClose={()=>setClMdl(null)} title="تعديل معاملة النظافة">
          <div style={{marginBottom:12}}><label className="lbl">التاريخ</label><input className="inp" type="date" value={clMdl.trans_date||""} onChange={e=>setClMdl(p=>({...p,trans_date:e.target.value}))}/></div>
          <div style={{marginBottom:12}}><label className="lbl">الشاليه</label><select className="inp" value={clMdl.chalet||""} onChange={e=>setClMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{marginBottom:12}}><label className="lbl">النوع</label><select className="inp" value={clMdl.type||"إيداع"} onChange={e=>setClMdl(p=>({...p,type:e.target.value}))}><option value="إيداع">إيداع</option><option value="سحب">سحب</option></select></div>
          <div style={{marginBottom:12}}><label className="lbl">المبلغ (ريال)</label><input className="inp" type="number" value={clMdl.amount||""} onChange={e=>setClMdl(p=>({...p,amount:Number(e.target.value)}))}/></div>
          <div style={{marginBottom:20}}><label className="lbl">ملاحظة</label><input className="inp" value={clMdl.note||""} onChange={e=>setClMdl(p=>({...p,note:e.target.value}))}/></div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setClMdl(null)}>إلغاء</button>
            <SaveBtn style={{background:"#3D7A5A"}} onClick={async()=>{await db("cleaning","PATCH",{trans_date:clMdl.trans_date,chalet:clMdl.chalet,type:clMdl.type,amount:clMdl.amount,note:clMdl.note},clMdl.id);await loadAll();setClMdl(null);}}/>
          </div>
        </Mdl>
      )}
      {bkDetail&&(
        <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setBkDetail(null)}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)"}}/>
          <div style={{position:"relative",background:W,borderRadius:20,width:"100%",maxWidth:480,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{background:"linear-gradient(135deg,"+B+","+BD+")",padding:"20px 24px",position:"relative"}}>
              <button onClick={()=>setBkDetail(null)} style={{position:"absolute",top:14,left:16,background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:30,height:30,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginBottom:4}}>{bt("detailsTitle")}</div>
              <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>{bkDetail.guest}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:4,direction:"ltr",textAlign:"right"}}>{bkDetail.phone}</div>
              <span style={{position:"absolute",top:20,right:20,background:STATUS[bkDetail.status]?.bg||"#eee",color:STATUS[bkDetail.status]?.color||"#333",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:800}}>{bt(STATUS_LABEL_KEY[bkDetail.status]||"")||STATUS[bkDetail.status]?.label||bkDetail.status}</span>
            </div>
            {/* Body */}
            <div style={{padding:"20px 24px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                {[
                  {l:bt("chalet"),v:bkDetail.chalet,i:"🏠"},
                  {l:bt("nightsLabel"),v:fn(bkDetail.date_from,bkDetail.date_to)+" "+bt("nights"),i:"🌙"},
                  {l:bt("arrival"),v:fd(bkDetail.date_from),i:"📅"},
                  {l:bt("departure"),v:fd(bkDetail.date_to),i:"🚪"},
                  {l:bt("totalPrice"),v:Number(bkDetail.price).toLocaleString("en-US")+" ر",i:"💰"},
                  {l:bt("paymentMethod"),v:bkDetail.payment_method||"-",i:"💳"},
                  ...(bkDetail.status==="completed"?[{l:"استلم المبلغ",v:bkDetail.received_by||"-",i:"👤"}]:[]),
                ].map((item,i)=>(
                  <div key={i} style={{background:SL,borderRadius:10,padding:"12px 14px"}}>
                    <div style={{fontSize:10,color:T,marginBottom:4}}>{item.i} {item.l}</div>
                    <div style={{fontWeight:800,color:B,fontSize:14}}>{item.v}</div>
                  </div>
                ))}
              </div>
              {bkDetail.notes&&<div style={{background:SL,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                <div style={{fontSize:10,color:T,marginBottom:4}}>{bt("notes")}</div>
                <div style={{fontSize:13,color:B}}>{bkDetail.notes}</div>
              </div>}
              {isGuestBlocked(bkDetail.phone)&&<div style={{background:"#FBEDEA",border:"1px solid rgba(166,58,42,.3)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:"#A63A2A",fontWeight:700}}>
                {bt("thisGuestBlocked")}{findBlockRecord(bkDetail.phone)?.reason?" — "+findBlockRecord(bkDetail.phone)?.reason:""}
              </div>}
              {(()=>{const rs=guestRatings.filter(r=>normPhone(r.phone)===normPhone(bkDetail.phone));return rs.length>0&&(
                <div style={{background:SL,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                  <div style={{fontSize:10,color:T,marginBottom:6}}>{bt("previousRatings")}</div>
                  {rs.map((r,i)=>(
                    <div key={r.id} style={{display:"flex",alignItems:"center",gap:6,marginTop:i>0?6:0}}>
                      <span style={{color:"#B08D2B",fontSize:13}}>{"★".repeat(r.rating)+"☆".repeat(5-r.rating)}</span>
                      {r.note&&<span style={{fontSize:11,color:T}}>— {r.note}</span>}
                    </div>
                  ))}
                </div>
              );})()}
              <div style={{display:"flex",gap:8}}>
                <button className="btn be" style={{flex:1}} onClick={()=>{setBMdl({...bkDetail});setBkDetail(null);}}>{bt("edit")}</button>
                <button onClick={()=>{const url=`https://reetam-chalets.vercel.app?guest=1&b=${bkDetail.id}&m=checkin`;const msg=`مرحباً ${bkDetail.guest} 👋%0aأهلاً بك في ${bkDetail.chalet}%0a%0aرابط تسجيل الدخول:%0a${encodeURIComponent(url)}`;const phone=bkDetail.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");}} style={{flex:1,background:"#1F8A4C",color:"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:13,cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700}}>{bt("whatsappBtn")}</button>
                {(bkDetail.status==="confirmed"||bkDetail.status==="pending")&&<button className="btn" style={{flex:1,background:"linear-gradient(135deg,#A63A2A,#6B2A2A)",color:"#fff"}} onClick={()=>{setCoMdl(bkDetail);setBkDetail(null);}}>{bt("checkout")}</button>}
              </div>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                {isCheckedOut(bkDetail)&&<button className="btn" style={{flex:1,background:"#B08D2B",color:"#fff"}} onClick={()=>{setGrMdl({booking:bkDetail,rating:0,note:""});setBkDetail(null);}}>{bt("rateGuest")}</button>}
                <button className="btn" style={{flex:1,background:isGuestBlocked(bkDetail.phone)?"rgba(166,58,42,.1)":"#A63A2A",color:isGuestBlocked(bkDetail.phone)?"#A63A2A":"#fff"}}
                  onClick={()=>{if(isGuestBlocked(bkDetail.phone)){unblockGuest(bkDetail.phone);}else{setBlockMdl({booking:bkDetail,reason:""});}setBkDetail(null);}}>
                  {isGuestBlocked(bkDetail.phone)?bt("unblock"):bt("block")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {goalMdl&&(
        <Mdl onClose={()=>setGoalMdl(null)} title={"🎯 هدف الشهر - "+goalMdl.name}>
          <p style={{color:T,fontSize:13,marginBottom:16}}>حدد الهدف الشهري لصافي الأرباح (الإيرادات - المصاريف)</p>
          <div style={{marginBottom:20}}>
            <label className="lbl">الهدف الشهري (ريال)</label>
            <input className="inp" type="number" placeholder="مثال: 10000" value={goalMdl.goal} onChange={e=>setGoalMdl(p=>({...p,goal:e.target.value}))}/>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setGoalMdl(null)}>إلغاء</button>
            <SaveBtn label="حفظ الهدف" onClick={async()=>{
              await db("chalets","PATCH",{monthly_goal:Number(goalMdl.goal)},goalMdl.id);
              await loadAll();setGoalMdl(null);
            }}/>
          </div>
        </Mdl>
      )}
      {wMdl&&(
        <Mdl onClose={()=>setWMdl(null)} title="تعديل معاملة التأمين">
          <div style={{marginBottom:12}}><label className="lbl">التاريخ</label><input className="inp" type="date" value={wMdl.trans_date||""} onChange={e=>setWMdl(p=>({...p,trans_date:e.target.value}))}/></div>
          <div style={{marginBottom:12}}><label className="lbl">الشاليه</label><select className="inp" value={wMdl.chalet||""} onChange={e=>setWMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{marginBottom:12}}><label className="lbl">النوع</label><select className="inp" value={wMdl.type||"إيداع"} onChange={e=>setWMdl(p=>({...p,type:e.target.value}))}><option value="إيداع">إيداع</option><option value="سحب صيانة">سحب صيانة</option></select></div>
          <div style={{marginBottom:12}}><label className="lbl">المبلغ (ريال)</label><input className="inp" type="number" value={wMdl.amount||""} onChange={e=>setWMdl(p=>({...p,amount:Number(e.target.value)}))}/></div>
          <div style={{marginBottom:20}}><label className="lbl">ملاحظة</label><input className="inp" value={wMdl.note||""} onChange={e=>setWMdl(p=>({...p,note:e.target.value}))}/></div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setWMdl(null)}>إلغاء</button>
            <SaveBtn onClick={async()=>{await db("wallet","PATCH",{trans_date:wMdl.trans_date,chalet:wMdl.chalet,type:wMdl.type,amount:wMdl.amount,note:wMdl.note},wMdl.id);await loadAll();setWMdl(null);}}/>
          </div>
        </Mdl>
      )}
      {iMdl&&<InsMdl/>}
      {addRoomMdl&&<AddRoomMdl/>}

      {cwMdl&&(
        <Mdl onClose={()=>setCwMdl(null)} title={cwMdl.id?"تعديل بيانات العامل":"إضافة عامل نظافة"}>
          <div style={{marginBottom:12}}><label className="lbl">الاسم</label><input className="inp" value={cwMdl.name||""} onChange={e=>setCwMdl(p=>({...p,name:e.target.value}))} placeholder="مثال: Raju Kumar"/></div>
          <div style={{marginBottom:12}}><label className="lbl">رقم الهاتف (واتساب)</label><input className="inp" value={cwMdl.phone||""} onChange={e=>setCwMdl(p=>({...p,phone:e.target.value}))} placeholder="9665XXXXXXXX" dir="ltr"/></div>
          <div style={{marginBottom:20}}>
            <label className="lbl">لغة التواصل</label>
            <div style={{display:"flex",gap:8,marginTop:6}}>
              {([["hi","🇮🇳 هندية"],["ar","🇸🇦 عربية"],["en","🌐 إنجليزية"]] as [string,string][]).map(([v,l])=>(
                <button key={v} className="btn" onClick={()=>setCwMdl(p=>({...p,language:v as "ar"|"hi"|"en"}))}
                  style={{flex:1,padding:"10px 8px",fontSize:13,background:cwMdl.language===v?"#065F46":"#F0FDF4",color:cwMdl.language===v?"#fff":"#065F46",border:"1.5px solid rgba(6,95,70,.3)"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setCwMdl(null)}>إلغاء</button>
            <SaveBtn disabled={!cwMdl.name||!cwMdl.phone} style={{background:"#065F46"}} onClick={async()=>{
              const body={name:cwMdl.name,phone:cwMdl.phone,language:cwMdl.language||"hi",active:true};
              if(cwMdl.id)await db("cleaning_workers","PATCH",body,cwMdl.id);
              else await db("cleaning_workers","POST",body);
              await loadAll();setCwMdl(null);
            }}/>
          </div>
        </Mdl>
      )}

      {qrMdl&&(
        <div className="mbg" onClick={()=>setQrMdl(null)}>
          <div className="mbox" style={{maxWidth:620,direction:"rtl"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div>
                <div style={{fontWeight:900,fontSize:16,color:"var(--text)"}}>📱 باركودات الغرف</div>
                <div style={{fontSize:12,color:"var(--text2)",marginTop:3}}>{qrMdl.chalet} · اطبع وضعها في كل غرفة</div>
              </div>
              <button onClick={()=>setQrMdl(null)} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--text3)"}}>×</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14}}>
              {qrMdl.rooms.map(room=>{
                const url=`https://reetam-chalets.vercel.app?guest=1&m=room&ch=${encodeURIComponent(qrMdl.chalet)}&rm=${encodeURIComponent(room)}`;
                const qrSrc=`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}&margin=10&color=413523`;
                return (
                  <div key={room} style={{
                    textAlign:"center",borderRadius:14,padding:"16px 12px",
                    border:"1px solid var(--border2)",background:"var(--surface)",
                  }}>
                    <img src={qrSrc} alt={room} style={{width:140,height:140,borderRadius:8,display:"block",margin:"0 auto 10px"}}/>
                    <div style={{fontWeight:800,color:"var(--text)",fontSize:14}}>{room}</div>
                    <div style={{fontSize:10,color:"var(--text2)",marginTop:3,marginBottom:10}}>{qrMdl.chalet}</div>
                    <button onClick={()=>window.open(url,"_blank")} style={{
                      width:"100%",background:"#3B2A1C",color:"#fff",border:"none",
                      borderRadius:8,padding:"6px",fontSize:11,fontWeight:700,
                      cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",marginBottom:6,
                    }}>🔗 تجربة الرابط</button>
                    <button onClick={()=>{
                      const a=document.createElement("a");
                      a.href=qrSrc;
                      a.download=`QR-${qrMdl.chalet}-${room}.png`;
                      a.click();
                    }} style={{
                      width:"100%",background:"var(--th-bg)",color:"var(--text)",
                      border:"1px solid var(--border2)",borderRadius:8,padding:"6px",
                      fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'IBM Plex Sans Arabic',sans-serif",
                    }}>⬇ تحميل PNG</button>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:16,padding:"10px 14px",background:"rgba(124,58,237,.08)",borderRadius:10,border:"1px solid rgba(124,58,237,.2)",fontSize:12,color:"#6D28D9",fontWeight:600}}>
              💡 اطبع الباركود وضعه على لوحة صغيرة في غرفة النوم — الضيف يمسحه ويطلب مباشرة
            </div>
          </div>
        </div>
      )}

      {preArrMdl&&(
        <div className="mbg" onClick={()=>setPreArrMdl(null)}>
          <div className="mbox" style={{maxWidth:560,direction:"rtl"}} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div>
                <div style={{fontWeight:900,fontSize:16,color:"var(--text)"}}>📋 رسالة ما قبل الوصول</div>
                <div style={{fontSize:12,color:"var(--text2)",marginTop:3}}>{preArrMdl.booking.guest} · {preArrMdl.booking.chalet}</div>
              </div>
              <button onClick={()=>setPreArrMdl(null)} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--text3)"}}>×</button>
            </div>

            {/* Pool link note */}
            <div style={{background:"rgba(99,102,241,.08)",borderRadius:10,padding:"10px 14px",marginBottom:14,border:"1px solid rgba(99,102,241,.2)"}}>
              <div style={{fontSize:12,color:"#4338CA",fontWeight:700}}>🏊 رابط خيار المسبح مضمّن في الرسالة</div>
              <div style={{fontSize:11,color:"#6366F1",marginTop:3}}>الضيف سيختار من خلاله: جاهز عند الوصول أو تعبئة عند الوصول</div>
            </div>

            {/* Message preview */}
            <div style={{background:"#ECF9EC",borderRadius:12,padding:"14px 16px",marginBottom:18,border:"1px solid rgba(37,211,102,.25)"}}>
              <div style={{fontSize:11,color:"#128C7E",fontWeight:700,marginBottom:8}}>معاينة الرسالة · واتساب</div>
              <pre style={{
                fontSize:12,color:"#111",fontFamily:"'IBM Plex Sans Arabic',sans-serif",whiteSpace:"pre-wrap",
                lineHeight:1.7,margin:0,direction:"rtl",textAlign:"right",
              }}>{buildPreArrivalMsg(preArrMdl.booking)}</pre>
            </div>

            {/* Warning if no phone */}
            {!preArrMdl.booking.phone&&(
              <div style={{background:"rgba(245,158,11,.1)",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#B45309",fontWeight:600,border:"1px solid rgba(245,158,11,.3)"}}>
                ⚠️ لم يتم إدخال رقم هاتف للضيف. يرجى تعديل الحجز أولاً.
              </div>
            )}

            {/* Actions */}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button className="btn bo" onClick={()=>setPreArrMdl(null)} style={{fontSize:13}}>إلغاء</button>
              <button onClick={async()=>{
                const msg=encodeURIComponent(buildPreArrivalMsg(preArrMdl.booking));
                const phone=preArrMdl.booking.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966")||"";
                window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");
                await db("bookings","PATCH",{pre_arrival_sent:true},preArrMdl.booking.id);
                await loadAll();
                setPreArrMdl(null);
              }} disabled={!preArrMdl.booking.phone} style={{
                background:"#1F8A4C",color:"#fff",border:"none",borderRadius:10,
                padding:"10px 22px",fontSize:14,cursor:preArrMdl.booking.phone?"pointer":"not-allowed",
                fontFamily:"'IBM Plex Sans Arabic',sans-serif",fontWeight:700,opacity:preArrMdl.booking.phone?1:.5,
              }}>إرسال واتساب 📲</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default AppWrapper;
