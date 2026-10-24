import { useState } from "react";
import { db, formatDate, nightsBetween } from "../lib/db";
import { Booking, MaintenanceRequest, WalletTransaction, Expense, FixedExpense } from "../lib/types";
import { B, S, T, TD, W, SA, SD, SI, SL, BD } from "../lib/colors";
import { BOOKING_STATUS } from "../lib/constants";
import { Bdg, SectionTitle, DataTable, Modal } from "./ui";
import MonthlyChart from "./MonthlyChart";
import { Icon, Pill, SAR, PageHead, Kpi, Seg, CardHead, Track, toneFor } from "./ds";

const FREQ_LABEL: Record<string,string> = { monthly:"شهري", quarterly:"ربع سنوي", yearly:"سنوي" };

interface Props {
  bookings:    Booking[];
  maintenance: MaintenanceRequest[];
  wallet:      WalletTransaction[];
  names:       string[];
  expenses?:   Expense[];
  fixedExpenses?: FixedExpense[];
  onAddExpense?: () => void;
  onAddMonthlyExpenses?: () => void;
  onAddFixedExpense?: () => void;
  onPayFixedExpense?: (fx: FixedExpense) => void;
  onEdit?:     (t: WalletTransaction) => void;
  onReload?:   () => void;
  /** إن حُدّد، الصفحة تُقفل على هذا الشاليه فقط — بدون اختيار شاليه أو مقارنة بين الشاليهات (وضع مالك/مدير الشاليه) */
  lockedChalet?: string;
}

type Period = "this_month" | "last_month" | "this_year" | "all" | "custom";
type CompareMode = "none" | "periods" | "chalets";

const PERIOD_LABELS: Record<Period, string> = {
  this_month: "هذا الشهر",
  last_month: "الشهر الماضي",
  this_year:  "هذا العام",
  all:        "كل الوقت",
  custom:     "مخصص",
};

const isRevenue = (b: { status: string }) => b.status === "completed" || b.status === "confirmed";

