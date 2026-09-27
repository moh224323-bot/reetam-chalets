import { useState } from "react";
import { db, formatDate, nightsBetween } from "../lib/db";
import { Booking, MaintenanceRequest, WalletTransaction, Expense, FixedExpense } from "../lib/types";
import { B, S, T, TD, W, SA, SD, SI, SL, BD } from "../lib/colors";
import { BOOKING_STATUS } from "../lib/constants";
import { Bdg, SectionTitle, DataTable } from "./ui";
import MonthlyChart from "./MonthlyChart";

const FREQ_LABEL: Record<string,string> = { monthly:"شهري", quarterly:"ربع سنوي", yearly:"سنوي" };

interface Props {
  bookings:    Booking[];
  maintenance: MaintenanceRequest[];
  wallet:      WalletTransaction[];
  names:       string[];
  expenses?:   Expense[];
  fixedExpenses?: FixedExpense[];
  onAddExpense?: () => void;
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

export default function FinancialTab({ bookings, maintenance, wallet, names, expenses = [], fixedExpenses = [], onAddExpense, onAddFixedExpense, onPayFixedExpense, onEdit, onReload, lockedChalet }: Props) {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("this_month");
  const [fch, setFch]       = useState(lockedChalet || "الكل");
  const [cf, setCf]         = useState("");
  const [ct, setCt]         = useState("");
  const [compareMode, setCompareMode] = useState<CompareMode>("none");
  const [menuOpen, setMenuOpen] = useState(false);

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

  const prevRange = getPrevRange();
  const prev = prevRange ? computeStats(byCh, prevRange.from, prevRange.to, false) : null;
  function delta(curV: number, prevV: number): number | null {
    if (!prevV) return null;
    return Math.round((curV - prevV) / Math.abs(prevV) * 100);
  }
  const DeltaChip = ({ v }: { v: number | null }) => v === null ? null : (
    <span style={{ fontSize: 11, fontWeight: 800, color: v >= 0 ? SD : "#8B3A3A", background: v >= 0 ? "rgba(109,142,118,.12)" : "rgba(139,58,58,.1)", borderRadius: 6, padding: "1px 7px", marginRight: 6 }}>
      {v >= 0 ? "↑" : "↓"} {Math.abs(v)}%
    </span>
  );

  const csum = names.map(n => {
    const s = computeStats(item => item.chalet === n, rf, rt, period === "all");
    return { n, r: s.rev, e: s.mex, x: s.exTotal, net: s.trueNet };
  }).filter(c => c.r > 0 || c.e > 0 || c.x > 0);

  const plab = PERIOD_LABELS[period];

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
        `• ${c.n}: إيرادات ${c.r.toLocaleString()} ر — صيانة ${c.e.toLocaleString()} ر — *صافي ${c.net.toLocaleString()} ر*`
      ),
      ``,
      `────────────`,
      `💵 إجمالي الإيرادات: ${rev.toLocaleString()} ر`,
      `🔧 تكاليف الصيانة: ${mex.toLocaleString()} ر`,
      `💸 مصاريف أخرى: ${exTotal.toLocaleString()} ر`,
      `📈 *صافي الربح الإجمالي: ${trueNet.toLocaleString()} ر*`,
      ``,
      `_تقرير آلي من نظام إدارة ريتام_`,
    ];
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  // أرقام سالبة داخل صفحة RTL تحتاج اتجاه LTR صريح، وإلا تنعكس إشارة السالب بصرياً
  const Money = ({ value, size, color }: { value: number; size?: number; color?: string }) => (
    <span dir="ltr" style={{ fontSize:size, color, whiteSpace:"nowrap" }}>
      {value<0?"−":""}{Math.abs(value).toLocaleString()} <span style={{fontSize: size?size*0.7:11, opacity:.6}}>ر</span>
    </span>
  );

  const StatementRow = ({ label, value, sub, bold }: { label: string; value: number; sub?: string; bold?: boolean }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding: bold?"10px 0 0":"6px 0", borderTop: bold?`1.5px solid rgba(197,172,136,.3)`:"none" }}>
      <span style={{ fontSize: bold?14:13, fontWeight: bold?800:500, color: bold?B:T }}>{label}{sub&&<span style={{fontSize:11,color:SI,marginRight:6}}>{sub}</span>}</span>
      <span style={{ fontSize: bold?16:13, fontWeight: bold?900:700, color:B }}>
        <Money value={value}/>
      </span>
    </div>
  );

  return (
    <div>
      {/* ── الرأس ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <SectionTitle title={lockedChalet ? "المالية — "+lockedChalet : "المالية"}/>
        <div style={{ position:"relative" }}>
          <button onClick={()=>setMenuOpen(o=>!o)} aria-label="خيارات إضافية"
            style={{ background:SL, color:B, border:"1px solid rgba(197,172,136,.35)", borderRadius:10, width:38, height:38, fontSize:18, fontWeight:900, cursor:"pointer" }}>
            ⋯
          </button>
          {menuOpen && (
            <>
              <div style={{ position:"fixed", inset:0, zIndex:299 }} onClick={()=>setMenuOpen(false)}/>
              <div style={{ position:"absolute", top:"110%", left:0, zIndex:300, background:"#fff", borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,.18)", border:"1px solid rgba(197,172,136,.2)", minWidth:210, overflow:"hidden" }}>
                {[
                  { l:"⬇ تصدير Excel", fn:exportCSV },
                  { l:"📤 إرسال تقرير للمستثمرين", fn:sendInvestorReport },
                  ...(onAddExpense?[{ l:"+ إضافة مصروف", fn:onAddExpense }]:[]),
                  ...(onAddFixedExpense?[{ l:"📌 مصروف ثابت", fn:onAddFixedExpense }]:[]),
                ].map((a,i,arr)=>(
                  <button key={i} onClick={()=>{setMenuOpen(false);a.fn();}}
                    style={{ display:"block", width:"100%", textAlign:"right", padding:"12px 16px", background:"none", border:"none", borderBottom:i<arr.length-1?"1px solid rgba(197,172,136,.12)":"none", cursor:"pointer", fontFamily:"'Tajawal',sans-serif", fontSize:13, fontWeight:600, color:B }}>
                    {a.l}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── بطاقة صافي الربح + القائمة المالية ── */}
      <div className="card" style={{ padding:"18px 18px 16px", marginBottom:14 }}>
        {/* شريط الفترة — سطر واحد قابل للتمرير */}
        <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4, marginBottom:16, WebkitOverflowScrolling:"touch" }}>
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([v, l]) => (
            <button key={v} className="btn" onClick={() => setPeriod(v)}
              style={{ background:period===v?B:W, color:period===v?S:B, border:"1.5px solid "+(period===v?B:"rgba(197,172,136,.4)"), padding:"7px 14px", fontSize:12, flexShrink:0, whiteSpace:"nowrap" }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ fontSize:11.5, color:SI, fontWeight:700, marginBottom:6 }}>
          {"صافي الربح · " + plab + (effFch !== "الكل" ? " · " + effFch : "")}
        </div>
        <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
          <div style={{ fontSize:34, fontWeight:900, color: trueNet>=0?SD:"#8B3A3A", lineHeight:1 }}>
            <Money value={trueNet} size={34}/>
          </div>
          {compareMode==="periods" && prev && <DeltaChip v={delta(trueNet, prev.trueNet)}/>}
        </div>
        <div style={{ fontSize:12, color:T, marginTop:4 }}>
          هامش الربح {margin}%
          {compareMode==="periods" && prev && prevRange && (" · مقابل "+prevRange.label+": "+prev.trueNet.toLocaleString()+" ر")}
        </div>

        <div style={{ height:1, background:"rgba(197,172,136,.18)", margin:"16px 0 10px" }}/>

        <StatementRow label="إيرادات الحجوزات" value={rev} sub={fb.length+" حجز"}/>
        <StatementRow label="تكاليف الصيانة" value={-mex}/>
        <StatementRow label="مصاريف عامة" value={-exTotal}/>
        <StatementRow label="صافي الربح" value={trueNet} bold/>
      </div>

      {/* ── مؤشرات ثانوية ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:14 }}>
        {[
          { l:"عدد الحجوزات",       v:String(fb.length),              i:"📅" },
          { l:"ليالي محجوزة",       v:String(nts),                    i:"🌙" },
          { l:"متوسط سعر الليلة",   v:adr.toLocaleString()+" ر",      i:"💳" },
          { l:"إيداعات التأمين",    v:insIn.toLocaleString()+" ر",    i:"🛡️" },
        ].map((s,i)=>(
          <div key={i} style={{ background:SL, borderRadius:12, padding:"12px 14px", border:"1px solid rgba(197,172,136,.18)" }}>
            <div style={{ fontSize:16, marginBottom:4 }}>{s.i}</div>
            <div style={{ fontSize:14.5, fontWeight:800, color:B }}>{s.v}</div>
            <div style={{ fontSize:10, color:T, marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── فلاتر إضافية: الشاليه + وضع المقارنة ── */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginBottom:18 }}>
        {!lockedChalet && (
          <select className="inp" style={{ width:"auto", minWidth:150 }} value={fch} onChange={e => setFch(e.target.value)}>
            <option value="الكل">كل الشاليهات</option>
            {names.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {period === "custom" && (
          <>
            <input className="inp" type="date" style={{ width:"auto" }} value={cf} onChange={e => setCf(e.target.value)} placeholder="من"/>
            <input className="inp" type="date" style={{ width:"auto" }} value={ct} onChange={e => setCt(e.target.value)} placeholder="إلى"/>
          </>
        )}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {([
            ["none","نظرة عامة"],
            ...(prevRange?[["periods","↔ مقارنة الفترات"]]:[]),
            ...(canCompareChalets?[["chalets","🏠 مقارنة الشاليهات"]]:[]),
          ] as [CompareMode,string][]).map(([v,l]) => (
            <button key={v} className="btn bsm" onClick={()=>setCompareMode(v)}
              style={{ background:compareMode===v?"#7C3AED":"#F3F4F6", color:compareMode===v?"#fff":"#374151", padding:"6px 12px", fontSize:12, fontWeight:700 }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── مقارنة الفترات ── */}
      {compareMode==="periods" && prev && prevRange && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>
            {"↔ مقارنة: " + plab + " مقابل " + prevRange.label}
          </div>
          <DataTable heads={["البند", plab, prevRange.label, "التغيّر"]}
            rows={[
              { l:"الإيرادات", c:rev, p:prev.rev },
              { l:"تكاليف الصيانة", c:mex, p:prev.mex },
              { l:"مصاريف عامة", c:exTotal, p:prev.exTotal },
              { l:"صافي الربح", c:trueNet, p:prev.trueNet, bold:true },
            ].map((row,i)=>(
              <tr key={i}>
                <td data-label="البند" style={{ fontWeight:row.bold?800:600, color:row.bold?B:T }}>{row.l}</td>
                <td data-label={plab} style={{ fontWeight:row.bold?800:700, color:B }}><Money value={row.c}/></td>
                <td data-label={prevRange.label} style={{ color:SI }}><Money value={row.p}/></td>
                <td data-label="التغيّر"><DeltaChip v={delta(row.c,row.p)}/></td>
              </tr>
            ))}
          />
        </div>
      )}

      {/* ── مقارنة الشاليهات ── */}
      {compareMode==="chalets" && csum.length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>{"🏠 مقارنة الشاليهات — " + plab}</div>
          <DataTable heads={["الشاليه","الإيرادات","المصروفات","صافي الربح","نسبة الربح"]}
            rows={[...csum].sort((a,b)=>b.net-a.net).map((c, i) => {
              const pct = c.r > 0 ? Math.min(100, Math.max(0, (c.net / c.r) * 100)) : 0;
              return (
                <tr key={i}>
                  <td data-label="الشاليه" style={{ fontWeight:700 }}>{"🏠 " + c.n}</td>
                  <td data-label="الإيرادات" style={{ fontWeight:700, color:T }}>{c.r.toLocaleString() + " ر"}</td>
                  <td data-label="المصروفات" style={{ fontWeight:700, color:"#8B3A3A" }}>{(c.e+c.x).toLocaleString() + " ر"}</td>
                  <td data-label="صافي الربح" style={{ fontWeight:800, color:c.net>=0?SD:"#8B3A3A" }}><Money value={c.net}/></td>
                  <td data-label="نسبة الربح">
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ flex:1, background:"#f1f5f9", borderRadius:99, height:7, overflow:"hidden", minWidth:60 }}>
                        <div style={{ width:pct+"%", height:"100%", background:c.net>=0?SA:"#8B3A3A", borderRadius:99 }}/>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:c.net>=0?SD:"#8B3A3A", minWidth:32 }}>{Math.round(pct) + "%"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          />
        </div>
      )}

      {/* ── اتجاه الإيرادات خلال العام ── */}
      <MonthlyChart
        bookings={bookings.filter(byCh)}
        expenses={expenses.filter(byCh)}
        maint={maintenance.filter(byCh)}
        B={B} T={T} SI={SI} SL={SL}
      />

      {/* إيرادات الحجوزات */}
      <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
        <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>{"💵 إيرادات الحجوزات (" + fb.length + ")"}</div>
        {fb.length === 0
          ? <div style={{ padding:24, textAlign:"center", color:SI }}>لا توجد حجوزات في هذه الفترة</div>
          : <DataTable heads={["الضيف","الشاليه","الفترة","الليالي","المبلغ","الحالة"]}
              rows={fb.map(b => (
                <tr key={b.id}>
                  <td data-label="الضيف" style={{ fontWeight:600 }}>{b.guest}</td>
                  <td data-label="الشاليه">{b.chalet}</td>
                  <td data-label="الفترة" style={{ fontSize:12 }}>{formatDate(b.date_from) + " - " + formatDate(b.date_to)}</td>
                  <td data-label="الليالي" style={{ textAlign:"center" }}>{nightsBetween(b.date_from, b.date_to)}</td>
                  <td data-label="المبلغ" style={{ fontWeight:700, color:T }}>{Number(b.price).toLocaleString() + " ر"}</td>
                  <td data-label="الحالة"><Bdg bg={BOOKING_STATUS[b.status]?.bg||"#eee"} color={BOOKING_STATUS[b.status]?.color||"#333"}>{BOOKING_STATUS[b.status]?.label||b.status}</Bdg></td>
                </tr>
              ))}
              footer={[
                <td key={0} colSpan={4} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
                <td key={1} style={{ fontWeight:800, color:T, fontSize:15 }}>{rev.toLocaleString() + " ر"}</td>,
                <td key={2}/>,
              ]}
            />
        }
      </div>

      {/* المصروفات الثابتة */}
      {fixedExpenses.filter(fx => effFch === "الكل" || fx.chalet === effFch).length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:"#5B21B6", fontSize:14, background:"#F5F3FF", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>{"📌 المصروفات الثابتة"}</span>
            <span style={{ fontWeight:800, color:"#7C3AED", fontSize:13 }}>
              {"شهري: " + fixedExpenses.filter(fx=>(effFch==="الكل"||fx.chalet===effFch)&&fx.frequency==="monthly"&&fx.active).reduce((s,fx)=>s+Number(fx.amount),0).toLocaleString() + " ر"}
            </span>
          </div>
          <DataTable heads={["الشاليه","المصروف","الفئة","التكرار","المبلغ","الحالة","إجراءات"]}
            rows={(() => {
              const thisYM = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; })();
              const paidThisMonth = new Set(expenses.filter(e => e.expense_date?.startsWith(thisYM)).map(e => e.note));
              return fixedExpenses.filter(fx => effFch === "الكل" || fx.chalet === effFch).map(fx => {
                const paid = paidThisMonth.has(fx.name);
                return (
                  <tr key={fx.id} style={{ opacity: fx.active ? 1 : 0.5 }}>
                    <td data-label="الشاليه" style={{ fontWeight:600 }}>{fx.chalet}</td>
                    <td data-label="المصروف" style={{ fontWeight:700 }}>{fx.name}</td>
                    <td data-label="الفئة"><Bdg bg="#EDE9FE" color="#5B21B6">{fx.category}</Bdg></td>
                    <td data-label="التكرار"><Bdg bg="#F3F4F6" color="#374151">{FREQ_LABEL[fx.frequency]||fx.frequency}</Bdg></td>
                    <td data-label="المبلغ" style={{ fontWeight:800, color:"#7C3AED" }}>{Number(fx.amount).toLocaleString() + " ر"}</td>
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
                          style={{ background: fx.active ? "#F5E6E6" : "#EEF0E9", color: fx.active ? "#8B3A3A" : "#3D7A5A", padding:"5px 10px", fontSize:12 }}>
                          {fx.active ? "إيقاف" : "تفعيل"}
                        </button>
                        <button className="btn bd bsm" onClick={async () => { if(window.confirm("حذف هذا المصروف الثابت؟")){await db("fixed_expenses","DELETE",null,fx.id); onReload?.();} }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
          />
        </div>
      )}

      {/* تكاليف الصيانة */}
      {fm.length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>{"🔧 تكاليف الصيانة (" + fm.length + ")"}</div>
          <DataTable heads={["الشاليه","المشكلة","التاريخ","التكلفة"]}
            rows={fm.map(m => (
              <tr key={m.id}>
                <td data-label="الشاليه" style={{ fontWeight:600 }}>{m.chalet}</td>
                <td data-label="المشكلة">{m.issue}</td>
                <td data-label="التاريخ">{formatDate(m.maint_date)}</td>
                <td data-label="التكلفة" style={{ fontWeight:700, color:"#8B3A3A" }}>{Number(m.cost).toLocaleString() + " ر"}</td>
              </tr>
            ))}
            footer={[
              <td key={0} colSpan={3} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
              <td key={1} style={{ fontWeight:800, color:"#8B3A3A", fontSize:15 }}>{mex.toLocaleString() + " ر"}</td>,
            ]}
          />
        </div>
      )}

      {/* المصاريف */}
      {fex.length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>{"💸 المصاريف (" + fex.length + ")"}</span>
            <span style={{ fontWeight:800, color:"#8B3A3A" }}>{exTotal.toLocaleString() + " ر"}</span>
          </div>
          <DataTable heads={["التاريخ","الشاليه","الفئة","المبلغ","ملاحظة","حذف"]}
            rows={[...fex].reverse().map((e, i) => (
              <tr key={i}>
                <td data-label="التاريخ" style={{ fontSize:12 }}>{formatDate(e.expense_date)}</td>
                <td data-label="الشاليه" style={{ fontWeight:600 }}>{e.chalet}</td>
                <td data-label="الفئة"><Bdg bg="#FEF3C7" color="#92400E">{e.category}</Bdg></td>
                <td data-label="المبلغ" style={{ fontWeight:700, color:"#8B3A3A" }}>{Number(e.amount).toLocaleString() + " ر"}</td>
                <td data-label="ملاحظة" style={{ color:T, fontSize:12 }}>{e.note || "-"}</td>
                <td data-label=""><button className="btn bd bsm" onClick={async () => { await db("expenses","DELETE",null,e.id); onReload?.(); }}>🗑️</button></td>
              </tr>
            ))}
            footer={[
              <td key={0} colSpan={3} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
              <td key={1} style={{ fontWeight:800, color:"#8B3A3A", fontSize:15 }}>{exTotal.toLocaleString() + " ر"}</td>,
              <td key={2}/>, <td key={3}/>,
            ]}
          />
        </div>
      )}

      {/* معاملات التأمين */}
      {ft.length > 0 && (
        <div className="card" style={{ overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>{"🛡️ معاملات التأمين (" + ft.length + ")"}</div>
          <DataTable heads={["التاريخ","الشاليه","النوع","المبلغ","ملاحظة","إجراءات"]}
            rows={[...ft].reverse().map((t, i) => (
              <tr key={i}>
                <td data-label="التاريخ">{formatDate(t.trans_date)}</td>
                <td data-label="الشاليه" style={{ fontWeight:600 }}>{t.chalet}</td>
                <td data-label="النوع"><Bdg bg={t.type==="إيداع"?"#EEF0E9":"#F5E6E6"} color={t.type==="إيداع"?SD:"#8B3A3A"}>{t.type}</Bdg></td>
                <td data-label="المبلغ" style={{ fontWeight:700, color:t.type==="إيداع"?T:"#8B3A3A" }}><span dir="ltr" style={{whiteSpace:"nowrap"}}>{t.type==="إيداع"?"+":"−"}{t.amount.toLocaleString()} ر</span></td>
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
        </div>
      )}
    </div>
  );
}