export default function FinancialTab({ bookings, maintenance, wallet, names, expenses = [], fixedExpenses = [], onAddExpense, onAddMonthlyExpenses, onAddFixedExpense, onPayFixedExpense, onEdit, onReload, lockedChalet }: Props) {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("this_month");
  const [fch, setFch]       = useState(lockedChalet || "الكل");
  const [cf, setCf]         = useState("");
  const [ct, setCt]         = useState("");
  const [compareMode, setCompareMode] = useState<CompareMode>("none");
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<null | "bookings" | "receivers" | "fixed" | "maint" | "expenses" | "insurance">(null);
  const [reportOpen, setReportOpen] = useState(false);

  const effFch = lockedChalet || fch;
  const canCompareChalets = !lockedChalet && names.length > 1;

  function getRange(p: Period) {
    const y = now.getFullYear(), m = now.getMonth();
    if (p === "this_month") return { from: new Date(y, m, 1),    to: new Date(y, m + 1, 0) };
    if (p === "last_month") return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
    if (p === "this_year")  return { from: new Date(y, 0, 1),     to: new Date(y, 11, 31) };
    if (p === "custom")     return { from: cf ? new Date(cf) : null, to: ct ? new Date(ct) : null };
    return { from: null, to: null };
  }
  function getPrevRange(): { from: Date; to: Date; label: string } | null {
    const y = now.getFullYear(), m = now.getMonth();
    if (period === "this_month") return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0),     label: "الشهر الماضي" };
    if (period === "last_month") return { from: new Date(y, m - 2, 1), to: new Date(y, m - 1, 0), label: "قبل الشهر الماضي" };
    if (period === "this_year")  return { from: new Date(y - 1, 0, 1), to: new Date(y - 1, 11, 31), label: "العام الماضي" };
    return null; // "كل الوقت" و"مخصص" ما لهم فترة سابقة محددة
  }

  const { from: rf, to: rt } = getRange(period);
  const byCh  = (item: { chalet: string }) => effFch === "الكل" || item.chalet === effFch;

  function computeStats(chFilter: (item: { chalet: string }) => boolean, from: Date | null, to: Date | null, allTime: boolean) {
    const inR = (d?: string) => {
      if (!d) return false;
      if (allTime) return true;
      const x = new Date(d);
      if (from && x < from) return false;
      if (to && x > to) return false;
      return true;
    };
    const b = bookings.filter(x => isRevenue(x) && chFilter(x) && inR(x.date_from));
    const m = maintenance.filter(x => Number(x.cost) > 0 && chFilter(x) && inR(x.maint_date));
    const e = expenses.filter(x => chFilter(x) && inR(x.expense_date));
    const w = wallet.filter(x => chFilter(x) && inR(x.trans_date) && x.type === "إيداع");
    const rev = b.reduce((s, x) => s + Number(x.price), 0);
    const mex = m.reduce((s, x) => s + Number(x.cost), 0);
    const exTotal = e.reduce((s, x) => s + Number(x.amount), 0);
    const insIn = w.reduce((s, x) => s + x.amount, 0);
    const nts = b.reduce((s, x) => s + nightsBetween(x.date_from, x.date_to), 0);
    return { bookings: b, maint: m, expenses: e, rev, mex, exTotal, insIn, net: rev - mex, trueNet: rev - mex - exTotal, nts, count: b.length };
  }

  const cur = computeStats(byCh, rf, rt, period === "all");
  const { bookings: fb, maint: fm, expenses: fex, rev, mex, exTotal, insIn, net, trueNet, nts } = cur;
  const ft = wallet.filter(t => byCh(t) && (period === "all" || (t.trans_date && (!rf || new Date(t.trans_date) >= rf) && (!rt || new Date(t.trans_date) <= rt))));
  const margin = rev > 0 ? Math.round(trueNet / rev * 100) : 0;
  const adr = nts > 0 ? Math.round(rev / nts) : 0;

  const fixedList = fixedExpenses.filter(fx => effFch === "الكل" || fx.chalet === effFch);
  const fixedActiveMonthly = fixedList.filter(fx => fx.frequency === "monthly" && fx.active).reduce((s, fx) => s + Number(fx.amount), 0);
  const thisYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const paidThisMonth = new Set(expenses.filter(e => e.expense_date?.startsWith(thisYM)).map(e => e.note));
  const unpaidFixedCount = fixedList.filter(fx => fx.active && !paidThisMonth.has(fx.name)).length;

  const receiverBreakdown = (() => {
    const map = new Map<string, { count: number; total: number }>();
    fb.forEach(b => {
      const name = b.received_by || "غير محدد";
      const cur = map.get(name) || { count: 0, total: 0 };
      cur.count += 1; cur.total += Number(b.price);
      map.set(name, cur);
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  })();

  const prevRange = getPrevRange();
  const prev = prevRange ? computeStats(byCh, prevRange.from, prevRange.to, false) : null;
  function delta(curV: number, prevV: number): number | null {
    if (!prevV) return null;
    return Math.round((curV - prevV) / Math.abs(prevV) * 100);
  }
  const DeltaChip = ({ v }: { v: number | null }) => v === null ? null : (
    <span style={{ fontSize: 11, fontWeight: 800, color: v >= 0 ? SD : "#A63A2A", background: v >= 0 ? "rgba(109,142,118,.12)" : "rgba(166,58,42,.1)", borderRadius: 6, padding: "1px 7px", marginRight: 6 }}>
      {v >= 0 ? "↑" : "↓"} {Math.abs(v)}%
    </span>
  );

  const csum = names.map(n => {
    const s = computeStats(item => item.chalet === n, rf, rt, period === "all");
    return { n, r: s.rev, e: s.mex, x: s.exTotal, net: s.trueNet };
  }).filter(c => c.r > 0 || c.e > 0 || c.x > 0);

  const plab = PERIOD_LABELS[period];

  // ── تقرير المصاريف الاحترافي: تصنيفات + نسبة لكل شاليه + أكبر البنود + توصيات آلية ──
  // دالة بدل ثوابت مباشرة: تُحسب فقط عند فتح التقرير فعلياً، لا في كل تصيير للصفحة
  function buildExpenseReport() {
    function categorizeSpend(expArr: Expense[], maintArr: MaintenanceRequest[]) {
      const map = new Map<string, number>();
      expArr.forEach(e => {
        // مصروف يدوي بفئة "صيانة" يُميَّز عن إجمالي جدول الصيانة الرسمي — تفادياً لخلط مصدرين مختلفين تحت نفس الاسم
        const key = e.category === "صيانة" ? "صيانة (مصروف إضافي)" : e.category;
        map.set(key, (map.get(key) || 0) + Number(e.amount));
      });
      const maintTotal = maintArr.reduce((s, m) => s + Number(m.cost), 0);
      if (maintTotal > 0) map.set("صيانة", (map.get("صيانة") || 0) + maintTotal);
      return map;
    }
    const totalSpend = exTotal + mex;
    const curCatMap = categorizeSpend(fex, fm);
    const prevCatMap = prev ? categorizeSpend(prev.expenses, prev.maint) : null;
    const catReport = Array.from(curCatMap.entries()).map(([cat, amt]) => {
      const prevAmt = prevCatMap?.get(cat) || 0;
      return {
        cat, amt,
        pctOfTotal: totalSpend > 0 ? Math.round(amt / totalSpend * 100) : 0,
        chg: prevCatMap && prevAmt > 0 ? Math.round((amt - prevAmt) / prevAmt * 100) : null,
        // تصنيف جديد كلياً هذه الفترة (لا وجود له في الفترة السابقة) — يُفقد لو اعتمدنا على chg فقط لأنه يبقى null
        isNew: !!prevCatMap && prevAmt === 0 && amt > 0,
      };
    }).sort((a, b) => b.amt - a.amt);

    const chaletSpend = csum.map(c => ({
      ...c,
      spend: c.e + c.x,
      ratio: c.r > 0 ? Math.round((c.e + c.x) / c.r * 100) : null,
    })).sort((a, b) => (b.ratio ?? 999) - (a.ratio ?? 999));

    const largestItems = [
      ...fex.map(e => ({ label: e.category + (e.note ? " — " + e.note : ""), chalet: e.chalet, amount: Number(e.amount), date: e.expense_date })),
      ...fm.map(m => ({ label: "صيانة — " + m.issue, chalet: m.chalet, amount: Number(m.cost), date: m.maint_date })),
    ].sort((a, b) => b.amount - a.amount).slice(0, 6);

    // عدد الأشهر التي تغطيها الفترة المحددة — لمقارنة الالتزامات الثابتة (مبلغ شهري) بإيراد الفترة بشكل صحيح
    const periodMonths = period === "this_month" || period === "last_month" ? 1
      : period === "this_year" ? 12
      : rf && rt ? Math.max(1, Math.round((rt.getTime() - rf.getTime()) / (30 * 86400000)))
      : null; // "كل الوقت" — لا مدة محددة، يُتجاهل هذا المؤشر

    const spendInsights: { icon: string; text: string; level: "warn" | "good" }[] = [];
    catReport.forEach(c => {
      if (c.isNew && c.amt >= 200) {
        spendInsights.push({ icon: "🆕", level: "warn", text: `تصنيف "${c.cat}" جديد تماماً هذه الفترة (${c.amt.toLocaleString("en-US")} ر) ولم يكن موجوداً في ${prevRange?.label || "الفترة السابقة"} — تأكد أنه متوقَّع.` });
      } else if (c.chg !== null && c.chg >= 30 && c.amt >= 200) {
        spendInsights.push({ icon: "🔺", level: "warn", text: `تصنيف "${c.cat}" ارتفع ${c.chg}% مقارنة بـ${prevRange?.label || "الفترة السابقة"} (${c.amt.toLocaleString("en-US")} ر) — يستحق المراجعة.` });
      }
    });
    chaletSpend.forEach(c => {
      if (c.r === 0 && c.spend > 0) {
        spendInsights.push({ icon: "⚠️", level: "warn", text: `${c.n}: صُرف ${c.spend.toLocaleString("en-US")} ر بدون أي إيرادات في ${plab} — تحقق من السبب.` });
      } else if (c.ratio !== null && c.ratio >= 50) {
        spendInsights.push({ icon: "🏠", level: "warn", text: `${c.n}: المصاريف تلتهم ${c.ratio}% من إيراداته — راجع التكاليف أو أسعار الحجز لهذا الشاليه.` });
      }
    });
    if (periodMonths && rev > 0) {
      const fixedForPeriod = fixedActiveMonthly * periodMonths;
      if (fixedForPeriod / rev >= 0.3) {
        spendInsights.push({ icon: "📌", level: "warn", text: `الالتزامات الثابتة (${fixedForPeriod.toLocaleString("en-US")} ر خلال ${plab}) تمثل ${Math.round(fixedForPeriod / rev * 100)}% من الإيرادات — فكر بإعادة التفاوض على العقود الثابتة.` });
      }
    }
    if (rev > 0 && mex / rev >= 0.15) {
      spendInsights.push({ icon: "🔧", level: "warn", text: `تكاليف الصيانة مرتفعة نسبياً (${Math.round(mex / rev * 100)}% من الإيرادات) — فكر بخطة صيانة وقائية لتقليل الأعطال الطارئة.` });
    }
    if (spendInsights.length === 0) {
      spendInsights.push({ icon: "✅", level: "good", text: "لا توجد مشاكل واضحة في نمط المصاريف الحالي — استمر على نفس المستوى." });
    }

    return { totalSpend, catReport, chaletSpend, largestItems, spendInsights };
  }

  function exportCSV() {
    const rows: string[][] = [];
    const h = (s: string) => `"${s}"`;

    rows.push(["نوع", "التاريخ", "الشاليه", "الضيف/الوصف", "المبلغ (ريال)", "الملاحظات"]);

    fb.forEach(b => rows.push([
      "إيراد حجز",
      b.date_from || "",
      b.chalet,
      b.guest,
      String(Number(b.price)),
      b.note || "",
    ]));

    fm.forEach(m => rows.push([
      "مصروف صيانة",
      m.maint_date || "",
      m.chalet,
      m.issue,
      String(Number(m.cost)),
      m.note || "",
    ]));

    fex.forEach(e => rows.push([
      "مصروف متنوع",
      (e as Record<string,unknown>).expense_date as string || "",
      e.chalet || "",
      e.description || "",
      String(Number(e.amount)),
      e.note || "",
    ]));

    const csv = rows.map(r => r.map(h).join(",")).join("\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `ريتام-مالية-${plab}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function sendInvestorReport() {
    const lines = [
      `📊 *تقرير صافي الأرباح — مجموعة ريتام*`,
      `🗓️ الفترة: ${plab}`,
      ``,
      `🏠 *تفصيل حسب الشاليه:*`,
      ...csum.map(c =>
        `• ${c.n}: إيرادات ${c.r.toLocaleString("en-US")} ر — صيانة ${c.e.toLocaleString("en-US")} ر — *صافي ${c.net.toLocaleString("en-US")} ر*`
      ),
      ``,
      `────────────`,
      `💵 إجمالي الإيرادات: ${rev.toLocaleString("en-US")} ر`,
      `🔧 تكاليف الصيانة: ${mex.toLocaleString("en-US")} ر`,
      `💸 مصاريف أخرى: ${exTotal.toLocaleString("en-US")} ر`,
      `📈 *صافي الربح الإجمالي: ${trueNet.toLocaleString("en-US")} ر*`,
      ``,
      `_تقرير آلي من نظام إدارة ريتام_`,
    ];
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  // أرقام سالبة داخل صفحة RTL تحتاج اتجاه LTR صريح، وإلا تنعكس إشارة السالب بصرياً
  const Money = ({ value, size, color }: { value: number; size?: number; color?: string }) => (
    <span dir="ltr" style={{ fontSize:size, color, whiteSpace:"nowrap" }}>
      {value<0?"−":""}{Math.abs(value).toLocaleString("en-US")} <span style={{fontSize: size?size*0.7:11, opacity:.6}}>ر</span>
    </span>
  );

  const DetailRow = ({ icon, label, sub, badge, value, valueColor, onClick }: { icon: string; label: string; sub: string; badge?: React.ReactNode; value: number; valueColor?: string; onClick: () => void }) => (
    <button onClick={onClick} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", background:"none", border:"none", padding:"13px 2px", cursor:"pointer", textAlign:"right", fontFamily:"'IBM Plex Sans Arabic',sans-serif" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
        <div style={{ fontSize:18, width:36, height:36, borderRadius:10, background:SL, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{icon}</div>
        <div style={{ textAlign:"right", minWidth:0 }}>
          <div style={{ fontSize:13.5, fontWeight:700, color:B }}>{label}</div>
          <div style={{ fontSize:11, color:SI, marginTop:2 }}>{sub}{badge}</div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
        <span style={{ fontSize:14.5, fontWeight:800, color:valueColor||B }}><Money value={value}/></span>
        <span style={{ fontSize:16, color:SI }}>‹</span>
      </div>
    </button>
  );

  const StatementRow = ({ label, value, sub, bold }: { label: string; value: number; sub?: string; bold?: boolean }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding: bold?"10px 0 0":"6px 0", borderTop: bold?`1.5px solid rgba(201,163,106,.3)`:"none" }}>
      <span style={{ fontSize: bold?14:13, fontWeight: bold?800:500, color: bold?B:T }}>{label}{sub&&<span style={{fontSize:11,color:SI,marginRight:6}}>{sub}</span>}</span>
      <span style={{ fontSize: bold?16:13, fontWeight: bold?900:700, color:B }}>
        <Money value={value}/>
      </span>
    </div>
  );

  // الليالي المتاحة في الفترة (لحساب الإشغال والعائد لكل ليلة متاحة)
  const scopeCount = effFch === "الكل" ? names.length : 1;
  const rangeDays = rf && rt ? Math.max(1, Math.round((rt.getTime() - rf.getTime()) / 86400000) + 1) : 0;
  const availNights = scopeCount * rangeDays;
  const occPct = availNights > 0 ? Math.round(nts / availNights * 100) : null;
  const revpar = availNights > 0 ? Math.round(rev / availNights) : null;
  const expRatio = rev > 0 ? Math.round((mex + exTotal) / rev * 100) : null;
  const unassigned = receiverBreakdown.find(r => r.name === "غير محدد");

  const actions = [
    { l:"تقرير المصاريف", i:"receipt", fn:()=>setReportOpen(true) },
    { l:"تصدير Excel", i:"download", fn:exportCSV },
    { l:"تقرير المستثمرين", i:"send", fn:sendInvestorReport },
    ...(onAddFixedExpense?[{ l:"مصروف ثابت", i:"plus", fn:onAddFixedExpense }]:[]),
  ];

  return (
    <div className="x-page">
      <PageHead title={lockedChalet ? "المالية · " + lockedChalet : "المالية"} sub="قائمة الدخل والمؤشرات الأساسية">
        {actions.map((a,i)=><button key={i} className="btn bo" onClick={a.fn}><Icon n={a.i}/>{a.l}</button>)}
        {onAddMonthlyExpenses && <button className="btn bo" onClick={onAddMonthlyExpenses}><Icon n="home"/>مصاريف الشاليه الشهرية</button>}
        {onAddExpense && <button className="btn bp" onClick={onAddExpense}><Icon n="plus"/>إضافة مصروف</button>}
      </PageHead>

      <div className="x-toolbar">
        <Seg label="الفترة" value={period} onChange={v => setPeriod(v)} options={(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([v,l])=>({v,l}))}/>
        {!lockedChalet && (
          <select className="x-select" aria-label="الشاليه" value={fch} onChange={e => setFch(e.target.value)}>
            <option value="الكل">كل الشاليهات</option>
            {names.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {period === "custom" && (
          <>
            <input className="x-select" type="date" aria-label="من" value={cf} onChange={e => setCf(e.target.value)}/>
            <input className="x-select" type="date" aria-label="إلى" value={ct} onChange={e => setCt(e.target.value)}/>
          </>
        )}
      </div>

      <div className="x-grid2">
        <div className="x-card x-pad">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:4, flexWrap:"wrap" }}>
            <h2 style={{ fontFamily:"var(--f-body)", fontSize:16, fontWeight:700, display:"flex", alignItems:"center", gap:10 }}><Icon n="receipt" style={{ color:"var(--link)" }}/>{"قائمة الدخل · " + plab}</h2>
            {rev > 0 && <Pill tone={margin >= 40 ? "ok" : margin >= 0 ? "warn" : "bad"}>{"هامش " + margin + "%"}</Pill>}
          </div>
          <div className="x-stmt">
            <div className="r"><span className="lab">إيرادات الحجوزات<small>{nts.toLocaleString("en-US") + " ليلة · " + fb.length + " حجز"}</small></span><b><SAR v={rev} unit={false}/></b></div>
            <div className="r"><span className="lab">تكاليف الصيانة<small>{fm.length + " عملية"}</small></span><b className="x-neg"><SAR v={-mex} unit={false}/></b></div>
            <div className="r"><span className="lab">المصاريف التشغيلية<small>{fex.length + " مصروف (ثابتة مدفوعة ومتنوعة)"}</small></span><b className="x-neg"><SAR v={-exTotal} unit={false}/></b></div>
            <div className="r total"><span>صافي الربح</span><span className={trueNet < 0 ? "x-neg" : "x-pos"}><SAR v={trueNet}/></span></div>
          </div>
          {prev && prevRange && prev.rev > 0 && (
            <p className="x-muted" style={{ fontSize:13, marginTop:12 }}>
              {"مقارنة بـ" + prevRange.label + ": الإيرادات "}<DeltaChip v={delta(rev, prev.rev)}/>{" · الصافي "}<DeltaChip v={delta(trueNet, prev.trueNet)}/>
            </p>
          )}
        </div>
        <div className="x-kpis" style={{ gridTemplateColumns:"repeat(2,minmax(0,1fr))", alignContent:"start" }}>
          <Kpi c="blue" label="متوسط سعر الليلة" value={<SAR v={adr}/>}/>
          <Kpi c="teal" label="العائد لكل ليلة متاحة" value={revpar === null ? "—" : <SAR v={revpar}/>}/>
          <Kpi c={occPct===null?undefined:occPct>=60?"green":occPct>=40?"amber":"red"} label="نسبة الإشغال" value={occPct === null ? "—" : <>{occPct}<small>%</small></>}>{occPct !== null && <Track pct={occPct} tone={toneFor(occPct)}/>}</Kpi>
          <Kpi c={expRatio===null?undefined:expRatio>60?"red":expRatio>40?"amber":"green"} label="المصاريف ÷ الإيرادات" value={expRatio === null ? "—" : <>{expRatio}<small>%</small></>} tone={expRatio !== null && expRatio > 60 ? "neg" : undefined}/>
        </div>
      </div>

      {prev && prevRange && (prev.rev > 0 || prev.mex > 0 || prev.exTotal > 0) && (
        <div className="x-card">
          <CardHead icon="trend" title={plab + " مقابل " + prevRange.label}/>
          <div className="tbl-wrap"><table className="x-tbl">
            <thead><tr><th>البند</th><th>{plab}</th><th>{prevRange.label}</th><th>التغيّر</th></tr></thead>
            <tbody>
              {[
                { l:"الإيرادات", c:rev, p:prev.rev },
                { l:"تكاليف الصيانة", c:mex, p:prev.mex },
                { l:"المصاريف التشغيلية", c:exTotal, p:prev.exTotal },
                { l:"صافي الربح", c:trueNet, p:prev.trueNet, bold:true },
              ].map((row,i)=>(
                <tr key={i}>
                  <td className={row.bold ? "strong" : ""}>{row.l}</td>
                  <td className={row.bold ? "strong" : ""}><SAR v={row.c} unit={false}/></td>
                  <td className="x-muted"><SAR v={row.p} unit={false}/></td>
                  <td><DeltaChip v={delta(row.c,row.p)}/></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {canCompareChalets && csum.length > 0 && (
        <div className="x-card">
          <CardHead icon="home" title="ربحية كل شاليه" sub="مرتبة من الأعلى صافياً"/>
          <div className="tbl-wrap"><table className="x-tbl">
            <thead><tr><th>الشاليه</th><th>الإيرادات</th><th>المصاريف</th><th>الصافي</th><th>هامش الربح</th></tr></thead>
            <tbody>
              {[...csum].sort((a,b)=>b.net-a.net).map((c, i) => {
                const m = c.r > 0 ? Math.round(c.net / c.r * 100) : null;
                return (
                  <tr key={i}>
                    <td className="strong">{c.n}</td>
                    <td><SAR v={c.r} unit={false}/></td>
                    <td><SAR v={c.e + c.x} unit={false}/></td>
                    <td className={"strong " + (c.net < 0 ? "x-neg" : "x-pos")}><SAR v={c.net} unit={false}/></td>
                    <td>{m === null ? <Pill tone="bad">بدون إيراد</Pill> : <Pill tone={m >= 50 ? "ok" : m >= 0 ? "warn" : "bad"}>{m + "%"}</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td>الإجمالي</td><td><SAR v={rev} unit={false}/></td><td><SAR v={mex + exTotal} unit={false}/></td><td className={trueNet < 0 ? "x-neg" : "x-pos"}><SAR v={trueNet} unit={false}/></td><td>{margin + "%"}</td></tr></tfoot>
          </table></div>
        </div>
      )}

      <div className="x-grid2">
        <MonthlyChart
          bookings={bookings.filter(byCh)}
          expenses={expenses.filter(byCh)}
          maint={maintenance.filter(byCh)}
          B={B} T={T} SI={SI} SL={SL}
        />
        <div className="x-card">
          <CardHead icon="receipt" title="التفاصيل" sub="اضغط على أي بند لعرض سجله"/>
          <div className="x-list">
            {[
              { key:"bookings" as const, icon:"cal", tone:"ok", label:"إيرادات الحجوزات", sub:fb.length+" حجز", value:rev, show:true },
              { key:"receivers" as const, icon:"users", tone:unassigned?"bad":"muted", label:"حسب المستلم", sub:receiverBreakdown.length+" شخص"+(unassigned?" · "+unassigned.count+" بدون مستلم":""), value:rev, show:fb.length>0 },
              { key:"fixed" as const, icon:"receipt", tone:unpaidFixedCount>0?"warn":"muted", label:"المصروفات الثابتة (شهرياً)", sub:fixedList.length+" بند"+(unpaidFixedCount>0?" · "+unpaidFixedCount+" لم يُسدَّد":""), value:fixedActiveMonthly, show:fixedList.length>0 },
              { key:"maint" as const, icon:"wrench", tone:"muted", label:"تكاليف الصيانة", sub:fm.length+" عملية", value:mex, show:fm.length>0 },
              { key:"expenses" as const, icon:"money", tone:"muted", label:"المصاريف", sub:fex.length+" مصروف", value:exTotal, show:fex.length>0 },
              { key:"insurance" as const, icon:"shield", tone:"muted", label:"معاملات التأمين", sub:ft.length+" معاملة", value:insIn, show:ft.length>0 },
            ].filter(r=>r.show).map(r=>(
              <button key={r.key} type="button" className="x-li click" style={{ background:"none", border:0, borderBottom:"1px solid var(--line)", width:"100%", textAlign:"right", fontFamily:"var(--f-body)" }} onClick={()=>setDetailModal(r.key)}>
                <div className={"x-ic " + r.tone}><Icon n={r.icon}/></div>
                <div className="meta"><b>{r.label}</b><span>{r.sub}</span></div>
                <span className="amt"><SAR v={r.value}/></span>
                <Icon n="chev" s={16} style={{ color:"var(--text3)" }}/>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* إيرادات الحجوزات */}
      {detailModal==="bookings" && (
        <Modal title={"💵 إيرادات الحجوزات (" + fb.length + ")"} onClose={()=>setDetailModal(null)}>
          {fb.length === 0
            ? <div style={{ padding:24, textAlign:"center", color:SI }}>لا توجد حجوزات في هذه الفترة</div>
            : <DataTable heads={["الضيف","الشاليه","الفترة","الليالي","المبلغ","استلم المبلغ","الحالة"]}
                rows={fb.map(b => (
                  <tr key={b.id}>
                    <td data-label="الضيف" style={{ fontWeight:600 }}>{b.guest}</td>
                    <td data-label="الشاليه">{b.chalet}</td>
                    <td data-label="الفترة" style={{ fontSize:12 }}>{formatDate(b.date_from) + " - " + formatDate(b.date_to)}</td>
                    <td data-label="الليالي" style={{ textAlign:"center" }}>{nightsBetween(b.date_from, b.date_to)}</td>
                    <td data-label="المبلغ" style={{ fontWeight:700, color:T }}>{Number(b.price).toLocaleString("en-US") + " ر"}</td>
                    <td data-label="استلم المبلغ" style={{ fontSize:12, color:b.received_by?B:SI }}>{b.received_by || "-"}</td>
                    <td data-label="الحالة"><Bdg bg={BOOKING_STATUS[b.status]?.bg||"#eee"} color={BOOKING_STATUS[b.status]?.color||"#333"}>{BOOKING_STATUS[b.status]?.label||b.status}</Bdg></td>
                  </tr>
                ))}
                footer={[
                  <td key={0} colSpan={4} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
                  <td key={1} style={{ fontWeight:800, color:T, fontSize:15 }}>{rev.toLocaleString("en-US") + " ر"}</td>,
                  <td key={2}/>, <td key={3}/>,
                ]}
              />
          }
        </Modal>
      )}

      {/* حسب المستلم */}
      {detailModal==="receivers" && (
        <Modal title={"👥 الإيرادات حسب المستلم (" + plab + ")"} onClose={()=>setDetailModal(null)}>
          <DataTable heads={["المستلم","عدد الحجوزات","المبلغ"]}
            rows={receiverBreakdown.map((r,i) => (
              <tr key={i}>
                <td data-label="المستلم" style={{ fontWeight:700, color: r.name==="غير محدد"?"#A63A2A":B }}>{r.name}</td>
                <td data-label="عدد الحجوزات" style={{ textAlign:"center" }}>{r.count}</td>
                <td data-label="المبلغ" style={{ fontWeight:700, color:T }}>{r.total.toLocaleString("en-US") + " ر"}</td>
              </tr>
            ))}
            footer={[
              <td key={0} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
              <td key={1} style={{ textAlign:"center", fontWeight:800, color:B }}>{fb.length}</td>,
              <td key={2} style={{ fontWeight:800, color:T, fontSize:15 }}>{rev.toLocaleString("en-US") + " ر"}</td>,
            ]}
          />
        </Modal>
      )}

      {/* المصروفات الثابتة */}
      {detailModal==="fixed" && (
        <Modal title={"📌 المصروفات الثابتة · شهري " + fixedActiveMonthly.toLocaleString("en-US") + " ر"} onClose={()=>setDetailModal(null)}>
          <DataTable heads={["الشاليه","المصروف","الفئة","التكرار","المبلغ","الحالة","إجراءات"]}
            rows={fixedList.map(fx => {
              const paid = paidThisMonth.has(fx.name);
              return (
                <tr key={fx.id} style={{ opacity: fx.active ? 1 : 0.5 }}>
                  <td data-label="الشاليه" style={{ fontWeight:600 }}>{fx.chalet}</td>
                  <td data-label="المصروف" style={{ fontWeight:700 }}>{fx.name}</td>
                  <td data-label="الفئة"><Bdg bg="#EDE9FE" color="#5B21B6">{fx.category}</Bdg></td>
                  <td data-label="التكرار"><Bdg bg="#F3F4F6" color="#374151">{FREQ_LABEL[fx.frequency]||fx.frequency}</Bdg></td>
                  <td data-label="المبلغ" style={{ fontWeight:800, color:"#7C3AED" }}>{Number(fx.amount).toLocaleString("en-US") + " ر"}</td>
                  <td data-label="الحالة">
                    {!fx.active
                      ? <Bdg bg="#F3F4F6" color="#6B7280">موقف</Bdg>
                      : paid
                        ? <Bdg bg="#DCFCE7" color="#166534">✓ مدفوع</Bdg>
                        : <Bdg bg="#FEF3C7" color="#92400E">⚠ لم يُسدَّد</Bdg>
                    }
                  </td>
                  <td data-label="">
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {!paid && fx.active && (
                        <button className="btn bsm" onClick={() => onPayFixedExpense?.(fx)}
                          style={{ background:"#059669", color:"#fff", padding:"5px 10px", fontSize:12 }}>✓ تسديد</button>
                      )}
                      <button className="btn bsm" onClick={async () => { await db("fixed_expenses","PATCH",{active:!fx.active},fx.id); onReload?.(); }}
                        style={{ background: fx.active ? "#FBEDEA" : "#E6F1EA", color: fx.active ? "#A63A2A" : "#3D7A5A", padding:"5px 10px", fontSize:12 }}>
                        {fx.active ? "إيقاف" : "تفعيل"}
                      </button>
                      <button className="btn bd bsm" onClick={async () => { if(window.confirm("حذف هذا المصروف الثابت؟")){await db("fixed_expenses","DELETE",null,fx.id); onReload?.();} }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          />
        </Modal>
      )}

      {/* تكاليف الصيانة */}
      {detailModal==="maint" && (
        <Modal title={"🔧 تكاليف الصيانة (" + fm.length + ")"} onClose={()=>setDetailModal(null)}>
          <DataTable heads={["الشاليه","المشكلة","التاريخ","التكلفة"]}
            rows={fm.map(m => (
              <tr key={m.id}>
                <td data-label="الشاليه" style={{ fontWeight:600 }}>{m.chalet}</td>
                <td data-label="المشكلة">{m.issue}</td>
                <td data-label="التاريخ">{formatDate(m.maint_date)}</td>
                <td data-label="التكلفة" style={{ fontWeight:700, color:"#A63A2A" }}>{Number(m.cost).toLocaleString("en-US") + " ر"}</td>
              </tr>
            ))}
            footer={[
              <td key={0} colSpan={3} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
              <td key={1} style={{ fontWeight:800, color:"#A63A2A", fontSize:15 }}>{mex.toLocaleString("en-US") + " ر"}</td>,
            ]}
          />
        </Modal>
      )}

      {/* المصاريف */}
      {detailModal==="expenses" && (()=>{
        const groups = (()=>{
          const map = new Map<string, Expense[]>();
          [...fex].reverse().forEach(e => {
            const k = e.chalet || "عام";
            (map.get(k) || map.set(k, []).get(k)!).push(e);
          });
          return Array.from(map.entries())
            .map(([chalet, items]) => ({ chalet, items, total: items.reduce((s,e)=>s+Number(e.amount),0) }))
            .sort((a,b)=>b.total-a.total);
        })();
        return (
        <Modal title={"💸 المصاريف (" + fex.length + ") · " + exTotal.toLocaleString("en-US") + " ر"} onClose={()=>setDetailModal(null)}>
          <DataTable heads={["التاريخ","الفئة","المبلغ","ملاحظة","حذف"]}
            rows={groups.flatMap(g => [
              <tr key={"h-"+g.chalet} style={{ background:SL }}>
                <td colSpan={5} style={{ padding:"10px 8px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                    <span style={{ fontWeight:800, color:B, fontSize:13 }}>{g.chalet} <span style={{ fontWeight:600, color:SI, fontSize:11.5 }}>({g.items.length} مصروف)</span></span>
                    <span style={{ fontWeight:900, color:"#A63A2A", fontSize:13.5 }}>{g.total.toLocaleString("en-US")} ر</span>
                  </div>
                </td>
              </tr>,
              ...g.items.map((e, i) => (
                <tr key={g.chalet+"-"+i}>
                  <td data-label="التاريخ" style={{ fontSize:12 }}>{formatDate(e.expense_date)}</td>
                  <td data-label="الفئة"><Bdg bg="#FEF3C7" color="#92400E">{e.category}</Bdg></td>
                  <td data-label="المبلغ" style={{ fontWeight:700, color:"#A63A2A" }}>{Number(e.amount).toLocaleString("en-US") + " ر"}</td>
                  <td data-label="ملاحظة" style={{ color:T, fontSize:12 }}>{e.note || "-"}</td>
                  <td data-label=""><button className="btn bd bsm" onClick={async () => { await db("expenses","DELETE",null,e.id); onReload?.(); }}>🗑️</button></td>
                </tr>
              )),
            ])}
            footer={[
              <td key={0} colSpan={2} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
              <td key={1} style={{ fontWeight:800, color:"#A63A2A", fontSize:15 }}>{exTotal.toLocaleString("en-US") + " ر"}</td>,
              <td key={2}/>, <td key={3}/>,
            ]}
          />
        </Modal>
        );
      })()}

      {/* معاملات التأمين */}
      {detailModal==="insurance" && (
        <Modal title={"🛡️ معاملات التأمين (" + ft.length + ")"} onClose={()=>setDetailModal(null)}>
          <DataTable heads={["التاريخ","الشاليه","النوع","المبلغ","ملاحظة","إجراءات"]}
            rows={[...ft].reverse().map((t, i) => (
              <tr key={i}>
                <td data-label="التاريخ">{formatDate(t.trans_date)}</td>
                <td data-label="الشاليه" style={{ fontWeight:600 }}>{t.chalet}</td>
                <td data-label="النوع"><Bdg bg={t.type==="إيداع"?"#E6F1EA":"#FBEDEA"} color={t.type==="إيداع"?SD:"#A63A2A"}>{t.type}</Bdg></td>
                <td data-label="المبلغ" style={{ fontWeight:700, color:t.type==="إيداع"?T:"#A63A2A" }}><span dir="ltr" style={{whiteSpace:"nowrap"}}>{t.type==="إيداع"?"+":"−"}{t.amount.toLocaleString("en-US")} ر</span></td>
                <td data-label="ملاحظة" style={{ color:T, fontSize:12 }}>{t.note || "-"}</td>
                <td data-label="">
                  <div style={{ display:"flex", gap:4 }}>
                    <button className="btn be bsm" onClick={() => onEdit?.(t)}>تعديل</button>
                    <button className="btn bd bsm" onClick={async () => { if (window.confirm("حذف هذا الصف؟")) { await db("wallet","DELETE",null,t.id); onReload?.(); } }}>حذف</button>
                  </div>
                </td>
              </tr>
            ))}
          />
        </Modal>
      )}

      {/* تقرير المصاريف الاحترافي */}
      {reportOpen && (()=>{
        const { totalSpend, catReport, chaletSpend, largestItems, spendInsights } = buildExpenseReport();
        return (
        <Modal title={"📋 تقرير المصاريف الاحترافي · " + plab + (effFch !== "الكل" ? " · " + effFch : "")} onClose={()=>setReportOpen(false)}>
          {/* ملخص الإجمالي */}
          <div style={{ background:SL, borderRadius:12, padding:"14px 16px", marginBottom:18, border:"1px solid rgba(201,163,106,.25)" }}>
            <div style={{ fontSize:11, color:T, fontWeight:700, marginBottom:4 }}>إجمالي المصاريف (ثابتة مدفوعة + صيانة + متنوعة)</div>
            <div style={{ fontSize:26, fontWeight:900, color:"#A63A2A" }}><Money value={totalSpend} size={26}/></div>
            {prev && prevRange && (
              <div style={{ fontSize:11, color:T, marginTop:4 }}>
                مقابل {prevRange.label}: {(prev.exTotal+prev.mex).toLocaleString("en-US")} ر
                {(prev.exTotal+prev.mex) > 0 && (
                  <span style={{ marginRight:6, fontWeight:800, color: totalSpend > (prev.exTotal+prev.mex) ? "#A63A2A" : SD }}>
                    {totalSpend > (prev.exTotal+prev.mex) ? "↑" : "↓"} {Math.abs(Math.round((totalSpend-(prev.exTotal+prev.mex))/(prev.exTotal+prev.mex)*100))}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* التوصيات */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontWeight:800, color:B, fontSize:14, marginBottom:10 }}>🔍 التوصيات</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {spendInsights.map((ins, i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", borderRadius:10,
                  background: ins.level==="warn" ? "#FEF3C7" : "#DCFCE7",
                  borderRight: `3px solid ${ins.level==="warn" ? "#B45309" : "#166534"}`,
                }}>
                  <span style={{ fontSize:15, flexShrink:0 }}>{ins.icon}</span>
                  <span style={{ fontSize:12.5, color: ins.level==="warn" ? "#7C4A0A" : "#14532D", fontWeight:600, lineHeight:1.6 }}>{ins.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* التصنيفات الأعلى إنفاقاً */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontWeight:800, color:B, fontSize:14, marginBottom:10 }}>📊 التصنيفات الأعلى إنفاقاً</div>
            {catReport.length===0
              ? <div style={{ padding:16, textAlign:"center", color:SI, fontSize:12 }}>لا توجد مصاريف في هذه الفترة</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {catReport.map((c,i) => (
                    <div key={i}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
                        <span style={{ fontSize:12.5, fontWeight:700, color:B }}>
                          {c.cat}
                          {c.isNew && (
                            <span style={{ fontSize:10.5, fontWeight:800, marginRight:6, color:"#A63A2A" }}>🆕 جديد</span>
                          )}
                          {!c.isNew && c.chg !== null && (
                            <span style={{ fontSize:10.5, fontWeight:800, marginRight:6, color: c.chg>=0?"#A63A2A":SD }}>
                              {c.chg>=0?"↑":"↓"} {Math.abs(c.chg)}%
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize:12.5, fontWeight:800, color:"#A63A2A" }}>{c.amt.toLocaleString("en-US")} ر <span style={{ color:SI, fontWeight:600 }}>({c.pctOfTotal}%)</span></span>
                      </div>
                      <div style={{ background:"#f1f5f9", borderRadius:99, height:6, overflow:"hidden" }}>
                        <div style={{ width:c.pctOfTotal+"%", height:"100%", background:"#C97B63", borderRadius:99 }}/>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* نسبة المصاريف إلى الإيرادات لكل شاليه */}
          {!lockedChalet && chaletSpend.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontWeight:800, color:B, fontSize:14, marginBottom:10 }}>🏠 نسبة المصاريف إلى الإيرادات — لكل شاليه</div>
              <DataTable heads={["الشاليه","الإيرادات","المصاريف","النسبة"]}
                rows={chaletSpend.map((c,i) => (
                  <tr key={i}>
                    <td data-label="الشاليه" style={{ fontWeight:700 }}>{c.n}</td>
                    <td data-label="الإيرادات" style={{ color:T }}>{c.r.toLocaleString("en-US")+" ر"}</td>
                    <td data-label="المصاريف" style={{ color:"#A63A2A" }}>{c.spend.toLocaleString("en-US")+" ر"}</td>
                    <td data-label="النسبة">
                      {c.ratio===null
                        ? <span style={{ fontSize:11, fontWeight:700, color:"#A63A2A" }}>بدون إيراد ⚠️</span>
                        : <span style={{ fontSize:11, fontWeight:800, color: c.ratio>=50?"#A63A2A":c.ratio>=30?"#92400E":SD }}>{c.ratio}%</span>
                      }
                    </td>
                  </tr>
                ))}
              />
            </div>
          )}

          {/* أكبر المصاريف الفردية */}
          <div>
            <div style={{ fontWeight:800, color:B, fontSize:14, marginBottom:10 }}>🔝 أكبر المصاريف الفردية</div>
            {largestItems.length===0
              ? <div style={{ padding:16, textAlign:"center", color:SI, fontSize:12 }}>لا توجد مصاريف في هذه الفترة</div>
              : <DataTable heads={["البند","الشاليه","التاريخ","المبلغ"]}
                  rows={largestItems.map((it,i) => (
                    <tr key={i}>
                      <td data-label="البند" style={{ fontWeight:600, fontSize:12 }}>{it.label}</td>
                      <td data-label="الشاليه">{it.chalet}</td>
                      <td data-label="التاريخ" style={{ fontSize:12 }}>{formatDate(it.date)}</td>
                      <td data-label="المبلغ" style={{ fontWeight:800, color:"#A63A2A" }}>{it.amount.toLocaleString("en-US")+" ر"}</td>
                    </tr>
                  ))}
                />
            }
          </div>
        </Modal>
        );
      })()}
    </div>
  );
}
