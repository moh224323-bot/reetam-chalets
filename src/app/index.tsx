import { useState, useMemo, useEffect } from "react";
import { hashPassword, setCurrentOwnerId } from "../lib/db";
import { supabase } from "../lib/supabase";
import useRealtimeSync   from "../hooks/useRealtimeSync";
import useDarkMode       from "../hooks/useDarkMode";
import BookingCalendar   from "../components/BookingCalendar";
import type {
  Chalet, Booking, MaintenanceRequest, WalletTransaction,
  CleaningTransaction, CleaningExpense, CleaningTask, CleaningLog,
  Room, Review, AppUser, Expense, FixedExpense, CleaningWorker, LoyaltyCard,
} from "../lib/types";
import DashboardTab   from "../components/DashboardTab";
import BookingsTab    from "../components/BookingsTab";
import FinancialTab   from "../components/FinancialTab";
import ChaletsTab     from "../components/ChaletsTab";
import MaintenanceTab from "../components/MaintenanceTab";
import ReviewsTab     from "../components/ReviewsTab";
import SettingsTab    from "../components/SettingsTab";

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

// رفع صورة شاليه إلى Supabase Storage (أخف من base64)
let lastUploadError: string | null = null;
async function uploadChaletImage(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `chalets/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/chalet-images/${path}`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) { const err = await res.text(); lastUploadError = err; console.error("فشل رفع الصورة:", err); return null; }
  lastUploadError = null;
  return `${SUPA_URL}/storage/v1/object/public/chalet-images/${path}`;
}

const S="#C5AC88", B="#413523", BD="#2A2218", SA="#8D9577";
const SD="#6B7258", T="#576D6F", TD="#3E5052", SI="#C8C9CA";
const W="#FFFFFF", OW="#FAF8F5", SL="#F5EFE6";

const STATUS = {
  confirmed: {label:"مؤكد",  color:T,        bg:"#E8F0F0"},
  pending:   {label:"معلق",  color:"#8B6914", bg:"#F5EFD6"},
  cancelled: {label:"ملغي",  color:"#8B3A3A", bg:"#F5E6E6"},
  completed: {label:"مكتمل", color:SA,        bg:"#EEF0E9"},
};
const MS = {
  open:        {label:"مفتوح",       color:"#8B3A3A", bg:"#F5E6E6"},
  in_progress: {label:"قيد التنفيذ", color:"#8B6914", bg:"#F5EFD6"},
  done:        {label:"منتهي",       color:SD,        bg:"#EEF0E9"},
};

const fd = (d?: string | null): string => d ? new Date(d).toLocaleDateString("ar-SA") : "-";
const fn = (f?: string, t?: string): number => (!f||!t) ? 0 : Math.max(0, Math.round((new Date(t).getTime()-new Date(f).getTime())/86400000));
const td = (): string => new Date().toISOString().slice(0,10);

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
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap');
  @font-face{font-family:'YaModern';src:url('/assets/YaModernPro-Bold.otf') format('opentype');font-weight:700;font-display:swap}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{overflow-y:auto!important;height:auto!important;min-height:100vh}
  #root{height:auto;overflow:visible}
  input,select,textarea{font-family:'Tajawal',sans-serif}
  ::-webkit-scrollbar{width:6px}
  ::-webkit-scrollbar-thumb{background:#C8C9CA;border-radius:3px}
  .card{background:#fff;border-radius:16px;box-shadow:0 2px 16px rgba(65,53,35,.08);border:1px solid rgba(197,172,136,.2)}
  .btn{border:none;cursor:pointer;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:700;transition:all .18s;font-size:14px}
  .btn:hover{filter:brightness(.93);transform:translateY(-1px)}
  .bp{background:#413523;color:#C5AC88;padding:10px 22px}
  .bo{background:transparent;color:#413523;padding:10px 20px;border:2px solid #C5AC88}
  .bd{background:#8B3A3A;color:#fff;padding:7px 14px;font-size:13px}
  .be{background:#F5EFE6;color:#413523;padding:7px 14px;font-size:13px;border:1px solid #C5AC88}
  .bsm{padding:5px 12px;font-size:13px}
  .tbl{width:100%;border-collapse:collapse;min-width:520px}
  .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%}
  th{background:#F5EFE6;color:#576D6F;font-size:13px;font-weight:700;padding:12px 14px;text-align:right;border-bottom:2px solid rgba(197,172,136,.3);white-space:nowrap}
  td{padding:12px 14px;border-bottom:1px solid rgba(197,172,136,.15);font-size:13px;color:#413523}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#F5EFE6}
  .bdg{display:inline-block;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap}
  .inp{width:100%;padding:10px 14px;border:1.5px solid rgba(197,172,136,.4);border-radius:10px;font-size:14px;outline:none;transition:border .2s;color:#413523;background:#fff}
  .inp:focus{border-color:#576D6F}
  .lbl{font-size:13px;color:#576D6F;margin-bottom:5px;display:block;font-weight:600}
  .mbg{position:fixed;inset:0;background:rgba(65,53,35,.55);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}
  .mbox{background:#fff;border-radius:20px;padding:24px;width:100%;max-width:540px;max-height:92vh;overflow-y:auto}
  .cc{background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(65,53,35,.1);overflow:hidden;transition:transform .2s,box-shadow .2s;border:1px solid rgba(197,172,136,.2)}
  .cc:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(65,53,35,.15)}
  .sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
  .g2{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .cg{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
  .ig{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
  .mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  @media(max-width:640px){
    .mbox{padding:16px;border-radius:14px}
    h2{font-size:18px!important}
    .sg{grid-template-columns:repeat(2,1fr)}
    .g2{grid-template-columns:1fr}
    .tbl-wrap{overflow-x:visible}
    .tbl{min-width:unset;display:block}
    .tbl thead{display:none}
    .tbl tbody{display:block}
    .tbl tr{display:block;margin-bottom:12px;border-radius:12px;border:1px solid rgba(197,172,136,.25);overflow:hidden;background:#fff;box-shadow:0 1px 6px rgba(65,53,35,.07)}
    .tbl tr:hover td{background:transparent}
    .tbl td{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid rgba(197,172,136,.12);font-size:13px;gap:8px}
    .tbl td:last-child{border-bottom:none}
    .tbl td::before{content:attr(data-label);font-size:11px;color:#576D6F;font-weight:700;flex-shrink:0;text-align:right}
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
          style={{borderRadius:7,border:"1.5px solid rgba(6,95,70,.3)",padding:"4px 7px",fontSize:11,background:"#fff",fontFamily:"'Tajawal',sans-serif",maxWidth:90}}>
          {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
      <button onClick={send} disabled={sending} style={{
        background:"#25D366",color:"#fff",border:"none",borderRadius:7,
        padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",
        fontFamily:"'Tajawal',sans-serif",whiteSpace:"nowrap",
      }}>{sending?"...":"📲 إرسال"}</button>
    </div>
  );
}

function CleanTaskBanner({tasks,sentLogs,workers,logs,thisMonth,onSend,onConfirm}:{
  tasks:CleaningTask[];sentLogs:Set<number>;workers:CleaningWorker[];logs:CleaningLog[];thisMonth:string;
  onSend:(t:CleaningTask,w:CleaningWorker)=>Promise<void>;onConfirm:(t:CleaningTask)=>Promise<void>;
}) {
  const [open,setOpen]=useState(true);
  const [sel,setSel]=useState<Record<number,number>>({});
  return (
    <div style={{marginBottom:20}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
        background:"linear-gradient(135deg,#065F46,#047857)",border:"none",borderRadius:open?"14px 14px 0 0":14,
        cursor:"pointer",fontFamily:"'Tajawal',sans-serif",textAlign:"right",
      }}>
        <span style={{fontSize:16}}>🧹</span>
        <span style={{fontWeight:800,color:"#fff",fontSize:14,flex:1}}>مهام النظافة المستحقة هذا الشهر</span>
        <span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,fontSize:12,padding:"2px 10px",fontWeight:700}}>{tasks.length}</span>
        <span style={{color:"rgba(255,255,255,.7)",fontSize:12,marginRight:4}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{background:"rgba(6,95,70,.07)",border:"1px solid rgba(6,95,70,.2)",borderRadius:"0 0 14px 14px",overflow:"hidden"}}>
          {tasks.map((t,i)=>{
            const log=logs.find(l=>l.task_id===t.id&&l.log_date?.startsWith(thisMonth));
            const isSent=sentLogs.has(t.id)||log?.status==="sent";
            const isDone=log?.status==="done"||log?.supervisor_ok;
            return (
              <div key={t.id} style={{padding:"12px 16px",borderTop:i>0?"1px solid rgba(6,95,70,.12)":"none",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:120}}>
                  <div style={{fontWeight:700,color:B,fontSize:13}}>{t.title}</div>
                  <div style={{fontSize:11,color:T,marginTop:2}}>{t.chalet} · {t.category} · {t.frequency}</div>
                  {isSent&&!isDone&&<div style={{fontSize:10,color:"#059669",fontWeight:600,marginTop:2}}>📤 أُرسلت للعامل</div>}
                  {isDone&&<div style={{fontSize:10,color:"#166534",fontWeight:600,marginTop:2}}>✅ انتهى العامل</div>}
                </div>
                {workers.length>0&&!isDone&&(
                  <select value={sel[t.id]||""} onChange={e=>setSel(p=>({...p,[t.id]:Number(e.target.value)}))}
                    style={{borderRadius:8,border:"1.5px solid rgba(6,95,70,.3)",padding:"6px 10px",fontSize:12,background:"#fff",fontFamily:"'Tajawal',sans-serif"}}>
                    <option value="">اختر عامل</option>
                    {workers.filter(w=>w.active).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
                <div style={{display:"flex",gap:6}}>
                  {!isDone&&sel[t.id]&&workers.find(w=>w.id===sel[t.id])&&(
                    <SaveBtn label={isSent?"إعادة إرسال ↗":"إرسال ↗"} style={{background:"#25D366",padding:"6px 12px",fontSize:12}}
                      onClick={()=>onSend(t,workers.find(w=>w.id===sel[t.id])!)}/>
                  )}
                  {!isDone&&(
                    <SaveBtn label="تأكيد ✓" style={{background:"#059669",padding:"6px 12px",fontSize:12}}
                      onClick={()=>onConfirm(t)}/>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
        cursor:"pointer",fontFamily:"'Tajawal',sans-serif",textAlign:"right",
      }}>
        <span style={{fontSize:16}}>📌</span>
        <span style={{fontWeight:800,color:"#fff",fontSize:14,flex:1}}>مصروفات ثابتة لم تُسدَّد</span>
        <span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,fontSize:12,padding:"2px 10px",fontWeight:700}}>{unpaid.length}</span>
        <span style={{fontWeight:800,color:"#FDE68A",fontSize:13}}>{total.toLocaleString()+" ر"}</span>
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
              <div style={{fontWeight:800,color:"#92400E",fontSize:14}}>{Number(fx.amount).toLocaleString()+" ر"}</div>
              <SaveBtn label="تسديد" onClick={()=>onPay(fx)} style={{padding:"6px 14px",fontSize:12}}/>
            </div>
          ))}
        </div>
      )}
    </div>
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
function MonthlyChart({bookings,expenses,maint,B,T,SI,SL}:{bookings:Booking[];expenses:any[];maint:any[];B:string;T:string;SI:string;SL:string}) {
  const [hovered,setHovered]=useState<number|null>(null);
  const [selected,setSelected]=useState<number|null>(null);
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{const id=setTimeout(()=>setMounted(true),60);return()=>clearTimeout(id);},[]);

  const MONTHS=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const currentYear=new Date().getFullYear();
  const curMonth=new Date().getMonth();
  const activeStatuses=["completed","confirmed"];

  const monthlyData=MONTHS.map((_,mi)=>{
    const bks=bookings.filter(b=>activeStatuses.includes(b.status)&&b.date_from&&new Date(b.date_from).getFullYear()===currentYear&&new Date(b.date_from).getMonth()===mi);
    const rev=bks.reduce((s,b)=>s+Number(b.price),0);
    const exp=expenses.filter(e=>e.expense_date&&new Date(e.expense_date).getFullYear()===currentYear&&new Date(e.expense_date).getMonth()===mi).reduce((s,e)=>s+Number(e.amount),0)
      +maint.filter(m=>m.cost&&m.maint_date&&new Date(m.maint_date).getFullYear()===currentYear&&new Date(m.maint_date).getMonth()===mi).reduce((s,m)=>s+Number(m.cost),0);
    return {rev,exp,cnt:bks.length,net:rev-exp};
  });

  const maxRev=Math.max(...monthlyData.map(d=>d.rev),1);
  const total=monthlyData.reduce((s,d)=>s+d.rev,0);
  const totalExp=monthlyData.reduce((s,d)=>s+d.exp,0);
  const avgRev=total/12;
  const activeMos=monthlyData.filter(d=>d.rev>0).length;
  const bestIdx=monthlyData.reduce((bi,d,i)=>d.rev>monthlyData[bi].rev?i:bi,0);

  const active=selected!==null?selected:hovered;
  const activeData=active!==null?monthlyData[active]:null;

  const yStep=Math.ceil(maxRev/4/1000)*1000||1000;
  const yLines=[1,2,3,4].map(n=>n*yStep).filter(v=>v<=maxRev*1.1);

  return (
    <div className="card" style={{overflow:"hidden",marginBottom:16}}>
      {/* الرأس */}
      <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(197,172,136,.15)",background:SL,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontWeight:800,color:B,fontSize:14}}>📊 الإيرادات الشهرية {currentYear}</div>
          <div style={{fontSize:11,color:SI,marginTop:2}}>{activeMos} أشهر نشطة · أفضل شهر: <span style={{color:B,fontWeight:700}}>{MONTHS[bestIdx]}</span></div>
        </div>
        <div style={{display:"flex",gap:16,alignItems:"center"}}>
          {[
            {label:"إجمالي الإيرادات",v:total,c:B},
            {label:"إجمالي المصاريف",v:totalExp,c:"#C97B63"},
            {label:"صافي الربح",v:total-totalExp,c:total>=totalExp?"#4CAF50":"#FF6B6B"},
          ].map(({label,v,c})=>(
            <div key={label} style={{textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:900,color:c,lineHeight:1}}>{v.toLocaleString()}</div>
              <div style={{fontSize:9,color:SI,fontWeight:600}}>{label} ر</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip المنبثق */}
      {activeData&&active!==null&&(
        <div style={{margin:"12px 18px 0",background:"rgba(197,172,136,.08)",border:"1px solid rgba(197,172,136,.25)",borderRadius:12,padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,transition:"all .2s"}}>
          <div>
            <div style={{fontSize:11,color:SI,marginBottom:2}}>📅 الشهر</div>
            <div style={{fontWeight:800,color:B,fontSize:14}}>{MONTHS[active]}</div>
            <div style={{fontSize:10,color:SI}}>{currentYear}</div>
          </div>
          <div>
            <div style={{fontSize:11,color:SI,marginBottom:2}}>💰 الإيرادات</div>
            <div style={{fontWeight:900,color:B,fontSize:15}}>{activeData.rev.toLocaleString()} <span style={{fontSize:11}}>ر</span></div>
            <div style={{fontSize:10,color:SI}}>{activeData.cnt} حجز</div>
          </div>
          <div>
            <div style={{fontSize:11,color:SI,marginBottom:2}}>📤 المصاريف</div>
            <div style={{fontWeight:900,color:"#C97B63",fontSize:15}}>{activeData.exp.toLocaleString()} <span style={{fontSize:11}}>ر</span></div>
            <div style={{fontSize:10,color:SI}}>صيانة + نفقات</div>
          </div>
          <div>
            <div style={{fontSize:11,color:SI,marginBottom:2}}>📈 صافي الربح</div>
            <div style={{fontWeight:900,color:activeData.net>=0?"#4CAF50":"#FF6B6B",fontSize:15}}>{activeData.net.toLocaleString()} <span style={{fontSize:11}}>ر</span></div>
            <div style={{fontSize:10,color:SI}}>هامش {activeData.rev>0?Math.round(activeData.net/activeData.rev*100):0}%</div>
          </div>
        </div>
      )}

      {/* الرسم */}
      <div style={{padding:"20px 18px 12px",position:"relative"}}>
        <div style={{position:"absolute",inset:"20px 18px 56px",pointerEvents:"none"}}>
          {yLines.map(v=>(
            <div key={v} style={{position:"absolute",bottom:(v/maxRev)*100+"%",left:0,right:0,display:"flex",alignItems:"center",gap:6}}>
              <div style={{fontSize:9,color:SI,whiteSpace:"nowrap",width:36,textAlign:"left",flexShrink:0}}>{v>=1000?(v/1000)+"k":v}</div>
              <div style={{flex:1,height:1,background:"rgba(197,172,136,.1)"}}/>
            </div>
          ))}
          {avgRev>0&&(
            <div style={{position:"absolute",bottom:(avgRev/maxRev)*100+"%",left:40,right:0,display:"flex",alignItems:"center",gap:6}}>
              <div style={{flex:1,height:1,borderTop:"1.5px dashed rgba(197,172,136,.35)"}}/>
              <div style={{fontSize:9,color:T,fontWeight:700,whiteSpace:"nowrap"}}>متوسط</div>
            </div>
          )}
        </div>

        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:180,paddingRight:44,paddingLeft:4}}>
          {monthlyData.map((d,i)=>{
            const isHov=i===active;
            const isCur=i===curMonth;
            const isPast=i<curMonth;
            const isBest=i===bestIdx&&d.rev>0;
            const revH=mounted&&maxRev>0?Math.max((d.rev/maxRev)*100,d.rev>0?3:0):0;
            const expH=mounted&&maxRev>0&&d.exp>0?Math.max((d.exp/maxRev)*100,2):0;
            const revColor=isCur?"linear-gradient(180deg,#C5AC88,#8B7355)":isBest?"linear-gradient(180deg,#4CAF50,#2E7D32)":isPast?"linear-gradient(180deg,rgba(87,109,111,.9),rgba(87,109,111,.5))":"rgba(197,172,136,.2)";
            return (
              <div
                key={i}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,height:"100%",justifyContent:"flex-end",cursor:"pointer",padding:"0 1px"}}
                onMouseEnter={()=>setHovered(i)}
                onMouseLeave={()=>setHovered(null)}
                onClick={()=>setSelected(selected===i?null:i)}
              >
                <div style={{fontSize:8,color:isHov?B:isBest?"#4CAF50":isPast&&d.rev>0?T:"transparent",fontWeight:800,textAlign:"center",lineHeight:1.2,marginBottom:1,transition:"color .15s"}}>
                  {d.rev>=1000?(d.rev/1000).toFixed(1)+"k":d.rev>0?d.rev:""}
                </div>
                <div style={{width:"100%",display:"flex",gap:1,alignItems:"flex-end",height:"100%"}}>
                  <div style={{
                    flex:1,
                    height:revH+"%",
                    background:revColor,
                    borderRadius:"4px 4px 0 0",
                    position:"relative",
                    transition:"height .5s cubic-bezier(.34,1.56,.64,1), box-shadow .15s, transform .15s",
                    boxShadow:isHov?"0 0 16px rgba(197,172,136,.5)":isCur?"0 0 10px rgba(197,172,136,.3)":"none",
                    transform:isHov?"scaleX(1.08)":"scaleX(1)",
                    minHeight:d.rev>0?"3px":0,
                    outline:selected===i?"2px solid #C5AC88":"none",
                    outlineOffset:1,
                  }}>
                    {isCur&&<div style={{position:"absolute",top:-4,left:"50%",transform:"translateX(-50%)",width:8,height:8,borderRadius:"50%",background:"#C5AC88",boxShadow:"0 0 6px rgba(197,172,136,.8)"}}/>}
                  </div>
                  {d.exp>0&&<div style={{width:3,height:expH+"%",background:isHov?"rgba(201,123,99,.9)":"rgba(201,123,99,.5)",borderRadius:"2px 2px 0 0",minHeight:2,transition:"height .5s cubic-bezier(.34,1.56,.64,1)"}}/>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:4,paddingRight:44,paddingLeft:4,marginTop:6}}>
          {monthlyData.map((d,i)=>{
            const isCur=i===curMonth;
            const isActive=i===active;
            return (
              <div key={i} style={{flex:1,textAlign:"center",cursor:"pointer"}} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onClick={()=>setSelected(selected===i?null:i)}>
                <div style={{fontSize:8.5,color:isActive?B:isCur?B:i<curMonth?T:SI,fontWeight:isActive||isCur?900:500,lineHeight:1,transition:"color .15s"}}>{MONTHS[i].slice(0,3)}</div>
                {d.cnt>0&&<div style={{fontSize:7.5,color:isActive?"#C5AC88":SI,fontWeight:600,marginTop:1,transition:"color .15s"}}>{d.cnt}</div>}
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:12,flexWrap:"wrap"}}>
          {[
            {color:"linear-gradient(90deg,#C5AC88,#8B7355)",label:"الشهر الحالي"},
            {color:"linear-gradient(90deg,#4CAF50,#2E7D32)",label:"أفضل شهر"},
            {color:"rgba(87,109,111,.7)",label:"الأشهر الماضية"},
            {color:"rgba(197,172,136,.2)",label:"القادمة"},
            {color:"rgba(201,123,99,.6)",label:"المصاريف"},
          ].map(({color,label})=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:14,height:8,borderRadius:3,background:color,flexShrink:0}}/>
              <span style={{fontSize:9,color:SI}}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ملخص ربع سنوي */}
      <div style={{borderTop:"1px solid rgba(197,172,136,.12)",display:"grid",gridTemplateColumns:"repeat(4,1fr)"}}>
        {["Q1","Q2","Q3","Q4"].map((q,qi)=>{
          const slice=monthlyData.slice(qi*3,qi*3+3);
          const qRev=slice.reduce((s,d)=>s+d.rev,0);
          const qExp=slice.reduce((s,d)=>s+d.exp,0);
          const isCurQ=Math.floor(curMonth/3)===qi;
          const isSelQ=selected!==null&&Math.floor(selected/3)===qi;
          return (
            <div key={q} style={{padding:"10px 12px",borderLeft:qi>0?"1px solid rgba(197,172,136,.12)":"none",background:isSelQ?"rgba(197,172,136,.12)":isCurQ?SL:"transparent",cursor:"pointer",transition:"background .2s"}} onClick={()=>{}}>
              <div style={{fontSize:10,color:isCurQ||isSelQ?B:SI,fontWeight:isCurQ||isSelQ?800:600,marginBottom:3}}>{q}{isCurQ?" ← الآن":""}</div>
              <div style={{fontSize:13,fontWeight:900,color:isCurQ||isSelQ?B:T}}>{qRev>=1000?(qRev/1000).toFixed(1)+"k":qRev} <span style={{fontSize:9,opacity:.6}}>ر</span></div>
              <div style={{fontSize:9,color:"#C97B63"}}>{qExp>0?"- "+(qExp>=1000?(qExp/1000).toFixed(1)+"k":qExp)+" مصاريف":""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function Logo({size}) {
  const s = size||40;
  return <img src={logoImg} width={s} height={s} style={{objectFit:"contain"}}/>;
}
function AvailabilityCalendar({bookings,from,to,onPick}:{bookings:Booking[];from:string;to:string;onPick:(from:string,to:string)=>void}) {
  const B="#413523", S="#C5AC88", T="#576D6F", SL="#F5EFE6";
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
            <div style={{width:11,height:11,borderRadius:4,background:x.c,border:"1px solid rgba(197,172,136,.3)"}}/>
            <span style={{fontSize:10,color:T}}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type BusinessSettings = {bank_name?:string; bank_account_name?:string; bank_iban?:string};

function ChaletPublicPage({chaletName}:{chaletName:string}) {
  const B="#413523", BD="#2A2218", S="#C5AC88", T="#576D6F", SL="#F5EFE6";
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

  if(loading) return <div dir="rtl" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Tajawal',sans-serif"}}><div style={{textAlign:"center",color:T}}><div style={{fontSize:40,marginBottom:8}}>⌛</div>جاري التحميل...</div></div>;
  if(!chalet) return <div dir="rtl" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Tajawal',sans-serif"}}><div style={{textAlign:"center",color:T}}><div style={{fontSize:40,marginBottom:8}}>🏠</div>الشاليه غير موجود</div></div>;

  let gallery: string[] = [];
  try { gallery = chalet.gallery ? JSON.parse(chalet.gallery as string) : []; } catch { gallery = []; }
  const allImages = [chalet.img, ...gallery].filter(Boolean) as string[];
  const amenitiesList = (chalet.amenities||"").split(/[،,]/).map(a=>a.trim()).filter(Boolean);

  return (
    <div dir="rtl" style={{fontFamily:"'Tajawal',sans-serif",background:"#FAF8F5",minHeight:"100vh"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');*{box-sizing:border-box}html,body{overflow-y:auto!important;height:auto!important;min-height:100vh}#root{height:auto;overflow:visible}`}</style>

      <div style={{background:`linear-gradient(135deg,${B},${BD})`,padding:"14px 20px",display:"flex",alignItems:"center",gap:10}}>
        <Logo size={30}/>
        <span style={{color:S,fontWeight:800,fontSize:15}}>مجموعة ريتام</span>
      </div>

      <div style={{position:"relative",height:280,overflow:"hidden",background:`linear-gradient(135deg,${B},${BD})`}}>
        {allImages[0]
          ? <img src={allImages[0]} style={{width:"100%",height:"100%",objectFit:"cover"}} onClick={()=>setLightbox(allImages[0])}/>
          : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:60,opacity:.25}}>🏠</span></div>}
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(42,34,24,.85))",padding:"40px 20px 18px"}}>
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
            <div key={s.label} style={{background:"#fff",borderRadius:14,padding:"14px 10px",textAlign:"center",border:"1px solid rgba(197,172,136,.2)"}}>
              <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
              <div style={{fontWeight:900,color:B,fontSize:15}}>{s.val}</div>
              <div style={{fontSize:10,color:T,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {chalet.description && (
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,border:"1px solid rgba(197,172,136,.2)"}}>
            <div style={{fontWeight:800,color:B,fontSize:14,marginBottom:8}}>📝 عن الشاليه</div>
            <div style={{color:T,fontSize:13.5,lineHeight:1.8}}>{chalet.description}</div>
          </div>
        )}

        {amenitiesList.length>0 && (
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,border:"1px solid rgba(197,172,136,.2)"}}>
            <div style={{fontWeight:800,color:B,fontSize:14,marginBottom:12}}>✨ المميزات</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {amenitiesList.map(a=>(
                <span key={a} style={{background:SL,color:B,borderRadius:99,padding:"6px 14px",fontSize:12.5,fontWeight:700,border:"1px solid rgba(197,172,136,.25)"}}>✓ {a}</span>
              ))}
            </div>
          </div>
        )}

        {allImages.length>1 && (
          <div style={{background:"#fff",borderRadius:14,padding:16,marginBottom:16,border:"1px solid rgba(197,172,136,.2)"}}>
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
                {biz?.bank_iban && <div style={{fontSize:13,color:T,direction:"ltr",textAlign:"right",fontFamily:"monospace"}}><b style={{color:B,fontFamily:"'Tajawal',sans-serif"}}>IBAN: </b>{biz.bank_iban}</div>}
              </div>
            )}
            <a href={`https://wa.me/?text=${encodeURIComponent(`مرحباً، حوّلت قيمة حجز شاليه ${chalet.name} باسم ${bkName}، مرفق صورة الإيصال`)}`} target="_blank" rel="noreferrer"
              style={{display:"block",textAlign:"center",background:"#25D366",color:"#fff",borderRadius:12,padding:"13px",fontWeight:800,fontSize:14,textDecoration:"none"}}>
              📲 أرسل إيصال التحويل عبر واتساب
            </a>
          </div>
        ) : (
          <div style={{background:"#fff",borderRadius:16,padding:18,border:"1px solid rgba(197,172,136,.2)"}}>
            <div style={{fontWeight:800,color:B,fontSize:15,marginBottom:14}}>📅 احجز الآن</div>
            <div style={{fontSize:11.5,color:T,marginBottom:14}}>
              {bkMode==="overnight" ? "اضغط على تاريخ الوصول من التقويم، ثم تاريخ المغادرة" : "اختر اليوم ثم الفترة المناسبة"}
            </div>

            {chalet.allow_overnight!==false && chalet.allow_hourly && (
              <div style={{display:"flex",gap:8,marginBottom:16,background:SL,borderRadius:12,padding:4}}>
                <button onClick={()=>setBkMode("overnight")} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:13,background:bkMode==="overnight"?B:"transparent",color:bkMode==="overnight"?S:T}}>🌙 مبيت</button>
                <button onClick={()=>setBkMode("hourly")} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:13,background:bkMode==="hourly"?B:"transparent",color:bkMode==="hourly"?S:T}}>⏱ بالساعة</button>
              </div>
            )}

            {bkMode==="overnight" ? (
              <>
                <AvailabilityCalendar bookings={bookings} from={bkFrom} to={bkTo} onPick={(f,t)=>{setBkFrom(f);setBkTo(t);}}/>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <label style={{fontSize:11,color:T,fontWeight:600,display:"block",marginBottom:5}}>تاريخ الوصول</label>
                    <input type="date" value={bkFrom} min={new Date().toISOString().slice(0,10)} onChange={e=>setBkFrom(e.target.value)}
                      style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(197,172,136,.4)",fontSize:13,fontFamily:"'Tajawal',sans-serif",color:B,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,color:T,fontWeight:600,display:"block",marginBottom:5}}>تاريخ المغادرة</label>
                    <input type="date" value={bkTo} min={bkFrom||new Date().toISOString().slice(0,10)} onChange={e=>setBkTo(e.target.value)}
                      style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(197,172,136,.4)",fontSize:13,fontFamily:"'Tajawal',sans-serif",color:B,boxSizing:"border-box"}}/>
                  </div>
                </div>

                {bkFrom&&bkTo&&new Date(bkTo)>new Date(bkFrom)&&(
                  hasConflict(bkFrom,bkTo)
                    ? <div style={{background:"#FFF5F5",color:"#8B3A3A",borderRadius:10,padding:"10px 12px",fontSize:12.5,fontWeight:700,marginBottom:10}}>⚠️ هذي التواريخ محجوزة مسبقاً</div>
                    : <div style={{background:SL,borderRadius:10,padding:"10px 12px",marginBottom:10,display:"flex",justifyContent:"space-between",fontSize:13}}>
                        <span style={{color:T}}>{nightsCount(bkFrom,bkTo)} ليالي</span>
                        <span style={{fontWeight:900,color:B}}>{calcPrice(bkFrom,bkTo,chalet).toLocaleString()} ريال</span>
                      </div>
                )}
              </>
            ) : (
              <>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,color:T,fontWeight:600,display:"block",marginBottom:5}}>اليوم</label>
                  <input type="date" value={bkDay} min={new Date().toISOString().slice(0,10)} onChange={e=>{setBkDay(e.target.value);setBkSlot(null);}}
                    style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(197,172,136,.4)",fontSize:13,fontFamily:"'Tajawal',sans-serif",color:B,boxSizing:"border-box"}}/>
                </div>

                {bkDay && dayFullyBooked(bkDay) && (
                  <div style={{background:"#FFF5F5",color:"#8B3A3A",borderRadius:10,padding:"10px 12px",fontSize:12.5,fontWeight:700,marginBottom:10}}>⚠️ هذا اليوم محجوز بالكامل (مبيت)</div>
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
                                background:isSel?B:isTaken?"#FFF1F1":SL, border:"1px solid "+(isSel?B:"rgba(197,172,136,.3)"),opacity:isTaken?.6:1,
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
                  style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(197,172,136,.4)",fontSize:13,fontFamily:"'Tajawal',sans-serif",color:B,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:11,color:T,fontWeight:600,display:"block",marginBottom:5}}>رقم الجوال</label>
                <input value={bkPhone} onChange={e=>setBkPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr"
                  style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(197,172,136,.4)",fontSize:13,fontFamily:"'Tajawal',sans-serif",color:B,boxSizing:"border-box"}}/>
              </div>
            </div>

            <div style={{background:SL,borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12.5,color:T,display:"flex",alignItems:"center",gap:8}}>
              <span>💳</span><span><b style={{color:B}}>طريقة الدفع:</b> تحويل بنكي</span>
            </div>

            {bkErr && <div style={{background:"#FFF5F5",color:"#8B3A3A",borderRadius:10,padding:"10px 12px",fontSize:12.5,fontWeight:700,marginBottom:12}}>{bkErr}</div>}

            <button onClick={submitBooking} disabled={bkSubmitting}
              style={{width:"100%",background:bkSubmitting?"#999":B,color:S,border:"none",borderRadius:14,padding:"14px",fontWeight:800,fontSize:15,cursor:bkSubmitting?"not-allowed":"pointer",fontFamily:"'Tajawal',sans-serif",marginBottom:10}}>
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

function FinTab({bookings,maintenance,wallet,names,expenses=[],onAddExpense,onEdit,onReload}) {
  const now = new Date();
  const [period,setPeriod] = useState("this_month");
  const [fch,setFch] = useState("الكل");
  const [cf,setCf] = useState("");
  const [ct,setCt] = useState("");

  function getRange() {
    const y=now.getFullYear(), m=now.getMonth();
    if(period==="this_month") return {from:new Date(y,m,1),to:new Date(y,m+1,0)};
    if(period==="last_month") return {from:new Date(y,m-1,1),to:new Date(y,m,0)};
    if(period==="this_year")  return {from:new Date(y,0,1),to:new Date(y,11,31)};
    if(period==="custom")     return {from:cf?new Date(cf):null,to:ct?new Date(ct):null};
    return {from:null,to:null};
  }
  const {from:rf,to:rt} = getRange();
  const inR = d => {
    if(!d) return false;
    const x=new Date(d);
    if(rf&&x<rf) return false;
    if(rt&&x>rt) return false;
    return true;
  };

  const fb  = bookings.filter(b=>b.status==="completed"&&(fch==="الكل"||b.chalet===fch)&&(period==="all"||inR(b.date_from)));
  const fm  = maintenance.filter(m=>Number(m.cost)>0&&(fch==="الكل"||m.chalet===fch)&&(period==="all"||inR(m.maint_date)));
  const ft  = wallet.filter(t=>(fch==="الكل"||t.chalet===fch)&&(period==="all"||inR(t.trans_date)));
  const fex = expenses.filter(e=>(fch==="الكل"||e.chalet===fch)&&(period==="all"||inR(e.expense_date)));

  const rev      = fb.reduce((s,b)=>s+Number(b.price),0);
  const mex      = fm.reduce((s,m)=>s+Number(m.cost),0);
  const exTotal  = fex.reduce((s,e)=>s+Number(e.amount),0);
  const insIn    = ft.filter(t=>t.type==="إيداع").reduce((s,t)=>s+t.amount,0);
  const net      = rev-mex;
  const trueNet  = rev-mex-exTotal;
  const nts      = fb.reduce((s,b)=>s+fn(b.date_from,b.date_to),0);
  const plab     = {this_month:"هذا الشهر",last_month:"الشهر الماضي",this_year:"هذا العام",all:"كل الوقت",custom:"مخصص"}[period];

  const csum = names.map(n=>{
    const r=bookings.filter(b=>b.chalet===n&&b.status==="completed"&&(period==="all"||inR(b.date_from))).reduce((s,b)=>s+Number(b.price),0);
    const e=maintenance.filter(m=>m.chalet===n&&Number(m.cost)>0&&(period==="all"||inR(m.maint_date))).reduce((s,m)=>s+Number(m.cost),0);
    return {n,r,e,net:r-e};
  }).filter(c=>c.r>0||c.e>0);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <TH title="المالية"/>
        {onAddExpense&&<button className="btn bp" onClick={onAddExpense}>+ إضافة مصروف</button>}
      </div>
      <div className="row" style={{marginBottom:12}}>
        <div className="row">
          {[{v:"this_month",l:"هذا الشهر"},{v:"last_month",l:"الشهر الماضي"},{v:"this_year",l:"هذا العام"},{v:"all",l:"كل الوقت"},{v:"custom",l:"مخصص"}].map(p=>(
            <button key={p.v} className="btn" onClick={()=>setPeriod(p.v)}
              style={{background:period===p.v?B:W,color:period===p.v?S:B,border:"1.5px solid "+(period===p.v?B:"rgba(197,172,136,.4)"),padding:"8px 12px",fontSize:12}}>
              {p.l}
            </button>
          ))}
        </div>
        <select className="inp" style={{width:"auto",minWidth:150}} value={fch} onChange={e=>setFch(e.target.value)}>
          <option value="الكل">كل الشاليهات</option>
          {names.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {period==="custom"&&(
        <div className="row" style={{marginBottom:12}}>
          <div><label className="lbl">من</label><input className="inp" type="date" style={{width:"auto"}} value={cf} onChange={e=>setCf(e.target.value)}/></div>
          <div><label className="lbl">إلى</label><input className="inp" type="date" style={{width:"auto"}} value={ct} onChange={e=>setCt(e.target.value)}/></div>
        </div>
      )}
      <div style={{marginBottom:18,padding:"7px 12px",background:SL,borderRadius:8,display:"inline-block",fontSize:13,color:T,fontWeight:600}}>
        {"تقرير: "+plab+(fch!=="الكل"?" · "+fch:"")}
      </div>
      <div className="sg" style={{marginBottom:20}}>
        {[
          {l:"الإيرادات",          v:rev.toLocaleString()+" ر",     i:"💵",bg:"linear-gradient(135deg,"+T+","+TD+")",c:"#fff"},
          {l:"تكاليف الصيانة",    v:mex.toLocaleString()+" ر",     i:"🔧",bg:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",c:"#fff"},
          {l:"صافي الربح",        v:net.toLocaleString()+" ر",     i:"📈",bg:net>=0?"linear-gradient(135deg,"+SA+","+SD+")":"linear-gradient(135deg,#8B3A3A,#6B2A2A)",c:"#fff"},
          {l:"إيداعات التأمين",   v:insIn.toLocaleString()+" ر",   i:"🛡️",bg:"linear-gradient(135deg,"+B+","+BD+")",c:S},
          {l:"إجمالي المصاريف",   v:exTotal.toLocaleString()+" ر", i:"💸",bg:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",c:"#fff"},
          {l:"صافي الربح الحقيقي",v:trueNet.toLocaleString()+" ر", i:"🏆",bg:trueNet>=0?"linear-gradient(135deg,"+T+","+TD+")":"linear-gradient(135deg,#8B3A3A,#6B2A2A)",c:"#fff"},
          {l:"عدد الحجوزات",      v:String(fb.length),              i:"📅",bg:W,c:B},
          {l:"ليالي محجوزة",      v:String(nts),                    i:"🌙",bg:W,c:B},
        ].map((s,i)=>(
          <div key={i} style={{background:s.bg,borderRadius:12,padding:"16px",boxShadow:"0 4px 14px rgba(65,53,35,.1)",border:s.bg===W?"1px solid rgba(197,172,136,.3)":"none"}}>
            <div style={{fontSize:18,marginBottom:4}}>{s.i}</div>
            <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
            <div style={{fontSize:11,color:s.bg===W?T:"rgba(255,255,255,.8)",marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
      {fch==="الكل"&&csum.length>0&&(
        <div className="card" style={{overflow:"hidden",marginBottom:16}}>
          <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>{"🏠 مقارنة الشاليهات — "+plab}</div>
          <Tbl heads={["الشاليه","الإيرادات","تكاليف الصيانة","صافي الربح","نسبة الربح"]}
            rows={csum.map((c,i)=>{
              const pct=c.r>0?Math.min(100,Math.max(0,(c.net/c.r)*100)):0;
              return (
                <tr key={i}>
                  <td style={{fontWeight:700}}>{"🏠 "+c.n}</td>
                  <td style={{fontWeight:700,color:T}}>{c.r.toLocaleString()+" ر"}</td>
                  <td style={{fontWeight:700,color:"#8B3A3A"}}>{c.e.toLocaleString()+" ر"}</td>
                  <td style={{fontWeight:800,color:c.net>=0?SD:"#8B3A3A"}}>{c.net.toLocaleString()+" ر"}</td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{flex:1,background:"#f1f5f9",borderRadius:99,height:7,overflow:"hidden",minWidth:60}}>
                        <div style={{width:pct+"%",height:"100%",background:c.net>=0?SA:"#8B3A3A",borderRadius:99}}></div>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,color:c.net>=0?SD:"#8B3A3A",minWidth:32}}>{Math.round(pct)+"%"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          />
        </div>
      )}
      <div className="card" style={{overflow:"hidden",marginBottom:16}}>
        <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>{"💵 إيرادات الحجوزات ("+fb.length+")"}</div>
        {fb.length===0
          ? <div style={{padding:24,textAlign:"center",color:SI}}>لا توجد حجوزات في هذه الفترة</div>
          : <Tbl heads={["الضيف","الشاليه","الفترة","الليالي","المبلغ","الحالة"]}
              rows={fb.map(b=>(
                <tr key={b.id}>
                  <td style={{fontWeight:600}}>{b.guest}</td>
                  <td>{b.chalet}</td>
                  <td style={{fontSize:12}}>{fd(b.date_from)+" - "+fd(b.date_to)}</td>
                  <td style={{textAlign:"center"}}>{fn(b.date_from,b.date_to)}</td>
                  <td style={{fontWeight:700,color:T}}>{Number(b.price).toLocaleString()+" ر"}</td>
                  <td><Bdg bg={STATUS[b.status]?.bg||"#eee"} color={STATUS[b.status]?.color||"#333"}>{STATUS[b.status]?.label||b.status}</Bdg></td>
                </tr>
              ))}
              footer={[
                <td key={0} colSpan={4} style={{fontWeight:800,color:B}}>الإجمالي</td>,
                <td key={1} style={{fontWeight:800,color:T,fontSize:15}}>{rev.toLocaleString()+" ر"}</td>,
                <td key={2}/>
              ]}
            />
        }
      </div>
      {fm.length>0&&(
        <div className="card" style={{overflow:"hidden",marginBottom:16}}>
          <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>{"🔧 تكاليف الصيانة ("+fm.length+")"}</div>
          <Tbl heads={["الشاليه","المشكلة","التاريخ","التكلفة"]}
            rows={fm.map(m=>(
              <tr key={m.id}>
                <td style={{fontWeight:600}}>{m.chalet}</td>
                <td>{m.issue}</td>
                <td>{fd(m.maint_date)}</td>
                <td style={{fontWeight:700,color:"#8B3A3A"}}>{Number(m.cost).toLocaleString()+" ر"}</td>
              </tr>
            ))}
            footer={[
              <td key={0} colSpan={3} style={{fontWeight:800,color:B}}>الإجمالي</td>,
              <td key={1} style={{fontWeight:800,color:"#8B3A3A",fontSize:15}}>{mex.toLocaleString()+" ر"}</td>
            ]}
          />
        </div>
      )}
      {fex.length>0&&(
        <div className="card" style={{overflow:"hidden",marginBottom:16}}>
          <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>{"💸 المصاريف ("+fex.length+")"}</span>
            <span style={{fontWeight:800,color:"#8B3A3A"}}>{exTotal.toLocaleString()+" ر"}</span>
          </div>
          <Tbl heads={["التاريخ","الشاليه","الفئة","المبلغ","ملاحظة","حذف"]}
            rows={[...fex].reverse().map((e,i)=>(
              <tr key={i}>
                <td style={{fontSize:12}}>{fd(e.expense_date)}</td>
                <td style={{fontWeight:600}}>{e.chalet}</td>
                <td><Bdg bg="#FEF3C7" color="#92400E">{e.category}</Bdg></td>
                <td style={{fontWeight:700,color:"#8B3A3A"}}>{Number(e.amount).toLocaleString()+" ر"}</td>
                <td style={{color:T,fontSize:12}}>{e.note||"-"}</td>
                <td><button className="btn bd bsm" onClick={async()=>{await db("expenses","DELETE",null,e.id);onReload&&onReload();}}>🗑️</button></td>
              </tr>
            ))}
            footer={[
              <td key={0} colSpan={3} style={{fontWeight:800,color:B}}>الإجمالي</td>,
              <td key={1} style={{fontWeight:800,color:"#8B3A3A",fontSize:15}}>{exTotal.toLocaleString()+" ر"}</td>,
              <td key={2}/>,<td key={3}/>
            ]}
          />
        </div>
      )}
      {ft.length>0&&(
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>{"🛡️ معاملات التأمين ("+ft.length+")"}</div>
          <Tbl heads={["التاريخ","الشاليه","النوع","المبلغ","ملاحظة","إجراءات"]}
            rows={[...ft].reverse().map((t,i)=>(
              <tr key={i}>
                <td>{fd(t.trans_date)}</td>
                <td style={{fontWeight:600}}>{t.chalet}</td>
                <td><Bdg bg={t.type==="إيداع"?"#EEF0E9":"#F5E6E6"} color={t.type==="إيداع"?SD:"#8B3A3A"}>{t.type}</Bdg></td>
                <td style={{fontWeight:700,color:t.type==="إيداع"?T:"#8B3A3A"}}>{(t.type==="إيداع"?"+":"-")+t.amount.toLocaleString()+" ر"}</td>
                <td style={{color:T,fontSize:12}}>{t.note||"-"}</td>
                <td><div style={{display:"flex",gap:4}}><button className="btn be bsm" onClick={()=>onEdit&&onEdit(t)}>تعديل</button><button className="btn bd bsm" onClick={async()=>{if(window.confirm("حذف هذا الصف؟")){await db("wallet","DELETE",null,t.id);onReload&&onReload();}}}>حذف</button></div></td>
              </tr>
            ))}
          />
        </div>
      )}
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

  const statBox = (icon: string, label: string, value: number, color: string) => (
    <div style={{ background:"var(--card)", borderRadius:16, padding:"18px 20px", border:"1px solid var(--border)", display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ fontSize:32 }}>{icon}</div>
      <div>
        <div style={{ fontSize:24, fontWeight:800, color }}>{value}</div>
        <div style={{ fontSize:12, opacity:.6, marginTop:2 }}>{label}</div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#2C1810,#3D2B1A)", borderRadius:18, padding:"24px 28px", marginBottom:24, border:"1px solid rgba(197,172,136,.25)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:"#C8B89A" }}>🏆 برنامج ولاء ريتام</div>
            <div style={{ fontSize:13, color:"rgba(197,172,136,.6)", marginTop:4 }}>اجمع 3 تذاكر واحصل على ليلة مجانية في أي شاليه</div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={() => { setNewCard({name:"",phone:"",tickets:0,free_nights:0}); setAddMdl(true); }} style={{
              background:"linear-gradient(135deg,#B8960C,#C8B89A)", color:"#1a1a2e", border:"none",
              borderRadius:10, padding:"9px 16px", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"'Tajawal',sans-serif",
            }}>+ إضافة عميل</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:24 }}>
        {statBox("👥", "إجمالي الأعضاء",    totalMembers,  "var(--text)")}
        {statBox("🎁", "ليالٍ مجانية معلقة", totalPending,  "#4ADE80")}
        {statBox("🔥", "على وشك الجائزة",   nearlyThere,   "#F59E0B")}
        {statBox("⭐", "إجمالي التقييمات",   totalReviews,  "#C8B89A")}
      </div>

      {/* Search + Filter */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو الجوال..."
          style={{ flex:1, minWidth:180, padding:"9px 14px", borderRadius:10, border:"1px solid var(--border)", background:"var(--card)", color:"var(--text)", fontSize:13, fontFamily:"'Tajawal',sans-serif" }}
        />
        {(["all","pending","active"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:"9px 16px", borderRadius:10, border:"1px solid var(--border)", fontFamily:"'Tajawal',sans-serif",
            fontWeight:700, fontSize:13, cursor:"pointer",
            background: filter === f ? "var(--primary)" : "var(--card)",
            color: filter === f ? "#fff" : "var(--text)",
          }}>
            {f === "all" ? "الكل" : f === "pending" ? "🎁 ليالٍ معلقة" : "🎫 لديهم تذاكر"}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      {filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:60, opacity:.4 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🏆</div>
          <div>لا يوجد عملاء</div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
        {filtered.map(c => {
          const loyaltyUrl = `${BASE_URL}?guest=1&m=loyalty&phone=${c.phone}`;
          return (
            <div key={c.id} style={{
              background:"var(--card)", borderRadius:16, border:"1px solid var(--border)",
              overflow:"hidden", transition:"box-shadow .2s",
              boxShadow: c.free_nights > 0 ? "0 0 0 2px #4ADE80" : c.tickets === 2 ? "0 0 0 2px #F59E0B" : "none",
            }}>
              {/* Card Header */}
              <div style={{ background:"linear-gradient(135deg,#2C1810,#3D2B1A)", padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:800, color:"#C8B89A", fontSize:14 }}>{c.name}</div>
                  <div style={{ fontSize:11, color:"rgba(197,172,136,.6)", marginTop:2, direction:"ltr", textAlign:"right" }}>{c.phone}</div>
                </div>
                <div style={{ display:"flex", gap:4 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{
                      width:28, height:28, borderRadius:8, fontSize:14,
                      background: i < c.tickets ? "linear-gradient(135deg,#B8960C,#C8B89A)" : "rgba(197,172,136,.12)",
                      border: i < c.tickets ? "none" : "1.5px dashed rgba(197,172,136,.3)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}>{i < c.tickets ? "🎫" : ""}</div>
                  ))}
                </div>
              </div>

              {/* Card Body */}
              <div style={{ padding:"12px 16px" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
                  <div style={{ textAlign:"center", background:"var(--surface)", borderRadius:10, padding:"8px 4px" }}>
                    <div style={{ fontWeight:800, fontSize:18, color:"#C8B89A" }}>{c.tickets}/3</div>
                    <div style={{ fontSize:10, opacity:.6 }}>تذاكر</div>
                  </div>
                  <div style={{ textAlign:"center", background:"var(--surface)", borderRadius:10, padding:"8px 4px" }}>
                    <div style={{ fontWeight:800, fontSize:18, color: c.free_nights > 0 ? "#4ADE80" : "var(--text)" }}>{c.free_nights}</div>
                    <div style={{ fontSize:10, opacity:.6 }}>ليالٍ مجانية</div>
                  </div>
                  <div style={{ textAlign:"center", background:"var(--surface)", borderRadius:10, padding:"8px 4px" }}>
                    <div style={{ fontWeight:800, fontSize:18 }}>{c.total_reviews}</div>
                    <div style={{ fontSize:10, opacity:.6 }}>تقييمات</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ background:"rgba(197,172,136,.15)", borderRadius:99, height:5, marginBottom:12 }}>
                  <div style={{ width:`${(c.tickets/3)*100}%`, height:"100%", borderRadius:99, transition:"width .4s", background: c.tickets === 3 ? "#4ADE80" : "linear-gradient(90deg,#B8960C,#C8B89A)" }}/>
                </div>

                {c.free_nights > 0 && (
                  <button onClick={() => useNight(c)} style={{
                    width:"100%", marginBottom:8, padding:"9px", borderRadius:10, border:"none",
                    background:"linear-gradient(135deg,#14532D,#166534)", color:"#4ADE80",
                    fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"'Tajawal',sans-serif",
                  }}>✓ استخدام ليلة مجانية ({c.free_nights})</button>
                )}

                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => window.open(loyaltyUrl, "_blank")} style={{
                    flex:1, padding:"8px", borderRadius:10, border:"1px solid rgba(197,172,136,.3)",
                    background:"linear-gradient(135deg,#B8960C,#C8B89A)", color:"#1a1a2e",
                    fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"'Tajawal',sans-serif",
                  }}>🏆 بطاقة الضيف</button>
                  <button onClick={() => {
                    const ph = c.phone.replace(/^0/, "966");
                    const msg = `مرحباً ${c.name}! 🌟%0aلديك ${c.tickets}/3 تذاكر في برنامج ولاء ريتام%0aشاهد بطاقتك: ${loyaltyUrl}`;
                    window.open(`https://wa.me/${ph}?text=${msg}`, "_blank");
                  }} style={{
                    padding:"8px 12px", borderRadius:10, border:"1px solid rgba(37,211,102,.3)",
                    background:"rgba(37,211,102,.1)", color:"#25D366",
                    fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"'Tajawal',sans-serif",
                  }}>📲</button>
                  <button onClick={() => setEditMdl({...c})} style={{
                    padding:"8px 12px", borderRadius:10, border:"1px solid var(--border)",
                    background:"var(--surface)", color:"var(--text)",
                    fontSize:12, cursor:"pointer", fontFamily:"'Tajawal',sans-serif",
                  }}>✏️</button>
                  <button onClick={() => deleteCard(c)} style={{
                    padding:"8px 12px", borderRadius:10, border:"none",
                    background:"rgba(239,68,68,.1)", color:"#EF4444",
                    fontSize:12, cursor:"pointer", fontFamily:"'Tajawal',sans-serif",
                  }}>🗑️</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reviews Section */}
      <div style={{ marginTop:32, marginBottom:8 }}>
        <div style={{ fontWeight:800, fontSize:17, marginBottom:16 }}>⭐ تقييمات الضيوف</div>
        {reviews.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:12, marginBottom:20 }}>
            {[
              { l:"إجمالي التقييمات", v:String(reviews.length), i:"📝", col:"var(--text)" },
              { l:"متوسط التقييم",    v:(reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1)+" ⭐", i:"⭐", col:"#F59E0B" },
              { l:"تقييم 5 نجوم",    v:String(reviews.filter(r=>r.rating===5).length), i:"🌟", col:"#10b981" },
            ].map((s,i) => (
              <div key={i} style={{ background:"var(--card)", borderRadius:12, padding:16, border:"1px solid var(--border)" }}>
                <div style={{ fontSize:20, marginBottom:5 }}>{s.i}</div>
                <div style={{ fontSize:20, fontWeight:800, color:s.col }}>{s.v}</div>
                <div style={{ fontSize:11, opacity:.6, marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        )}
        {reviews.length === 0
          ? <div style={{ textAlign:"center", padding:40, opacity:.4 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>⭐</div>
              <div>لا توجد تقييمات بعد</div>
            </div>
          : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))", gap:12 }}>
              {[...reviews].reverse().map((r,i) => (
                <div key={i} style={{ background:"var(--card)", borderRadius:14, padding:16, border:"1px solid var(--border)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14 }}>{r.guest}</div>
                      <div style={{ fontSize:12, opacity:.6 }}>{r.chalet}</div>
                    </div>
                    <div style={{ display:"flex", gap:2 }}>
                      {[1,2,3,4,5].map(s=><span key={s} style={{ fontSize:16, color:r.rating>=s?"#F59E0B":"#E5E7EB" }}>★</span>)}
                    </div>
                  </div>
                  {r.comment && <div style={{ fontSize:13, opacity:.8, background:"var(--surface)", borderRadius:8, padding:"8px 12px", lineHeight:1.7, marginBottom:8 }}>{r.comment}</div>}
                  <div style={{ fontSize:11, opacity:.5 }}>{new Date(r.created_at).toLocaleDateString("ar-SA")}</div>
                </div>
              ))}
            </div>
        }
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
      <div style={{marginTop:20, background:"linear-gradient(135deg,#2C1810,#3D2B1A)", borderRadius:16, padding:16, border:"1px solid rgba(197,172,136,.3)"}}>
        <div style={{fontSize:20, marginBottom:6}}>🎫</div>
        <div style={{fontWeight:800, color:"#C8B89A", fontSize:14, marginBottom:4}}>حصلت على تذكرة ولاء!</div>
        <div style={{fontSize:12, color:"rgba(197,172,136,.7)", marginBottom:12}}>اجمع 3 تذاكر واحصل على ليلة مجانية</div>
        {loyaltyUrl
          ? <a href={loyaltyUrl} target="_blank" rel="noopener noreferrer" style={{display:"block", background:"linear-gradient(135deg,#B8960C,#C8B89A)", color:"#1a1a2e", borderRadius:10, padding:"10px 16px", fontWeight:800, fontSize:13, textDecoration:"none"}}>🏆 شاهد بطاقتك</a>
          : <div style={{fontSize:12, color:"rgba(197,172,136,.5)"}}>تواصل معنا لمعرفة رصيد تذاكرك</div>
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
  const TERMS = `شروط وأحكام الإقامة — مجموعة ريتام\n\n١. يُمنع إدخال المسكرات أو المخدرات.\n٢. يُمنع إقامة الحفلات الصاخبة.\n٣. المحافظة على نظافة الشاليه.\n٤. أي تلف يتحمله الضيف.\n٥. وقت تسجيل الخروج ١٢:٠٠ ظهراً.\n٦. يُمنع إدخال حيوانات أليفة.\n٧. في حالة الإلغاء قبل ٤٨ ساعة يُسترد المبلغ.`;
  
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

  const GS = `@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Tajawal',sans-serif;background:#FAF8F5;min-height:100vh}`;
  const wrap = {fontFamily:"'Tajawal',sans-serif",minHeight:"100vh",background:"#FAF8F5",display:"flex",alignItems:"center",justifyContent:"center",padding:16};
  const card = {background:W,borderRadius:20,padding:24,maxWidth:480,width:"100%",boxShadow:"0 4px 24px rgba(65,53,35,.1)"};

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
          <div style={{background:"#F5EFE6",borderRadius:12,padding:16,marginBottom:16,maxHeight:260,overflowY:"auto"}}>
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
            fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,
            background:pdplConsent?`linear-gradient(135deg,${B},#2A2218)`:"#D1D5DB",
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
          <div style={{background:"rgba(87,109,111,.08)",borderRadius:12,padding:14,fontSize:13,color:T}}>
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
            style={{width:"100%",padding:"12px 14px",border:"1.5px solid rgba(197,172,136,.4)",borderRadius:12,fontSize:14,fontFamily:"'Tajawal',sans-serif",color:B,background:"#FAF8F5",outline:"none",resize:"none",marginBottom:16}}/>
          <button onClick={submitReview} disabled={!rating}
            style={{width:"100%",border:"none",cursor:rating?"pointer":"not-allowed",borderRadius:12,fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,background:rating?`linear-gradient(135deg,${B},#2A2218)`:"#D1D5DB",color:rating?S:"#fff"}}>
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
            <div style={{fontSize:12,color:T,marginTop:6,background:"#F5EFE6",borderRadius:8,padding:"8px 12px"}}>
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
      <div style={{fontWeight:700,color:"#413523",marginBottom:4}}>طلبك السابق: {booking.pool_preference==="on_arrival"?"تعبئة عند الوصول":"جاهز عند الوصول"}</div>
      <div style={{fontSize:12,color:"#576D6F"}}>يمكنك تغيير اختيارك</div>
      <button onClick={()=>setSent(false)} style={{marginTop:12,background:"#413523",color:"#C5AC88",border:"none",borderRadius:10,padding:"10px 22px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Tajawal',sans-serif"}}>تغيير الاختيار</button>
    </div>
  );

  return (
    <div>
      <div style={{display:"grid",gap:10,marginBottom:16}}>
        {options.map(o=>(
          <div key={o.val} onClick={()=>setChoice(o.val)} style={{
            borderRadius:12,padding:"14px 16px",cursor:"pointer",
            border: choice===o.val ? "2px solid #413523" : "1.5px solid rgba(197,172,136,.4)",
            background: choice===o.val ? "#F5EFE6" : "#fff",
            transition:"all .15s",
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:28}}>{o.icon}</span>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:"#413523"}}>{o.title}</div>
                <div style={{fontSize:12,color:"#576D6F",marginTop:2}}>{o.sub}</div>
              </div>
              {choice===o.val&&<span style={{marginRight:"auto",fontSize:18}}>✅</span>}
            </div>
            {choice==="ready"&&o.val==="ready"&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(197,172,136,.3)"}}>
                <label style={{fontSize:12,color:"#576D6F",fontWeight:600,display:"block",marginBottom:6}}>وقت الوصول المتوقع (اختياري)</label>
                <input type="time" value={readyTime} onChange={e=>setReadyTime(e.target.value)}
                  style={{width:"100%",padding:"8px 12px",border:"1.5px solid rgba(197,172,136,.4)",borderRadius:8,fontSize:14,fontFamily:"'Tajawal',sans-serif",color:"#413523",background:"#FAF8F5",outline:"none"}}/>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={submit} disabled={!choice||loading} style={{
        width:"100%",border:"none",cursor:choice?"pointer":"not-allowed",borderRadius:12,
        fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,
        background:choice?"linear-gradient(135deg,#413523,#2A2218)":"#D1D5DB",color:choice?"#C5AC88":"#fff",
        opacity:loading?.7:1,
      }}>{loading?"جاري الإرسال...":"إرسال الطلب 📨"}</button>
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

  const GS = `@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Tajawal',sans-serif;background:#FAF8F5;min-height:100vh}`;
  const wrap = { fontFamily:"'Tajawal',sans-serif", minHeight:"100vh", background:"#FAF8F5", display:"flex", alignItems:"center", justifyContent:"center", padding:16 } as const;
  const card = { background:"#fff", borderRadius:20, padding:24, maxWidth:420, width:"100%", boxShadow:"0 4px 24px rgba(65,53,35,.1)" } as const;

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
        <div style={{ fontSize:22, fontWeight:800, color:"#413523", marginBottom:8 }}>تم إرسال طلبك</div>
        <div style={{ fontSize:14, color:"#576D6F", marginBottom:20 }}>سنتواصل معك في أقرب وقت</div>
        <button onClick={()=>{ setDone(false); setType(""); setNote(""); }}
          style={{ background:"#413523", color:"#C5AC88", border:"none", borderRadius:12, padding:"12px 28px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Tajawal',sans-serif" }}>
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
          <div style={{ fontSize:20, fontWeight:800, color:"#413523" }}>خدمة الغرف</div>
          <div style={{ fontSize:13, color:"#576D6F", marginTop:6,
            background:"#F5EFE6", borderRadius:8, padding:"6px 12px", display:"inline-block" }}>
            {chalet} · {room}
          </div>
        </div>

        {/* Types */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          {ROOM_REQUEST_TYPES.map(t => (
            <div key={t.val} onClick={()=>setType(t.val)} style={{
              borderRadius:12, padding:"14px 12px", cursor:"pointer", textAlign:"center",
              border: type===t.val ? `2px solid ${t.color}` : "1.5px solid rgba(197,172,136,.35)",
              background: type===t.val ? t.color+"11" : "#fff",
              transition:"all .15s",
            }}>
              <div style={{ fontSize:28, marginBottom:6 }}>{t.icon}</div>
              <div style={{ fontSize:12, fontWeight:700, color: type===t.val ? t.color : "#413523" }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Note */}
        <textarea
          placeholder="تفاصيل إضافية (اختياري)..."
          value={note} onChange={e=>setNote(e.target.value)} rows={3}
          style={{ width:"100%", padding:"12px 14px", border:"1.5px solid rgba(197,172,136,.35)",
            borderRadius:12, fontSize:14, fontFamily:"'Tajawal',sans-serif", color:"#413523",
            background:"#FAF8F5", outline:"none", resize:"none", marginBottom:16 }}
        />

        {err&&<div style={{marginBottom:10,padding:"10px 14px",background:"#FEE2E2",borderRadius:10,fontSize:12,color:"#DC2626",fontWeight:600}}>⚠️ {err}</div>}
        <button onClick={submit} disabled={!type||loading} style={{
          width:"100%", border:"none", borderRadius:12, fontFamily:"'Tajawal',sans-serif",
          fontWeight:700, fontSize:16, padding:14,
          background: type ? "linear-gradient(135deg,#413523,#2A2218)" : "#E5E7EB",
          color: type ? "#C5AC88" : "#9CA3AF",
          cursor: type ? "pointer" : "not-allowed", opacity: loading ? .7 : 1,
        }}>{loading ? "جاري الإرسال..." : "إرسال الطلب 🔔"}</button>
      </div>
    </div>
  );
}

function LoginPage({onLogin,onShowSignup}: {onLogin:(u:AppUser)=>void; onShowSignup:()=>void}) {
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
    <div dir="rtl" style={{fontFamily:"'Tajawal',sans-serif",minHeight:"100vh",background:"#FAF8F5",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <style>{CSS}</style>
      <div style={{background:"#fff",borderRadius:20,padding:32,maxWidth:400,width:"100%",boxShadow:"0 8px 40px rgba(65,53,35,.12)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <Logo size={50}/>
          <div style={{fontWeight:800,color:B,fontSize:20,marginTop:12}}>مجموعة ريتام</div>
          <div style={{color:T,fontSize:13,marginTop:4}}>نظام إدارة الشاليهات</div>
        </div>
        {err&&<div style={{background:"#FFF5F5",border:"1px solid rgba(139,58,58,.2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#8B3A3A",fontWeight:600}}>{err}</div>}
        <div style={{marginBottom:14}}>
          <label className="lbl">البريد الإلكتروني</label>
          <input className="inp" type="email" value={login} onChange={e=>setLogin(e.target.value)} placeholder="name@example.com" onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        <div style={{marginBottom:20}}>
          <label className="lbl">كلمة المرور</label>
          <input className="inp" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        <button onClick={doLogin} disabled={loading}
          style={{width:"100%",border:"none",cursor:loading?"not-allowed":"pointer",borderRadius:12,fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,background:"linear-gradient(135deg,#413523,#2A2218)",color:"#C5AC88"}}>
          {loading?"جاري التحقق...":"تسجيل الدخول"}
        </button>
        <div style={{textAlign:"center",marginTop:18,fontSize:13,color:T}}>
          صاحب شاليه جديد؟ <span onClick={onShowSignup} style={{color:B,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>سجّل حسابك</span>
        </div>
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
    <div dir="rtl" style={{fontFamily:"'Tajawal',sans-serif",minHeight:"100vh",background:"#FAF8F5",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <style>{CSS}</style>
      <div style={{background:"#fff",borderRadius:20,padding:32,maxWidth:420,width:"100%",boxShadow:"0 8px 40px rgba(65,53,35,.12)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <Logo size={50}/>
          <div style={{fontWeight:800,color:B,fontSize:20,marginTop:12}}>تسجيل حساب جديد</div>
          <div style={{color:T,fontSize:13,marginTop:4}}>لأصحاب الشاليهات — أضف شاليهاتك وأدرها بنفسك</div>
        </div>
        {err&&<div style={{background:"#FFF5F5",border:"1px solid rgba(139,58,58,.2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#8B3A3A",fontWeight:600}}>{err}</div>}
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
          style={{width:"100%",border:"none",cursor:loading?"not-allowed":"pointer",borderRadius:12,fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,background:"linear-gradient(135deg,#413523,#2A2218)",color:"#C5AC88"}}>
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
  const GS = `@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Tajawal',sans-serif;background:#1a1a2e;min-height:100vh}`;
  const wrap = { fontFamily:"'Tajawal',sans-serif", minHeight:"100vh", background:"linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 };

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
          border:"1px solid rgba(197,172,136,.3)",
          boxShadow:"0 20px 60px rgba(0,0,0,.5)",
          position:"relative", overflow:"hidden",
        }}>
          {/* زخرفة */}
          <div style={{ position:"absolute", top:-30, left:-30, width:120, height:120, background:"rgba(197,172,136,.07)", borderRadius:"50%" }}/>
          <div style={{ position:"absolute", bottom:-20, right:-20, width:80, height:80, background:"rgba(197,172,136,.05)", borderRadius:"50%" }}/>

          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
              <div>
                <div style={{ fontSize:11, color:"rgba(197,172,136,.6)", letterSpacing:1 }}>العميل</div>
                <div style={{ fontSize:18, fontWeight:800, color:"#C8B89A", marginTop:2 }}>{card?.name || "ضيف ريتام"}</div>
              </div>
              <div style={{ fontSize:28 }}>🏆</div>
            </div>

            {/* طوابع التذاكر */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, color:"rgba(197,172,136,.6)", marginBottom:12 }}>تذاكرك ({tickets}/3)</div>
              <div style={{ display:"flex", gap:12 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    flex:1, aspectRatio:"1", borderRadius:16,
                    background: i < tickets ? "linear-gradient(135deg,#B8960C,#C8B89A)" : "rgba(197,172,136,.1)",
                    border: i < tickets ? "2px solid #C8B89A" : "2px dashed rgba(197,172,136,.3)",
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
            <div style={{ background:"rgba(197,172,136,.1)", borderRadius:99, height:6, marginBottom:8 }}>
              <div style={{ width:`${(tickets/3)*100}%`, height:"100%", background:"linear-gradient(90deg,#B8960C,#C8B89A)", borderRadius:99, transition:"width .5s" }}/>
            </div>
            <div style={{ fontSize:11, color:"rgba(197,172,136,.5)", textAlign:"center" }}>
              {tickets === 3 ? "🎉 مبروك! لديك ليلة مجانية" : `${3 - tickets} تذكرة متبقية للليلة المجانية`}
            </div>
          </div>
        </div>

        {/* الإحصائيات */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div style={{ background:"rgba(255,255,255,.05)", borderRadius:16, padding:16, border:"1px solid rgba(197,172,136,.15)" }}>
            <div style={{ fontSize:24, fontWeight:800, color:"#C8B89A" }}>{totalReviews}</div>
            <div style={{ fontSize:12, color:"rgba(200,184,154,.6)", marginTop:2 }}>إجمالي التقييمات</div>
          </div>
          <div style={{ background:"rgba(255,255,255,.05)", borderRadius:16, padding:16, border:"1px solid rgba(197,172,136,.15)" }}>
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
  const wrap = { fontFamily:"'Tajawal',sans-serif", minHeight:"100vh", background:"#F0F7F0", display:"flex", alignItems:"center", justifyContent:"center", padding:16 } as const;
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

  useEffect(()=>{
    const p = new URLSearchParams(window.location.search);
    if(p.get("guest")==="1"){
      setGuestParams({bookingId:p.get("b"),mode:p.get("m")||"checkin",chalet:p.get("ch"),room:p.get("rm")});
      setIsGuest(true);
      setReady(true);
      return;
    }
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
  },[]);

  if(!ready) return null;
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
    return <GuestPageEmbed bookingId={guestParams.bookingId} mode={guestParams.mode}/>;
  }
  if(!currentUser){
    if(showSignup) return <SignupPage onSignedUp={u=>setCurrentUser(u)} onBack={()=>setShowSignup(false)}/>;
    return <LoginPage onLogin={u=>setCurrentUser(u)} onShowSignup={()=>setShowSignup(true)}/>;
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
  const [selB,setSelB]             = useState<Booking | null>(null);

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
  const [loading,setLoading]   = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [fch,setFch]           = useState("الكل");
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
  const [uMdl,setUMdl]       = useState<Partial<AppUser> | null>(null);
  const [addRoomMdl,setAddRoomMdl] = useState<Partial<Room> | null>(null);

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
        db("smart_devices"), db("rooms"), db("reviews"), db("expenses"), db("users"),
        db("room_requests","GET",null,"resolved=eq.false&order=created_at.desc"),
      ]);
      const [fx,cw,lc] = await Promise.all([
        db("fixed_expenses").catch(()=>[]),
        db("cleaning_workers").catch(()=>[]),
        db("loyalty_cards","GET",null,"order=total_reviews.desc").catch(()=>[]),
      ]);
      const sdMap = {};
      (sd||[]).forEach(d=>{if(d.room_id)sdMap["room_"+d.room_id]=d;else sdMap[d.chalet]=d;});
      setChalets((c||[]).map(ch=>({...ch,_acOn:sdMap[ch.name]?.ac_on||false,_acTemp:sdMap[ch.name]?.ac_temp||22,_acMode:sdMap[ch.name]?.ac_mode||"cool",_acSpeed:sdMap[ch.name]?.ac_speed||"auto",_sdId:sdMap[ch.name]?.id||null})));
      setRooms((rm||[]).map(r=>({...r,_acOn:sdMap["room_"+r.id]?.ac_on||false,_acTemp:sdMap["room_"+r.id]?.ac_temp||22,_acMode:sdMap["room_"+r.id]?.ac_mode||"cool",_acSpeed:sdMap["room_"+r.id]?.ac_speed||"auto",_sdId:sdMap["room_"+r.id]?.id||null})));
      if(!ctasks) console.error("⚠️ cleaning_tasks فشل التحميل — تحقق من RLS في Supabase");
      if(!clogs)  console.error("⚠️ cleaning_logs فشل التحميل");
      setBookings(b||[]); setMaint(m||[]); setWallet(w||[]); setCleaning(cl||[]); setClExp(cle||[]); setClTasks(ctasks||[]); setClLogs(clogs||[]);
      setReviews(rv||[]); setExpenses(ex||[]); setUsers(us||[]); setRoomReqs(rr||[]); setFixedExpenses(fx||[]); setCleanWorkers(cw||[]); setLoyaltyCards(lc||[]);
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
  const totRev   = useMemo(()=>{const br=bookings.filter(b=>b.status==="completed").reduce((s,b)=>s+Number(b.price),0);const pr=chalets.reduce((s,c)=>s+Number(c.prev_revenue||0),0);return br+pr;},[bookings,chalets]);
  const walletBal  = useMemo(()=>wallet.reduce((s,t)=>t.type==="إيداع"?s+t.amount:s-t.amount,0),[wallet]);
  const cleaningBal= useMemo(()=>cleaning.reduce((s,t)=>t.type==="إيداع"?s+t.amount:s-t.amount,0),[cleaning]);
  const actB     = bookings.filter(b=>b.status==="confirmed"||b.status==="pending").length;
  const opM      = maint.filter(m=>m.status==="open").length;
  const mCost    = maint.filter(m=>m.cost).reduce((s,m)=>s+Number(m.cost),0);
  const cBal     = useMemo(()=>{const map={};chalets.forEach(c=>{map[c.name]=0;});wallet.forEach(t=>{if(!Object.prototype.hasOwnProperty.call(map,t.chalet))return;if(t.type==="إيداع")map[t.chalet]+=t.amount;else map[t.chalet]=Math.max(0,map[t.chalet]-t.amount);});return map;},[wallet,chalets]);
  const cStats   = useMemo(()=>{
    const now=new Date(); const y=now.getFullYear(); const mo=now.getMonth();
    // precompute maps once instead of filtering per chalet
    const bMap: Record<string,Booking[]>={};
    for(const b of bookings){if(!bMap[b.chalet])bMap[b.chalet]=[];bMap[b.chalet].push(b);}
    const mMap: Record<string,typeof maint[0][]>={};
    for(const m of maint){if(!mMap[m.chalet])mMap[m.chalet]=[];mMap[m.chalet].push(m);}
    return chalets.map(c=>{
      const cb=bMap[c.name]||[];
      const cm=mMap[c.name]||[];
      const completed=cb.filter(b=>b.status==="completed");
      const rev=completed.reduce((s,b)=>s+Number(b.price),0);
      const monthRev=completed.filter(b=>b.date_from&&new Date(b.date_from).getFullYear()===y&&new Date(b.date_from).getMonth()===mo).reduce((s,b)=>s+Number(b.price),0);
      const monthExp=cm.filter(m=>Number(m.cost)>0&&m.maint_date&&new Date(m.maint_date).getFullYear()===y&&new Date(m.maint_date).getMonth()===mo).reduce((s,m)=>s+Number(m.cost),0);
      return {
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
  },[chalets,bookings,maint,cBal]);

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
    const body={name:f.name,loc:f.loc,cap:Number(f.cap),price:Number(f.price),wprice:Number(f.wprice),ins:Number(f.ins),description:f.description,st:f.st,img:f.img||null,gallery:f.gallery||null,amenities:f.amenities||null,allow_overnight:f.allow_overnight!==false,allow_hourly:!!f.allow_hourly,hourly_slots:f.hourly_slots||null,open_date:openDate,prev_revenue:Number(f.prev_revenue)||0};
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
  async function svB(f: Partial<Booking>): Promise<void> {const body={chalet:f.chalet,guest:f.guest,phone:f.phone,date_from:f.date_from,date_to:f.date_to,checkin_time:f.checkin_time||null,checkout_time:f.checkout_time||null,price:Number(f.price),status:f.status,note:f.note};if(f.id)await db("bookings","PATCH",body as Record<string,unknown>,f.id);else await db("bookings","POST",body as Record<string,unknown>);await loadAll();setBMdl(null);}
  function buildPreArrivalMsg(b: Booking): string {
    const checkinTime  = b.checkin_time  || "الوقت المتفق عليه";
    const checkoutTime = b.checkout_time || "الوقت المتفق عليه";
    const poolUrl = `https://reetam-chalets.vercel.app?guest=1&b=${b.id}&m=pool`;
    return `مرحباً ${b.guest} 👋

نذكّركم بحجزكم في *${b.chalet}* غداً إن شاء الله 🏡

*التفاصيل:*
⏰ وقت الدخول: ${checkinTime}
⏰ وقت الخروج: ${checkoutTime}

🏊 *بخصوص المسبح:*
تعبئة المسبح تتم مرة واحدة فقط — يرجى اختيار ما يناسبكم:
${poolUrl}

*تذكير مهم:*
• يرجى الالتزام بوقت الدخول والخروج المحدد
• في حال التأخر عن وقت الخروج يُطبّق رسوم إضافية

نتطلع لاستقبالكم وتمنياتنا لكم بإقامة ممتعة 🌟
*ريتام للشاليهات*`;
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
  async function svM(f: Partial<MaintenanceRequest>, old?: MaintenanceRequest | null): Promise<void> {const cost=Number(f.cost)||0;const wasDone=old?.status==="done";const isDone=f.status==="done";const isNew=!f.id;const body={chalet:f.chalet,issue:f.issue,maint_date:f.maint_date,priority:f.priority,status:f.status,cost,note:f.note,req:f.req,image:f.image||null};if(f.id)await db("maintenance","PATCH",body as Record<string,unknown>,f.id);else await db("maintenance","POST",body as Record<string,unknown>);if(cost>0&&isDone&&(isNew||!wasDone))await db("wallet","POST",{trans_date:f.maint_date||td(),type:"سحب صيانة",chalet:f.chalet,cat:"صيانة",amount:cost,note:f.issue||"صيانة"});await loadAll();setMMdl(null);}
  async function svAC(chalet: string, field: string, value: unknown, roomId: number | null = null): Promise<void> {if(roomId){const room=rooms.find(r=>r.id===roomId);const body={chalet,room_id:roomId,room_name:room?.name||"",ac_on:field==="ac_on"?value:(room?._acOn||false),ac_temp:field==="ac_temp"?value:(room?._acTemp||22),ac_mode:field==="ac_mode"?value:(room?._acMode||"cool"),ac_speed:field==="ac_speed"?value:(room?._acSpeed||"auto"),updated_at:new Date().toISOString()};if(room?._sdId){await db("smart_devices","PATCH",body as Record<string,unknown>,room._sdId);}else{const res=await db("smart_devices","POST",body as Record<string,unknown>);if(res?.[0])setRooms(p=>p.map(x=>x.id===roomId?{...x,_sdId:(res[0] as Room).id}:x));}await sendACCommand(roomId,field,value);}else{const ch=chalets.find(x=>x.name===chalet);const body={chalet,ac_on:field==="ac_on"?value:(ch?._acOn||false),ac_temp:field==="ac_temp"?value:(ch?._acTemp||22),ac_mode:field==="ac_mode"?value:(ch?._acMode||"cool"),ac_speed:field==="ac_speed"?value:(ch?._acSpeed||"auto"),updated_at:new Date().toISOString()};if(ch?._sdId){await db("smart_devices","PATCH",body as Record<string,unknown>,ch._sdId);}else{const res=await db("smart_devices","POST",body as Record<string,unknown>);if(res?.[0])setChalets(p=>p.map(x=>x.name===chalet?{...x,_sdId:(res[0] as Chalet).id}:x));}}}
  async function svCln(chalet: string, amount: string | number, note: string): Promise<void> {const amt=Number(amount);if(!amt||!chalet)return;await db("cleaning","POST",{trans_date:td(),type:"إيداع",chalet,amount:amt,note:note||"إيداع نظافة"});await loadAll();setClnMdl(false);}
  async function svI(chalet: string, amount: string | number, note: string): Promise<void> {const amt=Number(amount);if(!amt||!chalet)return;await db("wallet","POST",{trans_date:td(),type:"إيداع",chalet,cat:"تأمين",amount:amt,note:note||"إيداع تأمين"});await loadAll();setIMdl(false);}
  async function handleCheckout(booking: Booking, amt: number, pay: string): Promise<void> {
    await db("bookings","PATCH",{status:"completed",price:amt},booking.id);
    // مهمة تنظيف تلقائية بعد الخروج
    await db("cleaning_tasks","POST",{
      chalet: booking.chalet,
      title: `تنظيف بعد خروج ${booking.guest}`,
      frequency: "مرة واحدة",
      category: "تنظيف عام",
      active: true,
      assigned_to: "",
      note: `خروج بتاريخ ${td()} · رقم الحجز ${booking.id}`,
    });
    await loadAll();
    setCoMdl(null);
  }

  const TABS = [
    {id:"dashboard",  l:"الرئيسية",    i:"⊞"},
    {id:"chalets",    l:"الشاليهات",   i:"🏠"},
    {id:"bookings",   l:"الحجوزات",    i:"📅"},
    {id:"finance",    l:"المالية",     i:"💰"},
    {id:"maintenance",l:"الصيانة",     i:"🔧"},
    {id:"insurance",  l:"التأمين",     i:"🛡️"},
    {id:"cleaning",   l:"النظافة",     i:"🧹"},
    {id:"smart",      l:"التحكم الذكي",i:"🌡️"},
    {id:"loyalty",    l:"الولاء والتقييمات", i:"🏆"},
    {id:"settings",   l:"الإعدادات",   i:"⚙️"},
  ];

  function allowedTabs(t) {
    if(isAdmin) return true;
    if(isChaletMgr) return ["dashboard","bookings","maintenance","loyalty","smart"].includes(t.id);
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
            <button key={n} className="btn" onClick={()=>setRname(n)} style={{padding:"6px 12px",fontSize:12,background:rname===n?B:SL,color:rname===n?S:B,border:"1.5px solid rgba(197,172,136,.3)"}}>{n}</button>
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
    const [loading,setLoading]=useState(false);
    return (
      <Mdl onClose={()=>setCoMdl(null)} title="🚪 تسجيل الخروج">
        <div style={{background:SL,borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{fontWeight:800,color:B,fontSize:15,marginBottom:4}}>{booking.guest}</div>
          <div style={{fontSize:13,color:T}}>{booking.chalet} · خروج: {fd(booking.date_to)}</div>
          <div style={{fontSize:12,color:T,marginTop:4}}>{fn(booking.date_from,booking.date_to)+" ليلة · "+Number(booking.price).toLocaleString()+" ر"}</div>
        </div>
        <div style={{marginBottom:12}}><label className="lbl">💰 المبلغ المدفوع (ريال)</label><input className="inp" type="number" value={amt} onChange={e=>setAmt(e.target.value)}/></div>
        <div style={{marginBottom:20}}>
          <label className="lbl">طريقة الدفع</label>
          <div style={{display:"flex",gap:8}}>
            {[{v:"نقد",i:"💵"},{v:"تحويل",i:"📱"},{v:"مدى",i:"💳"}].map(m=>(
              <button key={m.v} className="btn" onClick={()=>setPay(m.v)} style={{flex:1,padding:"10px 0",fontSize:13,background:pay===m.v?B:SL,color:pay===m.v?S:B,border:"1.5px solid rgba(197,172,136,.3)"}}>
                {m.i} {m.v}
              </button>
            ))}
          </div>
        </div>
        <div style={{background:"#FEF3C7",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#92400E",fontWeight:600}}>
          سيتم تسجيل {Number(amt||0).toLocaleString()} ريال في الإيرادات
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn bo" onClick={()=>setCoMdl(null)}>إلغاء</button>
          <button className="btn bp" disabled={loading} onClick={async()=>{setLoading(true);await handleCheckout(booking,Number(amt||0),pay);setLoading(false);}}>
            {loading?"جاري...":"✅ تأكيد الخروج"}
          </button>
        </div>
      </Mdl>
    );
  }

  if(loading) {
    return (
      <div dir="rtl" style={{fontFamily:"'Tajawal',sans-serif",background:OW,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <style>{CSS}</style>
        <div style={{textAlign:"center"}}>
          <Logo size={60}/>
          <div style={{color:T,marginTop:16,fontSize:16,fontWeight:600}}>جاري التحميل...</div>
        </div>
      </div>
    );
  }

  // ─── Sidebar Style ────────────────────────────────────────────────────────
  const sidebarStyle = {
    width:220, background: dark ? "#0F0D0B" : "#2C2419", position:"fixed", top:0, right:0,
    height:"100vh", zIndex:50, overflowY:"auto", display:"flex", flexDirection:"column",
    borderLeft: dark ? "1px solid rgba(197,172,136,.1)" : "none",
  };
  const navBtnStyle = (active) => ({
    display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:8,
    marginBottom:2, color:active?"#C5AC88":"#888", fontSize:13, border:"none",
    background:active?"rgba(197,172,136,.15)":"transparent", width:"100%",
    textAlign:"right", fontFamily:"'Tajawal',sans-serif", fontWeight:500, cursor:"pointer"
  });

  return (
    <div dir="rtl" style={{fontFamily:"'Tajawal',sans-serif",background:OW,minHeight:"100vh"}}>
      <style>{CSS}</style>

      {/* ── Sidebar Desktop ── */}
      {!isMobile && (
        <div style={sidebarStyle}>
          <div style={{padding:"20px 16px",borderBottom:"1px solid rgba(197,172,136,.15)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Logo size={30}/>
              <div>
                <div style={{color:"#C5AC88",fontWeight:800,fontSize:14}}>مجموعة ريتام</div>
                <div style={{color:"#666",fontSize:10,marginTop:2}}>نظام إدارة الشاليهات</div>
              </div>
            </div>
          </div>
          <nav style={{flex:1,padding:"10px 12px",overflowY:"auto"}}>
            {TABS.filter(allowedTabs).map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={navBtnStyle(tab===t.id)}>
                <span style={{fontSize:16,width:22,textAlign:"center"}}>{t.i}</span>
                <span>{t.l}</span>
                {t.id==="bookings"&&actB>0&&<span style={{background:"#C5AC88",color:"#413523",borderRadius:20,fontSize:10,padding:"1px 6px",marginRight:"auto",fontWeight:700}}>{actB}</span>}
              </button>
            ))}
          </nav>
          <div style={{padding:"14px 16px",borderTop:"1px solid rgba(197,172,136,.15)"}}>
            <button onClick={toggleDark} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(197,172,136,.08)",border:"1px solid rgba(197,172,136,.2)",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontFamily:"'Tajawal',sans-serif",marginBottom:10}}>
              <span style={{fontSize:12,color:"#C5AC88",fontWeight:600}}>{dark?"الوضع النهاري":"الوضع الليلي"}</span>
              <span style={{fontSize:16}}>{dark?"☀️":"🌙"}</span>
            </button>
            <div style={{color:"#C5AC88",fontWeight:600,fontSize:13,marginBottom:2}}>{currentUser.name||currentUser.username}</div>
            <div style={{color:"#666",fontSize:11,marginBottom:8}}>{isAdmin?"أدمن":isChaletMgr?"مدير شاليه":"موظف"}</div>
            <button onClick={onLogout} style={{background:"rgba(139,58,58,.2)",color:"#ffaaaa",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:600}}>
              تسجيل الخروج
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile Header ── */}
      {isMobile && (
        <>
          <div style={{background:"#2C2419",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:200}}>
            <button onClick={()=>setDrawerOpen(true)} style={{background:"rgba(197,172,136,.15)",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",display:"flex",flexDirection:"column",gap:4}}>
              <span style={{display:"block",width:20,height:2,background:"#C5AC88",borderRadius:2}}/>
              <span style={{display:"block",width:20,height:2,background:"#C5AC88",borderRadius:2}}/>
              <span style={{display:"block",width:20,height:2,background:"#C5AC88",borderRadius:2}}/>
            </button>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Logo size={26}/>
              <span style={{color:"#C5AC88",fontWeight:700,fontSize:14}}>مجموعة ريتام</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={toggleDark} style={{background:"rgba(197,172,136,.15)",border:"none",borderRadius:6,padding:"5px 8px",fontSize:16,cursor:"pointer"}}>{dark?"☀️":"🌙"}</button>
              <button onClick={onLogout} style={{background:"rgba(139,58,58,.2)",color:"#ffaaaa",border:"none",borderRadius:6,padding:"5px 8px",fontSize:11,cursor:"pointer",fontFamily:"'Tajawal',sans-serif"}}>خروج</button>
            </div>
          </div>

          {/* Drawer Overlay */}
          {drawerOpen&&(
            <div style={{position:"fixed",inset:0,zIndex:300,display:"flex"}}>
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)"}} onClick={()=>setDrawerOpen(false)}/>
              <div style={{position:"relative",width:240,background:"#2C2419",height:"100%",overflowY:"auto",zIndex:301,display:"flex",flexDirection:"column"}}>
                <div style={{padding:"20px 16px 12px",borderBottom:"1px solid rgba(197,172,136,.2)",display:"flex",alignItems:"center",gap:10}}>
                  <Logo size={32}/>
                  <div>
                    <div style={{color:"#C5AC88",fontWeight:800,fontSize:15}}>مجموعة ريتام</div>
                    <div style={{color:"#888",fontSize:11}}>نظام إدارة الشاليهات</div>
                  </div>
                </div>
                <div style={{flex:1,padding:"12px 8px"}}>
                  {TABS.filter(allowedTabs).map(t=>(
                    <button key={t.id} onClick={()=>{setTab(t.id);setDrawerOpen(false);}}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:10,border:"none",background:tab===t.id?"rgba(197,172,136,.15)":"transparent",color:tab===t.id?"#C5AC88":"#888",cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontSize:14,fontWeight:tab===t.id?700:400,marginBottom:4,textAlign:"right"}}>
                      <span style={{fontSize:18}}>{t.i}</span>
                      <span>{t.l}</span>
                      {t.id==="bookings"&&bookings.filter(b=>b.status==="pending").length>0&&<span style={{marginRight:"auto",background:"#C97B63",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:11}}>{bookings.filter(b=>b.status==="pending").length}</span>}
                    </button>
                  ))}
                </div>
                <div style={{padding:"12px 16px",borderTop:"1px solid rgba(197,172,136,.2)"}}>
                  <button onClick={toggleDark} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(197,172,136,.08)",border:"1px solid rgba(197,172,136,.2)",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontFamily:"'Tajawal',sans-serif",marginBottom:8}}>
                    <span style={{fontSize:13,color:"#C5AC88",fontWeight:600}}>{dark?"الوضع النهاري ☀️":"الوضع الليلي 🌙"}</span>
                  </button>
                  <div style={{color:"#888",fontSize:12,marginBottom:4}}>{currentUser.name||currentUser.username}</div>
                  <button onClick={onLogout} style={{width:"100%",background:"rgba(139,58,58,.2)",color:"#ffaaaa",border:"none",borderRadius:8,padding:"8px",fontSize:13,cursor:"pointer",fontFamily:"'Tajawal',sans-serif"}}>تسجيل الخروج</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Main Content ── */}
      <div style={{marginRight:isMobile?0:220,minHeight:"100vh"}}>
        {/* شريط التحديث */}
        {refreshing&&(
          <div style={{position:"fixed",top:0,left:0,right:0,height:3,zIndex:9999,background:"linear-gradient(90deg,transparent,#C5AC88,#8B7355,transparent)",backgroundSize:"200% 100%",animation:"shimmer 1.2s linear infinite"}}/>
        )}
        <main style={{maxWidth:1100,margin:"0 auto",padding:isMobile?"14px 12px":"24px 20px",paddingBottom:isMobile?80:60}}>

          {/* ── Dashboard ── */}
          {tab==="dashboard"&&(
            <div className="stagger">
              {/* ── الترويسة ── */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontSize:22,fontWeight:900,color:"var(--text)"}}>لوحة التحكم</div>
                  <div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{new Date().toLocaleDateString("ar-SA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
                </div>
              </div>

              {/* ── ملخص يومي ── */}
              {(()=>{
                const todayStr=new Date().toISOString().slice(0,10);
                const tomStr=new Date(Date.now()+86400000).toISOString().slice(0,10);
                const checkoutsToday=bookings.filter(b=>(b.status==="confirmed"||b.status==="pending")&&b.date_to===todayStr).length;
                const checkinsToday=bookings.filter(b=>b.status==="confirmed"&&b.date_from===todayStr).length;
                const arrivingTomorrow=bookings.filter(b=>b.status==="confirmed"&&b.date_from===tomStr).length;
                const poolPending=bookings.filter(b=>b.pool_preference&&!b.pool_approved&&b.status==="confirmed").length;
                const openMaint=maint.filter(m=>m.status==="open").length;
                const items=[
                  checkoutsToday&&{icon:"🚪",label:"خروج اليوم",val:checkoutsToday,color:"#DC2626",bg:"rgba(220,38,38,.08)"},
                  checkinsToday&&{icon:"🏡",label:"دخول اليوم",val:checkinsToday,color:"#059669",bg:"rgba(5,150,105,.08)"},
                  arrivingTomorrow&&{icon:"🌅",label:"وصول غداً",val:arrivingTomorrow,color:"#4338CA",bg:"rgba(67,56,202,.08)"},
                  poolPending&&{icon:"🏊",label:"طلبات مسبح",val:poolPending,color:"#0284C7",bg:"rgba(2,132,199,.08)"},
                  openMaint&&{icon:"🔧",label:"صيانة مفتوحة",val:openMaint,color:"#B45309",bg:"rgba(180,83,9,.08)"},
                  roomReqs.length&&{icon:"🛎️",label:"طلبات غرف",val:roomReqs.length,color:"#7C3AED",bg:"rgba(124,58,237,.08)"},
                ].filter(Boolean);
                if(!items.length) return null;
                return (
                  <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                    {items.map((item:any,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,borderRadius:12,padding:"10px 16px",background:item.bg,border:`1px solid ${item.color}22`,flex:1,minWidth:120}}>
                        <span style={{fontSize:20}}>{item.icon}</span>
                        <div>
                          <div style={{fontSize:20,fontWeight:900,color:item.color,lineHeight:1}}>{item.val}</div>
                          <div style={{fontSize:10,color:"var(--text2)",fontWeight:600,marginTop:2}}>{item.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── تسجيل الخروج اليوم (أولوية قصوى) ── */}
              {(()=>{
                const now=new Date();
                const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
                const yesterday=new Date(today); yesterday.setDate(today.getDate()-1);
                const checkouts=bookings.filter(b=>{
                  if(b.status!=="confirmed"&&b.status!=="pending") return false;
                  if(!b.date_to) return false;
                  const to=new Date(b.date_to);
                  return new Date(to.getFullYear(),to.getMonth(),to.getDate())<=today&&new Date(to.getFullYear(),to.getMonth(),to.getDate())>=yesterday;
                });
                if(!checkouts.length) return null;
                return (
                  <div style={{background:"linear-gradient(135deg,#7A1F1F,#5C1515)",borderRadius:14,padding:16,marginBottom:20,boxShadow:"0 4px 20px rgba(139,58,58,.35)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                      <span style={{fontSize:18}}>🚪</span>
                      <span style={{fontWeight:800,color:"#fff",fontSize:15}}>تسجيل الخروج اليوم</span>
                      <span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,fontSize:12,padding:"2px 10px",fontWeight:700}}>{checkouts.length}</span>
                    </div>
                    {checkouts.map((b,i)=>(
                      <div key={b.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"rgba(255,255,255,.08)",borderRadius:10,marginBottom:i<checkouts.length-1?8:0}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:800,color:"#fff",fontSize:14}}>{b.guest}</div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginTop:2}}>{b.chalet} · {fd(b.date_to)}</div>
                        </div>
                        <div style={{fontWeight:800,color:"#FFD700",fontSize:15,marginLeft:8}}>{Number(b.price).toLocaleString()+" ر"}</div>
                        <button onClick={()=>setCoMdl(b)} style={{background:"#fff",color:"#7A1F1F",border:"none",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",flexShrink:0}}>تسجيل خروج</button>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── وصول غداً (رسائل قبل الوصول) ── */}
              {(()=>{
                const tom=new Date(); tom.setDate(tom.getDate()+1);
                const tomStr=tom.toISOString().slice(0,10);
                const arrivals=bookings.filter(b=>b.status==="confirmed"&&b.date_from===tomStr);
                if(!arrivals.length) return null;
                return (
                  <div style={{background:"linear-gradient(135deg,#312E81,#4338CA)",borderRadius:14,padding:16,marginBottom:20,boxShadow:"0 4px 20px rgba(67,56,202,.35)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                      <span style={{fontSize:18}}>🌅</span>
                      <span style={{fontWeight:800,color:"#fff",fontSize:15}}>وصول غداً · رسائل قبل الوصول</span>
                      <span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,fontSize:12,padding:"2px 10px",fontWeight:700}}>{arrivals.length}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>
                        {arrivals.filter(b=>b.pre_arrival_sent).length}/{arrivals.length} تم الإرسال
                      </span>
                    </div>
                    {arrivals.map((b,i)=>(
                      <div key={b.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:b.pre_arrival_sent?"rgba(34,197,94,.15)":"rgba(255,255,255,.08)",borderRadius:10,marginBottom:i<arrivals.length-1?8:0,flexWrap:"wrap",border:b.pre_arrival_sent?"1px solid rgba(34,197,94,.35)":"1px solid transparent"}}>
                        <div style={{flex:1,minWidth:140}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontWeight:800,color:"#fff",fontSize:14}}>{b.guest}</span>
                            {b.pre_arrival_sent&&<span style={{fontSize:10,background:"rgba(34,197,94,.3)",color:"#86EFAC",borderRadius:99,padding:"1px 8px",fontWeight:700}}>✓ أُرسلت</span>}
                          </div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginTop:2}}>
                            {b.chalet}
                            {b.checkin_time&&<span style={{marginRight:6}}>· دخول {b.checkin_time}</span>}
                            {b.checkout_time&&<span style={{marginRight:6}}>· خروج {b.checkout_time}</span>}
                            {!b.phone&&<span style={{color:"#FCA5A5",marginRight:6}}>· ⚠ لا يوجد هاتف</span>}
                          </div>
                        </div>
                        <button onClick={()=>setPreArrMdl({booking:b})} style={{
                          background:b.pre_arrival_sent?"rgba(255,255,255,.15)":"#fff",
                          color:b.pre_arrival_sent?"#fff":"#4338CA",
                          border:b.pre_arrival_sent?"1px solid rgba(255,255,255,.3)":"none",
                          borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:800,cursor:"pointer",
                          fontFamily:"'Tajawal',sans-serif",flexShrink:0,
                        }}>{b.pre_arrival_sent?"📋 إعادة إرسال":"📋 إرسال رسالة"}</button>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── طلبات المسبح المعلقة ── */}
              {(()=>{
                const poolReqs = bookings.filter(b=>b.pool_preference&&!b.pool_approved&&b.status==="confirmed");
                if(!poolReqs.length) return null;
                function poolLabel(pref: string){
                  if(!pref) return "-";
                  if(pref==="on_arrival") return "تعبئة عند الوصول 🕐";
                  if(pref.startsWith("ready")){
                    const t=pref.split(":").slice(1).join(":");
                    return t ? `جاهز عند الوصول · الساعة ${t} ✅` : "جاهز عند الوصول ✅";
                  }
                  return pref;
                }
                return (
                  <div style={{background:"linear-gradient(135deg,#065F46,#047857)",borderRadius:14,padding:16,marginBottom:20,boxShadow:"0 4px 20px rgba(4,120,87,.3)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                      <span style={{fontSize:18}}>🏊</span>
                      <span style={{fontWeight:800,color:"#fff",fontSize:15}}>طلبات المسبح · تنتظر موافقتك</span>
                      <span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,fontSize:12,padding:"2px 10px",fontWeight:700}}>{poolReqs.length}</span>
                    </div>
                    {poolReqs.map((b,i)=>(
                      <div key={b.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"rgba(255,255,255,.1)",borderRadius:10,marginBottom:i<poolReqs.length-1?8:0,flexWrap:"wrap"}}>
                        <div style={{flex:1,minWidth:140}}>
                          <div style={{fontWeight:800,color:"#fff",fontSize:14}}>{b.guest}</div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,.8)",marginTop:2}}>{b.chalet} · {poolLabel(b.pool_preference||"")}</div>
                          <div style={{fontSize:10,color:"rgba(255,255,255,.6)",marginTop:1}}>دخول {fd(b.date_from)}</div>
                        </div>
                        <button onClick={async()=>{
                          await db("bookings","PATCH",{pool_approved:true},b.id);
                          await loadAll();
                          const msg=encodeURIComponent(buildPoolApprovalMsg(b));
                          const phone=b.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966")||"";
                          if(phone) window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");
                        }} style={{
                          background:"#fff",color:"#065F46",border:"none",borderRadius:8,
                          padding:"8px 14px",fontSize:12,fontWeight:800,cursor:"pointer",
                          fontFamily:"'Tajawal',sans-serif",flexShrink:0,
                        }}>✅ موافقة وإرسال</button>
                        <button onClick={async()=>{
                          await db("bookings","PATCH",{pool_preference:null,pool_approved:false},b.id);
                          await loadAll();
                        }} style={{
                          background:"rgba(239,68,68,.2)",color:"#FCA5A5",border:"1px solid rgba(239,68,68,.3)",
                          borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:700,cursor:"pointer",
                          fontFamily:"'Tajawal',sans-serif",flexShrink:0,
                        }}>رفض</button>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── طلبات الغرف ── */}
              {roomReqs.length>0&&(
                <div style={{background:"linear-gradient(135deg,#4C1D95,#6D28D9)",borderRadius:14,padding:16,marginBottom:20,boxShadow:"0 4px 20px rgba(109,40,217,.3)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,justifyContent:"space-between"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:18}}>🛎️</span>
                      <span style={{fontWeight:800,color:"#fff",fontSize:15}}>طلبات الغرف</span>
                      <span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,fontSize:12,padding:"2px 10px",fontWeight:700}}>{roomReqs.length}</span>
                    </div>
                  </div>
                  <div style={{display:"grid",gap:8}}>
                    {roomReqs.map((r:any)=>{
                      const rt=ROOM_REQUEST_TYPES.find(x=>x.val===r.type)||{icon:"📋",label:r.type,color:"#fff"};
                      const ago=Math.round((Date.now()-new Date(r.created_at).getTime())/60000);
                      const agoStr=ago<1?"الآن":ago<60?`منذ ${ago} د`:`منذ ${Math.round(ago/60)} س`;
                      return (
                        <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"rgba(255,255,255,.1)",borderRadius:10,flexWrap:"wrap"}}>
                          <span style={{fontSize:24}}>{rt.icon}</span>
                          <div style={{flex:1,minWidth:120}}>
                            <div style={{fontWeight:800,color:"#fff",fontSize:13}}>{rt.label}</div>
                            <div style={{fontSize:11,color:"rgba(255,255,255,.75)",marginTop:2}}>
                              {r.chalet} · {r.room} · {agoStr}
                            </div>
                            {r.note&&<div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:1,fontStyle:"italic"}}>"{r.note}"</div>}
                          </div>
                          <button onClick={async()=>{await db("room_requests","PATCH",{resolved:true},r.id);await loadAll();}} style={{
                            background:"rgba(255,255,255,.2)",color:"#fff",border:"1px solid rgba(255,255,255,.3)",
                            borderRadius:8,padding:"7px 12px",fontSize:11,fontWeight:700,cursor:"pointer",
                            fontFamily:"'Tajawal',sans-serif",flexShrink:0,
                          }}>✓ تم</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── تنبيه مهام النظافة المستحقة ── */}
              {(()=>{
                const todayStr=td();
                const thisMonth=todayStr.slice(0,7);
                const doneLogs=new Set(clLogs.filter(l=>l.log_date?.startsWith(thisMonth)&&(l.status==="done"||l.supervisor_ok)).map(l=>l.task_id));
                const sentLogs=new Set(clLogs.filter(l=>l.log_date?.startsWith(thisMonth)&&l.status==="sent").map(l=>l.task_id));
                const dueTasks=clTasks.filter(t=>t.active!==false&&!doneLogs.has(t.id));
                if(!dueTasks.length) return null;
                return <CleanTaskBanner tasks={dueTasks} sentLogs={sentLogs} workers={cleanWorkers} logs={clLogs} thisMonth={thisMonth} onSend={async(task,worker)=>{
                  const existing=clLogs.find(l=>l.task_id===task.id&&l.log_date?.startsWith(thisMonth));
                  let logId:number;
                  if(existing){logId=existing.id;await db("cleaning_logs","PATCH",{status:"sent",sent_at:new Date().toISOString(),worker_id:worker.id},existing.id);}
                  else{const r=await db("cleaning_logs","POST",{task_id:task.id,chalet:task.chalet,log_date:todayStr,worker_done:false,supervisor_ok:false,status:"sent",sent_at:new Date().toISOString(),worker_id:worker.id});logId=r?.[0]?.id||0;}
                  await loadAll();
                  const lang=worker.language||"hi";
                  const url=`https://reetam-chalets.vercel.app?guest=1&m=cleantask&log=${logId}&task=${encodeURIComponent(task.title)}&ch=${encodeURIComponent(task.chalet)}&lang=${lang}`;
                  const msgs:Record<string,string>={
                    hi:`नमस्ते ${worker.name}! 🧹%0aकाम: *${task.title}*%0aजगह: ${task.chalet}%0a%0aकाम पूरा होने पर यहाँ क्लिक करें:%0a${encodeURIComponent(url)}`,
                    ar:`مرحباً ${worker.name} 🧹%0aالمهمة: *${task.title}*%0aالشاليه: ${task.chalet}%0a%0aعند الانتهاء اضغط هنا:%0a${encodeURIComponent(url)}`,
                    en:`Hi ${worker.name}! 🧹%0aTask: *${task.title}*%0aChalet: ${task.chalet}%0a%0aWhen done, click here:%0a${encodeURIComponent(url)}`,
                  };
                  const phone=worker.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");
                  window.open(`https://wa.me/${phone}?text=${msgs[lang]||msgs.hi}`,"_blank");
                }} onConfirm={async(task)=>{
                  const existing=clLogs.find(l=>l.task_id===task.id&&l.log_date?.startsWith(thisMonth));
                  if(existing){await db("cleaning_logs","PATCH",{supervisor_ok:true,status:"done",done_at:new Date().toISOString()},existing.id);}
                  else{await db("cleaning_logs","POST",{task_id:task.id,chalet:task.chalet,log_date:todayStr,worker_done:true,supervisor_ok:true,status:"done",done_at:new Date().toISOString()});}
                  await loadAll();
                }}/>;
              })()}

              {/* ── تنبيه اكتمال مهام النظافة ── */}
              {(()=>{
                const thisMonth=td().slice(0,7);
                const justDone=clLogs.filter(l=>l.status==="done"&&l.done_at&&!l.supervisor_ok&&l.log_date?.startsWith(thisMonth));
                if(!justDone.length) return null;
                return (
                  <div style={{background:"linear-gradient(135deg,#166534,#15803D)",borderRadius:14,padding:16,marginBottom:20,boxShadow:"0 4px 20px rgba(22,101,52,.3)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <span style={{fontSize:18}}>🔔</span>
                      <span style={{fontWeight:800,color:"#fff",fontSize:15}}>مهام أنهاها العمال — تحتاج موافقة</span>
                      <span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,fontSize:12,padding:"2px 10px",fontWeight:700}}>{justDone.length}</span>
                    </div>
                    {justDone.map(l=>{
                      const task=clTasks.find(t=>t.id===l.task_id);
                      const worker=cleanWorkers.find(w=>w.id===l.worker_id);
                      return (
                        <div key={l.id} style={{background:"rgba(255,255,255,.1)",borderRadius:10,marginBottom:6,overflow:"hidden"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px"}}>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:700,color:"#fff",fontSize:13}}>{task?.title||"مهمة"}</div>
                              <div style={{fontSize:11,color:"rgba(255,255,255,.75)",marginTop:2}}>
                                {l.chalet}{worker?" · "+worker.name:""}{l.done_note?" · \""+l.done_note+"\"":""}
                              </div>
                            </div>
                            <button onClick={async()=>{await db("cleaning_logs","PATCH",{supervisor_ok:true},l.id);await loadAll();}} style={{
                              background:"#fff",color:"#166534",border:"none",borderRadius:8,padding:"8px 14px",
                              fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",flexShrink:0,
                            }}>✓ موافقة</button>
                          </div>
                          {(l as any).done_media_url && (
                            <div style={{padding:"0 14px 12px"}}>
                              {(l as any).done_media_url.match(/\.(mp4|mov|webm|avi)$/i)
                                ? <video src={(l as any).done_media_url} controls style={{width:"100%",maxHeight:180,borderRadius:8,background:"#000"}}/>
                                : <a href={(l as any).done_media_url} target="_blank" rel="noopener noreferrer">
                                    <img src={(l as any).done_media_url} alt="media" style={{width:"100%",maxHeight:180,borderRadius:8,objectFit:"cover",display:"block"}}/>
                                  </a>
                              }
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── تنبيه المصروفات الثابتة غير المدفوعة ── */}
              {(()=>{
                const nowD=new Date();
                const thisYM=`${nowD.getFullYear()}-${String(nowD.getMonth()+1).padStart(2,"0")}`;
                const activeFixed=fixedExpenses.filter(fx=>fx.active);
                if(!activeFixed.length) return null;
                const paidNames=new Set(expenses.filter(e=>e.expense_date?.startsWith(thisYM)).map(e=>e.note));
                const unpaid=activeFixed.filter(fx=>!paidNames.has(fx.name));
                if(!unpaid.length) return null;
                const unpaidTotal=unpaid.reduce((s,fx)=>s+Number(fx.amount),0);
                return <UnpaidFixedBanner unpaid={unpaid} total={unpaidTotal} onPay={async(fx)=>{await db("expenses","POST",{chalet:fx.chalet,category:fx.category||"مصروف ثابت",amount:Number(fx.amount),note:fx.name,expense_date:td()});await loadAll();}}/>;
              })()}

              {/* ── الأرقام الكبيرة ── */}
              {(()=>{
                const now=new Date();
                const y=now.getFullYear(), mo=now.getMonth();

                // حجوزات مكتملة أو مؤكدة (confirmed تُحسب إيراداً فعلياً)
                const activeStatuses=["completed","confirmed"];

                // هذا الشهر: date_from أو date_to يقع في الشهر الحالي
                const monthBks=bookings.filter(b=>activeStatuses.includes(b.status)&&b.date_from&&(
                  (new Date(b.date_from).getFullYear()===y&&new Date(b.date_from).getMonth()===mo)||
                  (b.date_to&&new Date(b.date_to).getFullYear()===y&&new Date(b.date_to).getMonth()===mo)
                ));
                const monthRev=monthBks.reduce((s,b)=>s+Number(b.price),0);
                const monthCount=monthBks.length;

                // الشهر الماضي
                const lastMo=mo===0?11:mo-1; const lastY=mo===0?y-1:y;
                const lastMonthRev=bookings.filter(b=>activeStatuses.includes(b.status)&&b.date_from&&(
                  (new Date(b.date_from).getFullYear()===lastY&&new Date(b.date_from).getMonth()===lastMo)||
                  (b.date_to&&new Date(b.date_to).getFullYear()===lastY&&new Date(b.date_to).getMonth()===lastMo)
                )).reduce((s,b)=>s+Number(b.price),0);

                const diff=lastMonthRev>0?Math.round((monthRev-lastMonthRev)/lastMonthRev*100):0;

                // هذا العام
                const yearRev=bookings.filter(b=>activeStatuses.includes(b.status)&&b.date_from&&new Date(b.date_from).getFullYear()===y).reduce((s,b)=>s+Number(b.price),0);
                const yearCount=bookings.filter(b=>activeStatuses.includes(b.status)&&b.date_from&&new Date(b.date_from).getFullYear()===y).length;

                // المصاريف الشهرية
                const monthExp=expenses.filter(e=>e.expense_date&&new Date(e.expense_date).getFullYear()===y&&new Date(e.expense_date).getMonth()===mo).reduce((s,e)=>s+Number(e.amount),0)
                  + maint.filter(m=>m.cost&&m.maint_date&&new Date(m.maint_date).getFullYear()===y&&new Date(m.maint_date).getMonth()===mo).reduce((s,m)=>s+Number(m.cost),0);
                const netProfit=monthRev-monthExp;
                const margin=monthRev>0?Math.round(netProfit/monthRev*100):0;

                return (
                  <div style={{marginBottom:20}}>
                    {/* الصف الأول: بطاقتان كبيرتان */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:12}}>
                      {/* إيرادات الشهر */}
                      <div className="stat-card" style={{background:"linear-gradient(135deg,#1C3A3A,#0F2525)",borderRadius:16,padding:"20px 18px",boxShadow:"0 6px 24px rgba(0,0,0,.25)",position:"relative",overflow:"hidden"}}>
                        <div style={{position:"absolute",top:-20,left:-20,width:80,height:80,borderRadius:"50%",background:"rgba(197,172,136,.06)"}}/>
                        <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginBottom:4,fontWeight:700,letterSpacing:".5px"}}>💰 إيرادات {now.toLocaleDateString("ar-SA",{month:"long"})}</div>
                        <div style={{fontSize:32,fontWeight:900,color:"#fff",letterSpacing:"-1px",lineHeight:1}}>{monthRev.toLocaleString()}<span style={{fontSize:15,marginRight:5,opacity:.7}}>ر</span></div>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
                          {diff!==0&&(
                            <span style={{fontSize:11,color:diff>0?"#4CAF50":"#FF6B6B",fontWeight:800,background:diff>0?"rgba(76,175,80,.15)":"rgba(255,107,107,.15)",borderRadius:6,padding:"2px 8px"}}>
                              {diff>0?"↑":"↓"} {Math.abs(diff)}% الشهر الماضي
                            </span>
                          )}
                          <span style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>{monthCount} حجز</span>
                        </div>
                      </div>

                      {/* صافي الربح */}
                      <div className="stat-card" style={{background:netProfit>=0?"linear-gradient(135deg,#0F3320,#0A2018)":"linear-gradient(135deg,#3A1515,#250F0F)",borderRadius:16,padding:"20px 18px",boxShadow:"0 6px 24px rgba(0,0,0,.25)",position:"relative",overflow:"hidden"}}>
                        <div style={{position:"absolute",top:-20,left:-20,width:80,height:80,borderRadius:"50%",background:"rgba(197,172,136,.06)"}}/>
                        <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginBottom:4,fontWeight:700,letterSpacing:".5px"}}>📊 صافي الربح الشهري</div>
                        <div style={{fontSize:32,fontWeight:900,color:netProfit>=0?"#4CAF50":"#FF6B6B",letterSpacing:"-1px",lineHeight:1}}>{netProfit.toLocaleString()}<span style={{fontSize:15,marginRight:5,opacity:.7}}>ر</span></div>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                          <span style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>هامش {margin}%</span>
                          <span style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>· مصاريف {monthExp.toLocaleString()} ر</span>
                        </div>
                      </div>
                    </div>

                    {/* الصف الثاني: 4 بطاقات صغيرة */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                      {[
                        {l:"إيرادات العام", v:yearRev.toLocaleString()+" ر", i:"📈", c:"#4A9BAF", bg:"rgba(74,155,175,.08)", sub:yearCount+" حجز"},
                        {l:"محفظة التأمين", v:walletBal.toLocaleString()+" ر", i:"🛡️", c:"#7B8FA6", bg:"rgba(123,143,166,.08)", sub:"الرصيد الكلي"},
                        {l:"تكاليف الصيانة",v:mCost.toLocaleString()+" ر", i:"🔧", c:"#C97B63", bg:"rgba(201,123,99,.08)", sub:"منذ البداية"},
                        {l:"حجوزات نشطة",  v:String(actB), i:"📅", c:B, bg:SL, sub:"مؤكد + معلق"},
                      ].map((s,i)=>(
                        <div key={i} style={{background:s.bg,borderRadius:12,padding:"12px 10px",border:"1px solid rgba(197,172,136,.18)"}}>
                          <div style={{fontSize:16,marginBottom:4}}>{s.i}</div>
                          <div style={{fontSize:15,fontWeight:900,color:s.c,lineHeight:1.2}}>{s.v}</div>
                          <div style={{fontSize:9,color:T,marginTop:4,fontWeight:600}}>{s.l}</div>
                          <div style={{fontSize:9,color:SI,marginTop:1}}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── أهداف الشهر ── */}
              {cStats.some(c=>c.goal>0)&&(
                <div className="card" style={{padding:16,marginBottom:20}}>
                  <div style={{fontWeight:800,color:B,fontSize:14,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                    <span>🎯 أهداف الشهر</span>
                    <span style={{fontSize:11,color:T,fontWeight:400}}>صافي الأرباح مقابل الهدف</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
                    {cStats.filter(c=>c.goal>0).map(c=>{
                      const net=c.monthRev-c.monthExp;
                      const pct=Math.min(Math.round(net/c.goal*100),100);
                      const color=pct>=100?"#4CAF50":pct>=60?"#B8A06A":"#C97B63";
                      return (
                        <div key={c.id} style={{background:SL,borderRadius:10,padding:"12px 14px",border:"1px solid rgba(197,172,136,.2)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                            <span style={{fontWeight:700,color:B,fontSize:12}}>{c.name}</span>
                            <span style={{fontWeight:900,color,fontSize:13}}>{pct}%</span>
                          </div>
                          <div style={{background:"rgba(197,172,136,.2)",borderRadius:99,height:8,overflow:"hidden",marginBottom:6}}>
                            <div style={{width:pct+"%",height:"100%",background:color,borderRadius:99,transition:"width .4s"}}/>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T}}>
                            <span>{net.toLocaleString()+" ر"}</span>
                            <span>{"/ "+c.goal.toLocaleString()+" ر"}</span>
                          </div>
                          {pct>=100&&<div style={{fontSize:10,color:"#4CAF50",fontWeight:700,marginTop:4,textAlign:"center"}}>🎉 تم تحقيق الهدف!</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── الحجوزات القادمة + أداء الشاليهات ── */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
                {/* الحجوزات القادمة */}
                {(()=>{
                  const now=new Date();
                  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
                  const upcoming=bookings.filter(b=>b.status!=="cancelled"&&b.status!=="completed").map(b=>{const from=new Date(b.date_from);return{...b,daysLeft:Math.round((new Date(from.getFullYear(),from.getMonth(),from.getDate())-today)/86400000)};}).filter(b=>b.daysLeft>=-1).sort((a,b)=>a.daysLeft-b.daysLeft).slice(0,6);
                  return (
                    <div className="card" style={{overflow:"hidden"}}>
                      <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:13,background:SL,display:"flex",alignItems:"center",gap:8}}>
                        <span>🔔 الحجوزات القادمة</span>
                        <span style={{background:T,color:"#fff",borderRadius:20,fontSize:10,padding:"1px 7px"}}>{upcoming.length}</span>
                      </div>
                      <div>
                        {upcoming.length===0?<div style={{padding:20,textAlign:"center",color:SI,fontSize:12}}>لا توجد حجوزات قادمة</div>:upcoming.map((b,i)=>{
                          const isToday=b.daysLeft===0;const isIn=b.daysLeft<0;
                          const urgColor=isIn?"#8B6914":isToday?"#8B3A3A":b.daysLeft<=3?SD:T;
                          const urgBg=isIn?"#F5EFD6":isToday?"#F5E6E6":b.daysLeft<=3?"#EEF0E9":SL;
                          return (
                            <div key={b.id} className="list-item" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<upcoming.length-1?"1px solid rgba(197,172,136,.08)":"none"}}>
                              <span style={{background:urgBg,color:urgColor,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:800,whiteSpace:"nowrap",flexShrink:0}}>{isIn?"داخل":isToday?"اليوم":b.daysLeft===1?"غداً":b.daysLeft+" يوم"}</span>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:700,color:B,fontSize:13,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{b.guest}</div>
                                <div style={{fontSize:11,color:T}}>{b.chalet}</div>
                              </div>
                              <div style={{fontWeight:700,color:T,fontSize:13,flexShrink:0}}>{Number(b.price).toLocaleString()+" ر"}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* أداء الشاليهات */}
                <div className="card" style={{overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:13,background:SL}}>🏠 أداء الشاليهات هذا الشهر</div>
                  <div>
                    {cStats.map((c,i)=>{
                      const maxR=Math.max(...cStats.map(x=>x.monthRev),1);
                      const pct=Math.round(c.monthRev/maxR*100);
                      return (
                        <div key={i} style={{padding:"12px 14px",borderBottom:i<cStats.length-1?"1px solid rgba(197,172,136,.08)":"none"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                            <span style={{fontWeight:700,color:B,fontSize:13}}>{c.name}</span>
                            <span style={{fontWeight:800,color:T,fontSize:13}}>{c.monthRev.toLocaleString()+" ر"}</span>
                          </div>
                          <div style={{background:"rgba(197,172,136,.15)",borderRadius:99,height:6,overflow:"hidden"}}>
                            <div style={{width:pct+"%",height:"100%",background:"linear-gradient(90deg,"+T+","+TD+")",borderRadius:99,transition:"width .4s"}}/>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:SI,marginTop:3}}>
                            <span>{c.mop>0?<span style={{color:"#C97B63"}}>⚠️ {c.mop} صيانة مفتوحة</span>:"✅ لا صيانة مفتوحة"}</span>
                            <span>{c.ins.toLocaleString()+" ر تأمين"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── الرسم البياني التفاعلي ── */}
              {false&&(()=>{
                const MONTHS=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
                const MONTHS_SHORT=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
                const currentYear=new Date().getFullYear();
                const curMonth=new Date().getMonth();
                const activeStatuses=["completed","confirmed"];

                // إيرادات + عدد حجوزات + مصاريف لكل شهر
                const monthlyData=MONTHS.map((_,mi)=>{
                  const bks=bookings.filter(b=>activeStatuses.includes(b.status)&&b.date_from&&new Date(b.date_from).getFullYear()===currentYear&&new Date(b.date_from).getMonth()===mi);
                  const rev=bks.reduce((s,b)=>s+Number(b.price),0);
                  const cnt=bks.length;
                  const exp=expenses.filter(e=>e.expense_date&&new Date(e.expense_date).getFullYear()===currentYear&&new Date(e.expense_date).getMonth()===mi).reduce((s,e)=>s+Number(e.amount),0)
                    +maint.filter(m=>m.cost&&m.maint_date&&new Date(m.maint_date).getFullYear()===currentYear&&new Date(m.maint_date).getMonth()===mi).reduce((s,m)=>s+Number(m.cost),0);
                  return {rev,exp,cnt,net:rev-exp};
                });

                const maxRev=Math.max(...monthlyData.map(d=>d.rev),1);
                const total=monthlyData.reduce((s,d)=>s+d.rev,0);
                const totalExp=monthlyData.reduce((s,d)=>s+d.exp,0);
                const avgRev=total/12;
                const activeMos=monthlyData.filter(d=>d.rev>0).length;
                // أفضل شهر
                const bestIdx=monthlyData.reduce((bi,d,i)=>d.rev>monthlyData[bi].rev?i:bi,0);

                // قيم المحور Y
                const yStep=Math.ceil(maxRev/4/1000)*1000||1000;
                const yLines=[1,2,3,4].map(n=>n*yStep).filter(v=>v<=maxRev*1.1);

                return (
                  <div className="card" style={{overflow:"hidden",marginBottom:16}}>
                    {/* الرأس */}
                    <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(197,172,136,.15)",background:SL,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                      <div>
                        <div style={{fontWeight:800,color:B,fontSize:14}}>📊 الإيرادات الشهرية {currentYear}</div>
                        <div style={{fontSize:11,color:SI,marginTop:2}}>{activeMos} أشهر نشطة · أفضل شهر: <span style={{color:B,fontWeight:700}}>{MONTHS[bestIdx]}</span></div>
                      </div>
                      <div style={{display:"flex",gap:16,alignItems:"center"}}>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:B,lineHeight:1}}>{total.toLocaleString()}</div>
                          <div style={{fontSize:9,color:SI,fontWeight:600}}>إجمالي الإيرادات ر</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:"#C97B63",lineHeight:1}}>{totalExp.toLocaleString()}</div>
                          <div style={{fontSize:9,color:SI,fontWeight:600}}>إجمالي المصاريف ر</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:total>totalExp?"#4CAF50":"#FF6B6B",lineHeight:1}}>{(total-totalExp).toLocaleString()}</div>
                          <div style={{fontSize:9,color:SI,fontWeight:600}}>صافي الربح ر</div>
                        </div>
                      </div>
                    </div>

                    {/* الرسم */}
                    <div style={{padding:"20px 18px 12px",position:"relative"}}>
                      {/* خطوط Y */}
                      <div style={{position:"absolute",inset:"20px 18px 50px",pointerEvents:"none"}}>
                        {yLines.map(v=>(
                          <div key={v} style={{position:"absolute",bottom:(v/maxRev)*100+"%",left:0,right:0,display:"flex",alignItems:"center",gap:6}}>
                            <div style={{fontSize:9,color:SI,whiteSpace:"nowrap",width:36,textAlign:"left",flexShrink:0}}>
                              {v>=1000?(v/1000)+"k":v}
                            </div>
                            <div style={{flex:1,height:1,background:"rgba(197,172,136,.1)"}}/>
                          </div>
                        ))}
                        {/* خط المتوسط */}
                        {avgRev>0&&(
                          <div style={{position:"absolute",bottom:(avgRev/maxRev)*100+"%",left:40,right:0,display:"flex",alignItems:"center",gap:6}}>
                            <div style={{flex:1,height:1,borderTop:"1.5px dashed rgba(197,172,136,.4)"}}/>
                            <div style={{fontSize:9,color:T,fontWeight:700,whiteSpace:"nowrap"}}>متوسط</div>
                          </div>
                        )}
                      </div>

                      {/* الأعمدة */}
                      <div style={{display:"flex",alignItems:"flex-end",gap:4,height:180,paddingRight:44,paddingLeft:4}}>
                        {monthlyData.map((d,i)=>{
                          const revH=maxRev>0?Math.max((d.rev/maxRev)*100,d.rev>0?3:0):0;
                          const expH=maxRev>0&&d.exp>0?Math.max((d.exp/maxRev)*100,2):0;
                          const isCur=i===curMonth;
                          const isPast=i<curMonth;
                          const isBest=i===bestIdx&&d.rev>0;
                          const revColor=isCur
                            ?"linear-gradient(180deg,#C5AC88,#8B7355)"
                            :isBest
                            ?"linear-gradient(180deg,#4CAF50,#2E7D32)"
                            :isPast
                            ?"linear-gradient(180deg,rgba(87,109,111,.9),rgba(87,109,111,.5))"
                            :"rgba(197,172,136,.25)";
                          return (
                            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,height:"100%",justifyContent:"flex-end"}}>
                              {/* القيمة فوق العمود */}
                              <div style={{fontSize:8,color:isCur?B:isBest?"#4CAF50":isPast&&d.rev>0?T:"transparent",fontWeight:800,textAlign:"center",lineHeight:1.2,marginBottom:1}}>
                                {d.rev>=1000?(d.rev/1000).toFixed(1)+"k":d.rev>0?d.rev:""}
                              </div>
                              {/* عمود المصاريف (رفيع شفاف) */}
                              <div style={{width:"100%",display:"flex",gap:1,alignItems:"flex-end",height:"100%"}}>
                                {/* عمود الإيراد */}
                                <div style={{flex:1,height:revH+"%",background:revColor,borderRadius:"4px 4px 0 0",position:"relative",transition:"height .4s",boxShadow:isCur?"0 0 12px rgba(197,172,136,.4)":"none",minHeight:d.rev>0?"3px":0}}>
                                  {isCur&&<div style={{position:"absolute",top:-4,left:"50%",transform:"translateX(-50%)",width:8,height:8,borderRadius:"50%",background:"#C5AC88",boxShadow:"0 0 6px rgba(197,172,136,.8)"}}/>}
                                </div>
                                {/* عمود المصاريف */}
                                {d.exp>0&&(
                                  <div style={{width:3,height:expH+"%",background:"rgba(201,123,99,.6)",borderRadius:"2px 2px 0 0",minHeight:2}}/>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* أسماء الأشهر + عدد الحجوزات */}
                      <div style={{display:"flex",gap:4,paddingRight:44,paddingLeft:4,marginTop:6}}>
                        {monthlyData.map((d,i)=>{
                          const isCur=i===curMonth;
                          return (
                            <div key={i} style={{flex:1,textAlign:"center"}}>
                              <div style={{fontSize:8.5,color:isCur?B:i<curMonth?T:SI,fontWeight:isCur?900:500,lineHeight:1}}>{MONTHS_SHORT[i].slice(0,3)}</div>
                              {d.cnt>0&&<div style={{fontSize:7.5,color:isCur?"#C5AC88":SI,fontWeight:600,marginTop:1}}>{d.cnt}</div>}
                            </div>
                          );
                        })}
                      </div>

                      {/* المفتاح */}
                      <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:12,flexWrap:"wrap"}}>
                        {[
                          {color:"linear-gradient(90deg,#C5AC88,#8B7355)",label:"الشهر الحالي"},
                          {color:"linear-gradient(90deg,#4CAF50,#2E7D32)",label:"أفضل شهر"},
                          {color:"rgba(87,109,111,.7)",label:"الأشهر الماضية"},
                          {color:"rgba(197,172,136,.25)",label:"الأشهر القادمة"},
                          {color:"rgba(201,123,99,.6)",label:"المصاريف"},
                        ].map(({color,label})=>(
                          <div key={label} style={{display:"flex",alignItems:"center",gap:5}}>
                            <div style={{width:14,height:8,borderRadius:3,background:color,flexShrink:0}}/>
                            <span style={{fontSize:9,color:SI}}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ملخص ربع سنوي */}
                    <div style={{borderTop:"1px solid rgba(197,172,136,.12)",display:"grid",gridTemplateColumns:"repeat(4,1fr)"}}>
                      {["Q1","Q2","Q3","Q4"].map((q,qi)=>{
                        const slice=monthlyData.slice(qi*3,qi*3+3);
                        const qRev=slice.reduce((s,d)=>s+d.rev,0);
                        const qExp=slice.reduce((s,d)=>s+d.exp,0);
                        const isCurQ=Math.floor(curMonth/3)===qi;
                        return (
                          <div key={q} style={{padding:"10px 12px",borderLeft:qi>0?"1px solid rgba(197,172,136,.12)":"none",background:isCurQ?SL:"transparent"}}>
                            <div style={{fontSize:10,color:isCurQ?B:SI,fontWeight:isCurQ?800:600,marginBottom:3}}>{q} {isCurQ&&"← الآن"}</div>
                            <div style={{fontSize:13,fontWeight:900,color:isCurQ?B:T}}>{qRev>=1000?(qRev/1000).toFixed(1)+"k":qRev} <span style={{fontSize:9,opacity:.6}}>ر</span></div>
                            <div style={{fontSize:9,color:"#C97B63"}}>{qExp>0?"- "+(qExp>=1000?(qExp/1000).toFixed(1)+"k":qExp)+" مصاريف":""}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <MonthlyChart bookings={bookings} expenses={expenses} maint={maint} B={B} T={T} SI={SI} SL={SL}/>
            </div>
          )}

          {/* ── Chalets ── */}
          {tab==="chalets"&&(
            <ChaletsTab
              cStats={cStats}
              rooms={rooms}
              loading={loading}
              onAdd={()=>setCMdl({...eC})}
              onEdit={c=>setCMdl({...c})}
              onDelete={dlC}
              onGoal={c=>setGoalMdl({id:c.id,name:c.name,goal:c.goal||""})}
              onQr={(chalet,chRooms)=>setQrMdl({chalet,rooms:chRooms})}
              onImgChange={async(id,dataUrl)=>{
                setChalets(p=>p.map(x=>x.id===id?{...x,img:dataUrl}:x));
                await db("chalets","PATCH",{img:dataUrl},id);
              }}
            />
          )}

          {/* ── Bookings ── */}
          {tab==="bookings"&&(
            <div>
              <BookingCalendar bookings={isChaletMgr?bookings.filter(b=>b.chalet===currentUser.chalet):bookings} names={isChaletMgr?[currentUser.chalet]:names}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
                <TH title="جدول الحجوزات"/>
                <div style={{display:"flex",gap:8}}>
                  <select className="inp" style={{width:"auto"}} value={fch} onChange={e=>setFch(e.target.value)}>
                    <option value="الكل">الكل</option>
                    {names.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <button className="btn bp" onClick={()=>setBMdl({...eB})}>+ إضافة حجز</button>
                </div>
              </div>
              <div className="card" style={{overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{background:SL}}>
                      {["الضيف","الشاليه","الفترة","الليالي","السعر","الحالة","إجراءات"].map(h=>(
                        <th key={h} style={{padding:"12px 14px",textAlign:"right",fontSize:12,fontWeight:700,color:B,borderBottom:"2px solid rgba(197,172,136,.2)"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.filter(b=>(fch==="الكل"||b.chalet===fch)&&(isAdmin||isStaff||(isChaletMgr&&b.chalet===currentUser.chalet))).map((b,idx)=>{
                      const sc=STATUS[b.status]||{bg:"#eee",color:"#333",label:b.status};
                      const nights=fn(b.date_from,b.date_to);
                      return (
                        <tr key={b.id} style={{borderBottom:"1px solid rgba(197,172,136,.1)",transition:"background .15s",cursor:"pointer"}}
                          onClick={()=>setBkDetail(b)}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(197,172,136,.05)"}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <td style={{padding:"12px 14px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:4,height:36,borderRadius:4,background:sc.color,flexShrink:0}}/>
                              <div>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontWeight:800,color:B,fontSize:13}}>{b.guest}</span>
                                  {b.pre_arrival_sent&&<span style={{fontSize:9,background:"#DCFCE7",color:"#166534",borderRadius:99,padding:"1px 6px",fontWeight:700,flexShrink:0}}>✓ رسالة</span>}
                                </div>
                                <div style={{fontSize:11,color:T,marginTop:1,direction:"ltr",textAlign:"right"}}>{b.phone||"-"}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{padding:"12px 14px"}}>
                            <div style={{fontWeight:600,color:B,fontSize:13}}>{b.chalet}</div>
                          </td>
                          <td style={{padding:"12px 14px"}}>
                            <div style={{fontSize:12,color:B,fontWeight:600}}>{fd(b.date_from)}</div>
                            <div style={{fontSize:11,color:T,marginTop:1}}>{"← "+fd(b.date_to)}</div>
                          </td>
                          <td style={{padding:"12px 14px",textAlign:"center"}}>
                            <div style={{background:SL,borderRadius:8,padding:"4px 10px",display:"inline-block",fontWeight:800,color:B,fontSize:13}}>{nights}</div>
                          </td>
                          <td style={{padding:"12px 14px"}}>
                            <div style={{fontWeight:900,color:T,fontSize:14}}>{Number(b.price).toLocaleString()}</div>
                            <div style={{fontSize:10,color:SI}}>ريال</div>
                          </td>
                          <td style={{padding:"12px 14px"}}>
                            <span style={{background:sc.bg,color:sc.color,borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{sc.label}</span>
                          </td>
                          <td style={{padding:"12px 14px"}}>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                              <button className="btn be bsm" onClick={e=>{e.stopPropagation();setBMdl({...b})}}>تعديل</button>
                              <button className="btn bd bsm" onClick={async e=>{e.stopPropagation();if(window.confirm("حذف الحجز؟")){await db("bookings","DELETE",null,b.id);await loadAll();}}}>حذف</button>
                              <button onClick={e=>{e.stopPropagation();setPreArrMdl({booking:b});}} style={{background:"#6366F1",color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:700}}>📋 قبل الوصول</button>
                              <button onClick={e=>{e.stopPropagation();const url=`https://reetam-chalets.vercel.app?guest=1&b=${b.id}&m=checkin`;const msg=`مرحباً ${b.guest} 👋%0aأهلاً بك في ${b.chalet}%0a%0aرابط تسجيل الدخول:%0a${encodeURIComponent(url)}`;const phone=b.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");}} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:700}}>واتساب</button>
                              <button onClick={e=>{e.stopPropagation();const url=`https://reetam-chalets.vercel.app?guest=1&b=${b.id}&m=review`;const msg=`${b.guest} 😊%0aرابط التقييم:%0a${encodeURIComponent(url)}`;const phone=b.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");}} style={{background:"#F59E0B",color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:700}}>تقييم</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Finance ── */}
          {tab==="finance"&&(
            <FinancialTab
              bookings={bookings} maintenance={maint} wallet={wallet} names={names}
              expenses={expenses}
              fixedExpenses={fixedExpenses}
              onAddExpense={()=>setExMdl({chalet:names[0]||"",category:"إيجار",amount:"",note:"",expense_date:td()})}
              onAddFixedExpense={()=>setFxMdl({chalet:names[0]||"",name:"",amount:0,frequency:"monthly",category:"إيجار",active:true})}
              onPayFixedExpense={async(fx)=>{const today=td();await db("expenses","POST",{chalet:fx.chalet,category:fx.category||"مصروف ثابت",amount:Number(fx.amount),note:fx.name,expense_date:today});await loadAll();}}
              onEdit={t=>setWMdl({...t})}
              onReload={loadAll}
            />
          )}

          {/* ── Maintenance ── */}
          {tab==="maintenance"&&(
            <div>
              <div className="sg" style={{marginBottom:18}}>
                {[{l:"مفتوح",cnt:maint.filter(m=>m.status==="open").length,bg:"#F5E6E6",c:"#8B3A3A",i:"🔴"},{l:"قيد التنفيذ",cnt:maint.filter(m=>m.status==="in_progress").length,bg:"#F5EFD6",c:"#8B6914",i:"🟡"},{l:"منتهي",cnt:maint.filter(m=>m.status==="done").length,bg:"#EEF0E9",c:SD,i:"🟢"},{l:"إجمالي التكاليف",cnt:mCost.toLocaleString()+" ر",bg:SL,c:B,i:"💰"}].map((s,i)=>(
                  <div key={i} style={{background:s.bg,borderRadius:10,padding:"12px 14px",border:"1px solid rgba(197,172,136,.2)"}}>
                    <div style={{fontSize:16}}>{s.i}</div>
                    <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.cnt}</div>
                    <div style={{fontSize:11,color:s.c,opacity:.8}}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
                <TH title="طلبات الصيانة"/>
                <div style={{display:"flex",gap:8}}>
                  <select className="inp" style={{width:"auto"}} value={fch} onChange={e=>setFch(e.target.value)}>
                    <option value="الكل">الكل</option>
                    {names.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <button className="btn bp" onClick={()=>{setMOld(null);setMMdl({...eM});}}>+ طلب صيانة</button>
                </div>
              </div>
              <div className="mg" style={{marginBottom:16}}>
                {cStats.map(c=>(
                  <div key={c.id} style={{background:W,borderRadius:10,padding:12,boxShadow:"0 2px 8px rgba(65,53,35,.07)",borderRight:"4px solid "+(c.mop>0?"#8B3A3A":SA)}}>
                    <div style={{fontWeight:700,color:B,marginBottom:7,fontSize:13}}>{"🏠 "+c.name}</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      <Bdg bg="#F5E6E6" color="#8B3A3A">{c.mop+" مفتوح"}</Bdg>
                      <Bdg bg="#F5EFD6" color="#8B6914">{c.mip+" جاري"}</Bdg>
                      <Bdg bg="#EEF0E9" color={SD}>{c.mdn+" منتهي"}</Bdg>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card" style={{overflow:"hidden"}}>
                <Tbl heads={["الشاليه","المشكلة","مقدم الطلب","التاريخ","الأولوية","الحالة","التكلفة","صورة","إجراءات"]}
                  rows={maint.filter(m=>(fch==="الكل"||m.chalet===fch)&&(isAdmin||isStaff||(isChaletMgr&&m.chalet===currentUser.chalet))).sort((a,b)=>{const p={عالي:0,متوسط:1,منخفض:2};const s={open:0,in_progress:1,done:2};return(p[a.priority]??1)-(p[b.priority]??1)||(s[a.status]??1)-(s[b.status]??1);}).map(m=>(
                    <tr key={m.id}>
                      <td style={{fontWeight:600}}>{m.chalet}</td>
                      <td>{m.issue}</td>
                      <td style={{fontSize:12,color:T}}>{m.req||"-"}</td>
                      <td>{fd(m.maint_date)}</td>
                      <td><Bdg bg={m.priority==="عالي"?"#F5E6E6":m.priority==="متوسط"?"#F5EFD6":"#EEF0E9"} color={m.priority==="عالي"?"#8B3A3A":m.priority==="متوسط"?"#8B6914":SD}>{m.priority}</Bdg></td>
                      <td><Bdg bg={MS[m.status]?.bg||"#eee"} color={MS[m.status]?.color||"#333"}>{MS[m.status]?.label||m.status}</Bdg></td>
                      <td style={{fontWeight:700,color:m.cost?T:SI}}>{m.cost?Number(m.cost).toLocaleString()+" ر":"-"}</td>
                      <td>{m.image?<img src={m.image} alt="صورة" onClick={()=>window.open(m.image,"_blank")} style={{width:40,height:40,objectFit:"cover",borderRadius:6,cursor:"pointer",border:"1px solid rgba(197,172,136,.3)"}}/>:<span style={{color:SI,fontSize:12}}>-</span>}</td>
                      <td>
                        <div style={{display:"flex",gap:4}}>
                          <button className="btn be bsm" onClick={()=>{setMOld({...m});setMMdl({...m});}}>تعديل</button>
                          <button className="btn bd bsm" onClick={async()=>{if(!window.confirm("حذف طلب الصيانة؟"))return;await db("maintenance","DELETE",null,m.id);await loadAll();}}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                />
              </div>
            </div>
          )}

          {/* ── Insurance ── */}
          {tab==="insurance"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
                <div><TH title="محفظة التأمين"/><p style={{color:T,fontSize:13}}>يزيد بإضافة تأمين ويُخصم عند إغلاق طلبات الصيانة</p></div>
                <button className="btn bp" onClick={()=>setIMdl(true)}>+ إضافة تأمين</button>
              </div>
              <div style={{background:"linear-gradient(135deg,"+B+","+BD+")",borderRadius:18,padding:"24px 28px",marginBottom:22,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 8px 32px rgba(65,53,35,.3)",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{color:SI,fontSize:13,marginBottom:3}}>إجمالي محفظة التأمين</div>
                  <div style={{color:S,fontSize:36,fontWeight:800}}>{walletBal.toLocaleString()+" ريال"}</div>
                  <div style={{color:SI,fontSize:12,marginTop:6}}>{"إيداعات: "+wallet.filter(t=>t.type==="إيداع").reduce((s,t)=>s+t.amount,0).toLocaleString()+" ر | صرف: "+wallet.filter(t=>t.type!=="إيداع").reduce((s,t)=>s+t.amount,0).toLocaleString()+" ر"}</div>
                </div>
                <Logo size={55}/>
              </div>
              <div className="ig" style={{marginBottom:22}}>
                {cStats.map(c=>(
                  <div key={c.id} style={{background:W,borderRadius:12,padding:16,boxShadow:"0 2px 10px rgba(65,53,35,.08)",borderTop:"4px solid "+(c.ins<500?"#8B3A3A":c.ins<1000?SA:T)}}>
                    <div style={{fontWeight:700,color:B,fontSize:14,marginBottom:3}}>{c.name}</div>
                    <div style={{fontSize:11,color:T,marginBottom:8}}>{"📍 "+c.loc}</div>
                    <div style={{fontSize:24,fontWeight:800,color:c.ins<500?"#8B3A3A":T,marginBottom:7}}>{c.ins.toLocaleString()+" ر"}</div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T}}>
                      <span>{"طلبات: "+c.mtot}</span>
                      <Bdg bg={c.ins<500?"#F5E6E6":SL} color={c.ins<500?"#8B3A3A":B}>{c.ins<500?"منخفض":"جيد"}</Bdg>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card" style={{overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>سجل معاملات التأمين</div>
                <Tbl heads={["التاريخ","الشاليه","النوع","المبلغ","ملاحظة","إجراءات"]}
                  rows={[...wallet].reverse().map((t,i)=>(
                    <tr key={i}>
                      <td>{fd(t.trans_date)}</td>
                      <td style={{fontWeight:600}}>{t.chalet}</td>
                      <td><Bdg bg={t.type==="إيداع"?"#EEF0E9":"#F5E6E6"} color={t.type==="إيداع"?SD:"#8B3A3A"}>{t.type}</Bdg></td>
                      <td style={{fontWeight:700,color:t.type==="إيداع"?T:"#8B3A3A"}}>{(t.type==="إيداع"?"+":"-")+t.amount.toLocaleString()+" ر"}</td>
                      <td style={{color:T,fontSize:12}}>{t.note||"-"}</td>
                      <td><div style={{display:"flex",gap:4}}><button className="btn be bsm" onClick={()=>setWMdl({...t})}>تعديل</button><button className="btn bd bsm" onClick={async()=>{if(window.confirm("حذف هذا الصف؟")){await db("wallet","DELETE",null,t.id);await loadAll();}}}>حذف</button></div></td>
                    </tr>
                  ))}
                />
              </div>
            </div>
          )}

          {tab==="cleaning"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:10}}>
                <div><TH title="محفظة النظافة"/><p style={{color:T,fontSize:13}}>يزيد بإضافة رصيد نظافة ويُخصم يدوياً</p></div>
                <button className="btn bp" style={{background:"#3D7A5A"}} onClick={()=>setClnMdl(true)}>+ إضافة رصيد</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,marginBottom:20}}>
                <div className="card" style={{padding:20,textAlign:"center",background:"linear-gradient(135deg,#3D7A5A,#2A5E42)",color:"#fff",borderRadius:14}}>
                  <div style={{fontSize:13,marginBottom:4,opacity:.85}}>إجمالي محفظة النظافة</div>
                  <div style={{fontSize:36,fontWeight:800}}>{cleaningBal.toLocaleString()+" ريال"}</div>
                  <div style={{fontSize:12,marginTop:6,opacity:.75}}>{"إيداعات: "+cleaning.filter(t=>t.type==="إيداع").reduce((s,t)=>s+t.amount,0).toLocaleString()+" ر | صرف: "+cleaning.filter(t=>t.type!=="إيداع").reduce((s,t)=>s+t.amount,0).toLocaleString()+" ر"}</div>
                </div>
                {chalets.map(c=>{
                  const bal=cleaning.filter(t=>t.chalet===c.name).reduce((s,t)=>t.type==="إيداع"?s+t.amount:s-t.amount,0);
                  return bal>0?(
                    <div key={c.name} className="card" style={{padding:16,textAlign:"center"}}>
                      <div style={{fontSize:12,color:T,marginBottom:4}}>{c.name}</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#3D7A5A"}}>{bal.toLocaleString()+" ر"}</div>
                    </div>
                  ):null;
                })}
              </div>
              <div className="card" style={{overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>سجل معاملات النظافة</div>
                <Tbl heads={["التاريخ","الشاليه","النوع","المبلغ","ملاحظة","إجراءات"]}
                  rows={[...cleaning].reverse().map((t,i)=>(
                    <tr key={i}>
                      <td data-label="التاريخ">{fd(t.trans_date)}</td>
                      <td data-label="الشاليه" style={{fontWeight:600}}>{t.chalet}</td>
                      <td data-label="النوع"><Bdg bg={t.type==="إيداع"?"#E8F5EE":"#F5E6E6"} color={t.type==="إيداع"?"#3D7A5A":"#8B3A3A"}>{t.type}</Bdg></td>
                      <td data-label="المبلغ" style={{fontWeight:700,color:t.type==="إيداع"?"#3D7A5A":"#8B3A3A"}}>{(t.type==="إيداع"?"+":"-")+t.amount.toLocaleString()+" ر"}</td>
                      <td data-label="ملاحظة" style={{color:T,fontSize:12}}>{t.note||"-"}</td>
                      <td data-label=""><div style={{display:"flex",gap:4}}><button className="btn be bsm" onClick={()=>setClMdl({...t})}>تعديل</button><button className="btn bd bsm" onClick={async()=>{if(window.confirm("حذف هذا الصف؟")){await db("cleaning","DELETE",null,t.id);await loadAll();}}}>حذف</button></div></td>
                    </tr>
                  ))}
                />
              </div>

              {/* التزامات */}
              <div style={{marginTop:24}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontWeight:700,color:B,fontSize:16}}>📋 التزامات النظافة</div>
                  <button className="btn bp" style={{background:"#3D7A5A"}} onClick={()=>setClExpMdl({chalet:names[0]||"",category:"رواتب",amount:"",note:"",expense_date:td()})}>+ إضافة التزام</button>
                </div>
                <div className="card" style={{overflow:"hidden"}}>
                  <Tbl heads={["التاريخ","الشاليه","الفئة","المبلغ","ملاحظة","إجراءات"]}
                    rows={[...clExp].reverse().map((e,i)=>(
                      <tr key={i}>
                        <td data-label="التاريخ" style={{fontSize:12}}>{fd(e.expense_date)}</td>
                        <td data-label="الشاليه" style={{fontWeight:600}}>{e.chalet}</td>
                        <td data-label="الفئة"><Bdg bg="#E8F5EE" color="#3D7A5A">{e.category}</Bdg></td>
                        <td data-label="المبلغ" style={{fontWeight:700,color:"#8B3A3A"}}>-{Number(e.amount).toLocaleString()+" ر"}</td>
                        <td data-label="ملاحظة" style={{color:T,fontSize:12}}>{e.note||"-"}</td>
                        <td data-label=""><div style={{display:"flex",gap:4}}>
                          <button className="btn be bsm" onClick={()=>setClExpMdl({...e})}>تعديل</button>
                          <button className="btn bd bsm" onClick={async()=>{if(window.confirm("حذف؟")){await db("cleaning_expenses","DELETE",null,e.id);await loadAll();}}}>حذف</button>
                        </div></td>
                      </tr>
                    ))}
                    footer={[
                      <td key={0} colSpan={3} style={{fontWeight:800,color:B}}>إجمالي الالتزامات</td>,
                      <td key={1} style={{fontWeight:800,color:"#8B3A3A",fontSize:15}}>{clExp.reduce((s,e)=>s+Number(e.amount),0).toLocaleString()+" ر"}</td>,
                      <td key={2}/>,<td key={3}/>
                    ]}
                  />
                </div>
              </div>

              <div style={{marginTop:24}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
                  <div style={{fontWeight:700,color:B,fontSize:16}}>✅ مهام النظافة</div>
                  <div style={{display:"flex",gap:8}}>
                    <select className="inp" style={{minWidth:160}} value={clSelCh||""} onChange={e=>setClSelCh(e.target.value||null)}>
                      <option value="">كل الشاليهات</option>
                      {names.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                    <button className="btn bp" style={{background:"#3D7A5A"}} onClick={()=>setClTaskMdl({chalet:names[0]||"",title:"",frequency:"أسبوعي",category:"مسبح",assigned_to:"",active:true})}>+ إضافة مهمة</button>
                  </div>
                </div>

                {(clSelCh?[clSelCh]:[...new Set(clTasks.map(t=>t.chalet))]).map(chName=>{
                  const tasks = clTasks.filter(t=>t.chalet===chName&&t.active!==false);
                  if(!tasks.length) return null;
                  const month = new Date().toISOString().slice(0,7);
                  const logs  = clLogs.filter(l=>l.chalet===chName&&l.log_date?.startsWith(month));
                  const done  = tasks.filter(t=>logs.some(l=>l.task_id===t.id&&l.supervisor_ok));
                  const workerDone = tasks.filter(t=>logs.some(l=>l.task_id===t.id));
                  const pct   = tasks.length>0?Math.round(done.length/tasks.length*100):0;
                  return (
                    <div key={chName} className="card" style={{marginBottom:16,overflow:"hidden"}}>
                      <div style={{padding:"12px 16px",background:SL,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontWeight:700,color:B}}>{chName}</div>
                        <div style={{display:"flex",alignItems:"center",gap:12}}>
                          <div style={{fontSize:12,color:T}}>العامل: {workerDone.length}/{tasks.length} | المشرف: {done.length}/{tasks.length}</div>
                          <div style={{background:"#f0f0f0",borderRadius:99,width:80,height:8,overflow:"hidden"}}>
                            <div style={{width:pct+"%",height:"100%",background:pct===100?"#3D7A5A":pct>50?"#B8A06A":"#C97B63",transition:"width .3s"}}/>
                          </div>
                          <div style={{fontWeight:800,color:pct===100?"#3D7A5A":B,fontSize:13}}>{pct+"%"}</div>
                        </div>
                      </div>
                      <div className="tbl-wrap">
                      <table className="tbl">
                        <thead><tr style={{background:"rgba(197,172,136,.1)"}}>
                          {["المهمة","الفئة","التكرار","العامل ✓","المشرف ✓","إرسال",""].map((h,i)=><th key={i}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {tasks.map(task=>{
                            const log = logs.find(l=>l.task_id===task.id);
                            const isDone = log?.supervisor_ok||log?.status==="done";
                            return (
                              <tr key={task.id} style={{background:isDone?"rgba(61,122,90,.05)":log?.status==="sent"?"rgba(37,211,102,.05)":""}}>
                                <td data-label="المهمة" style={{fontWeight:600}}>
                                  {task.title}
                                  {log?.status==="sent"&&<div style={{fontSize:10,color:"#059669",fontWeight:600}}>📤 أُرسلت</div>}
                                  {isDone&&<div style={{fontSize:10,color:"#166534",fontWeight:600}}>✅ منتهية</div>}
                                </td>
                                <td data-label="الفئة"><Bdg bg="#E8F5EE" color="#3D7A5A">{task.category}</Bdg></td>
                                <td data-label="التكرار" style={{fontSize:12,color:T}}>{task.frequency}</td>
                                <td data-label="العامل ✓" style={{textAlign:"center"}}>
                                  {log?.worker_done||log?.status==="done" ? <span style={{color:"#3D7A5A",fontWeight:700,fontSize:16}}>✓</span> : <span style={{color:"#ccc",fontSize:16}}>○</span>}
                                </td>
                                <td data-label="المشرف ✓" style={{textAlign:"center"}}>
                                  {isDone
                                    ? <span style={{color:"#3D7A5A",fontWeight:700,fontSize:16}}>✓</span>
                                    : <button className="btn be bsm" style={{fontSize:11}} onClick={async()=>{
                                        if(log){await db("cleaning_logs","PATCH",{supervisor_ok:true,status:"done"},log.id);}
                                        else{await db("cleaning_logs","POST",{task_id:task.id,chalet:chName,log_date:td(),worker_done:true,supervisor_ok:true,status:"done"});}
                                        await loadAll();
                                      }}>تأكيد ✓</button>
                                  }
                                </td>
                                <td data-label="إرسال">
                                  {!isDone&&cleanWorkers.filter(w=>w.active).length>0&&(
                                    <SendTaskBtn task={task} workers={cleanWorkers.filter(w=>w.active)} log={log||null} onSent={loadAll}/>
                                  )}
                                </td>
                                <td data-label="">
                                  <div style={{display:"flex",gap:4}}>
                                    <button className="btn be bsm" style={{fontSize:11}} onClick={()=>setClTaskMdl({...task})}>تعديل</button>
                                    <button className="btn bd bsm" style={{fontSize:11}} onClick={async()=>{if(window.confirm("حذف المهمة؟")){await db("cleaning_tasks","DELETE",null,task.id);await loadAll();}}}>حذف</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  );
                })}
                {clTasks.length===0&&<div className="card" style={{padding:24,textAlign:"center",color:T}}>لا توجد مهام بعد — أضف مهام النظافة لكل شاليه</div>}

                {/* ── فريق النظافة ── */}
                <div style={{marginTop:24}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontWeight:700,color:B,fontSize:16}}>👷 فريق النظافة</div>
                    <button className="btn bp" style={{background:"#065F46"}} onClick={()=>setCwMdl({name:"",phone:"",language:"hi",active:true})}>+ إضافة عامل</button>
                  </div>
                  {cleanWorkers.length===0
                    ? <div className="card" style={{padding:20,textAlign:"center",color:T,fontSize:13}}>لا يوجد عمال — أضف فريق النظافة</div>
                    : <div className="card" style={{overflow:"hidden"}}>
                        <div className="tbl-wrap">
                        <table className="tbl">
                          <thead><tr>
                            {["الاسم","الهاتف","اللغة","الحالة","إجراءات"].map((h,i)=><th key={i}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {cleanWorkers.map(w=>(
                              <tr key={w.id}>
                                <td data-label="الاسم" style={{fontWeight:700}}>{w.name}</td>
                                <td data-label="الهاتف" style={{direction:"ltr",textAlign:"right"}}>{w.phone}</td>
                                <td data-label="اللغة">
                                  <Bdg bg={w.language==="hi"?"#FFF7ED":"#EFF6FF"} color={w.language==="hi"?"#C2410C":"#1D4ED8"}>
                                    {w.language==="hi"?"🇮🇳 هندية":w.language==="ar"?"🇸🇦 عربية":"🌐 إنجليزية"}
                                  </Bdg>
                                </td>
                                <td data-label="الحالة">
                                  <Bdg bg={w.active?"#DCFCE7":"#F3F4F6"} color={w.active?"#166534":"#6B7280"}>{w.active?"نشط":"موقف"}</Bdg>
                                </td>
                                <td data-label="">
                                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                    <button className="btn be bsm" onClick={()=>setCwMdl({...w})}>تعديل</button>
                                    <button className="btn bsm" onClick={async()=>{await db("cleaning_workers","PATCH",{active:!w.active},w.id);await loadAll();}}
                                      style={{background:w.active?"#FEF3C7":"#DCFCE7",color:w.active?"#92400E":"#166534",padding:"5px 10px",fontSize:12}}>
                                      {w.active?"إيقاف":"تفعيل"}
                                    </button>
                                    <button className="btn bd bsm" onClick={async()=>{if(window.confirm("حذف العامل؟")){await db("cleaning_workers","DELETE",null,w.id);await loadAll();}}}>🗑️</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </div>
                  }
                </div>
              </div>
            </div>
          )}

          {/* ── Smart Control ── */}
          {tab==="smart"&&(
            <div>
              <div style={{marginBottom:20}}><h2 style={{color:B,fontWeight:800,fontSize:22,marginBottom:6}}>🌡️ التحكم الذكي</h2><div style={{width:50,height:3,background:S,borderRadius:99}}></div></div>
              {!selChalet?(
                <div>
                  <p style={{color:T,fontSize:14,marginBottom:16}}>اختر شاليهاً للتحكم بمكيفاته</p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:14}}>
                    {chalets.filter(c=>isAdmin||isStaff||(isChaletMgr&&c.name===currentUser.chalet)).map(c=>{
                      const chRooms=rooms.filter(r=>r.chalet===c.name);
                      return (
                        <div key={c.id} className="card" style={{overflow:"hidden",cursor:"pointer"}} onClick={()=>setSelChalet(c)}>
                          <div style={{background:"linear-gradient(135deg,"+B+","+BD+")",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div><div style={{color:S,fontWeight:800,fontSize:15}}>{c.name}</div><div style={{color:SI,fontSize:11,marginTop:2}}>{"📍 "+c.loc}</div></div>
                            <div style={{color:S,fontSize:24}}>🏠</div>
                          </div>
                          <div style={{padding:"14px 18px"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                              <span style={{fontSize:13,color:T}}>{chRooms.length+" غرفة"}</span>
                              <span style={{fontSize:11,background:SL,color:B,padding:"3px 10px",borderRadius:20,fontWeight:600}}>اضغط للتحكم</span>
                            </div>
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              {chRooms.map(r=>(<span key={r.id} style={{fontSize:11,background:SL,color:T,padding:"3px 10px",borderRadius:20,border:"1px solid rgba(197,172,136,.3)"}}>{r.name}</span>))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ):(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
                    <button className="btn" onClick={()=>setSelChalet(null)} style={{background:SL,color:B,padding:"8px 16px",border:"1.5px solid rgba(197,172,136,.4)",fontSize:13}}>← رجوع</button>
                    <div><div style={{color:B,fontWeight:800,fontSize:18}}>{selChalet.name}</div><div style={{color:T,fontSize:12}}>{"📍 "+selChalet.loc}</div></div>
                    <div style={{marginRight:"auto",display:"flex",gap:8}}>
                      <button className="btn" style={{background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",padding:"8px 16px",fontSize:13}} onClick={async()=>{const chRooms=rooms.filter(r=>r.chalet===selChalet.name);for(const r of chRooms)await svAC(selChalet.name,"ac_on",true,r.id);}}>▶ تشغيل الكل</button>
                      <button className="btn" style={{background:SL,color:B,padding:"8px 16px",fontSize:13,border:"1.5px solid rgba(197,172,136,.4)"}} onClick={async()=>{const chRooms=rooms.filter(r=>r.chalet===selChalet.name);for(const r of chRooms)await svAC(selChalet.name,"ac_on",false,r.id);}}>⏹ إيقاف الكل</button>
                      <button className="btn" style={{background:S,color:B,padding:"8px 16px",fontSize:13}} onClick={()=>setAddRoomMdl(selChalet.name)}>+ غرفة</button>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
                    {rooms.filter(r=>r.chalet===selChalet.name).map(room=>{
                      const isOn=room._acOn||false;const temp=room._acTemp||22;const mode=room._acMode||"cool";const speed=room._acSpeed||"auto";
                      return (
                        <div key={room.id} className="card" style={{overflow:"hidden"}}>
                          <div style={{background:isOn?"linear-gradient(135deg,#0f7b5f,#0a5c47)":"linear-gradient(135deg,"+B+","+BD+")",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div><div style={{color:S,fontWeight:800,fontSize:15}}>{"🏠 "+room.name}</div><div style={{color:SI,fontSize:11}}>{selChalet.name}</div></div>
                            <div style={{background:isOn?"rgba(16,185,129,.2)":"rgba(200,201,202,.15)",color:isOn?"#10b981":SI,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>{isOn?"شغّال":"مطفي"}</div>
                          </div>
                          <div style={{padding:"16px"}}>
                            <div style={{textAlign:"center",marginBottom:14}}>
                              <div style={{fontSize:11,color:T,marginBottom:6,fontWeight:600}}>درجة الحرارة</div>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,direction:"ltr"}}>
                                <button className="btn" disabled={!isOn} onClick={async()=>{const t=Math.max(16,temp-1);setRooms(p=>p.map(x=>x.id===room.id?{...x,_acTemp:t}:x));await svAC(selChalet.name,"ac_temp",t,room.id);}} style={{width:32,height:32,borderRadius:9,background:SL,color:B,fontSize:16,border:"1.5px solid rgba(197,172,136,.3)",opacity:isOn?1:.4}}>−</button>
                                <div style={{fontSize:38,fontWeight:800,color:isOn?(temp<=18?"#3b82f6":temp>=28?"#ef4444":B):SI,minWidth:65,textAlign:"center"}}>{temp}°</div>
                                <button className="btn" disabled={!isOn} onClick={async()=>{const t=Math.min(30,temp+1);setRooms(p=>p.map(x=>x.id===room.id?{...x,_acTemp:t}:x));await svAC(selChalet.name,"ac_temp",t,room.id);}} style={{width:32,height:32,borderRadius:9,background:SL,color:B,fontSize:16,border:"1.5px solid rgba(197,172,136,.3)",opacity:isOn?1:.4}}>+</button>
                              </div>
                            </div>
                            <div style={{marginBottom:12}}>
                              <div style={{fontSize:11,color:T,marginBottom:6,fontWeight:600}}>الوضع</div>
                              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                {[{id:"cool",l:"❄️ تبريد"},{id:"heat",l:"🔥 تدفئة"},{id:"fan",l:"💨 هواء"},{id:"auto",l:"🔄 تلقائي"}].map(m=>(
                                  <button key={m.id} className="btn" disabled={!isOn} onClick={async()=>{setRooms(p=>p.map(x=>x.id===room.id?{...x,_acMode:m.id}:x));await svAC(selChalet.name,"ac_mode",m.id,room.id);}} style={{padding:"5px 10px",fontSize:11,background:mode===m.id&&isOn?B:SL,color:mode===m.id&&isOn?S:B,border:"1.5px solid rgba(197,172,136,.3)",opacity:isOn?1:.5}}>{m.l}</button>
                                ))}
                              </div>
                            </div>
                            <div style={{marginBottom:14}}>
                              <div style={{fontSize:11,color:T,marginBottom:6,fontWeight:600}}>سرعة المروحة</div>
                              <div style={{display:"flex",gap:4}}>
                                {[{id:"auto",l:"تلقائي"},{id:"low",l:"بطيء"},{id:"med",l:"متوسط"},{id:"high",l:"سريع"}].map(sp=>(
                                  <button key={sp.id} className="btn" disabled={!isOn} onClick={async()=>{setRooms(p=>p.map(x=>x.id===room.id?{...x,_acSpeed:sp.id}:x));await svAC(selChalet.name,"ac_speed",sp.id,room.id);}} style={{flex:1,padding:"5px 0",fontSize:11,background:speed===sp.id&&isOn?B:SL,color:speed===sp.id&&isOn?S:B,border:"1.5px solid rgba(197,172,136,.3)",opacity:isOn?1:.5}}>{sp.l}</button>
                                ))}
                              </div>
                            </div>
                            <div style={{display:"flex",gap:8}}>
                              <button className="btn" style={{flex:1,padding:"11px",fontSize:14,background:isOn?"linear-gradient(135deg,#ef4444,#dc2626)":"linear-gradient(135deg,#10b981,#059669)",color:"#fff"}} onClick={async()=>{const newOn=!isOn;setRooms(p=>p.map(x=>x.id===room.id?{...x,_acOn:newOn}:x));await svAC(selChalet.name,"ac_on",newOn,room.id);}}>{isOn?"⏸ إيقاف":"▶ تشغيل"}</button>
                              <button className="btn" style={{padding:"11px 14px",background:"#F5E6E6",color:"#8B3A3A",fontSize:13}} onClick={async()=>{if(!window.confirm("حذف غرفة "+room.name+"؟"))return;await db("rooms","DELETE",null,room.id);await loadAll();}}>🗑️</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

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
              <label className="lbl">المميزات (افصل بفاصلة)</label>
              <input className="inp" value={cMdl.amenities||""} onChange={e=>setCMdl(p=>({...p,amenities:e.target.value}))} placeholder="مسبح خاص، واي فاي، مطبخ مجهز، موقف سيارات"/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">صورة الشاليه</label>
              <label style={{display:"block",border:"2px dashed rgba(197,172,136,.5)",borderRadius:10,padding:14,textAlign:"center",cursor:"pointer",background:SL}}>
                {imgUploading?<div style={{color:T,padding:"30px 0"}}>⏳ جاري الرفع...</div>:cMdl.img?<div style={{position:"relative"}}><img src={cMdl.img} alt="preview" style={{width:"100%",height:140,objectFit:"cover",borderRadius:7}}/><button type="button" onClick={e=>{e.preventDefault();setCMdl(p=>({...p,img:null}));}} style={{position:"absolute",top:5,left:5,background:"rgba(139,58,58,.85)",color:"#fff",border:"none",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:11}}>حذف</button></div>:<div style={{color:T}}><div style={{fontSize:28,marginBottom:4}}>📷</div><div style={{fontWeight:600,fontSize:13}}>اضغط لرفع صورة</div></div>}
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
                  let gal: string[] = [];
                  try { gal = cMdl.gallery ? JSON.parse(cMdl.gallery as string) : []; } catch { gal = []; }
                  return gal.map((g,i)=>(
                    <div key={i} style={{position:"relative",height:70}}>
                      <img src={g} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:7}}/>
                      <button type="button" onClick={()=>{
                        const next = gal.filter((_,gi)=>gi!==i);
                        setCMdl(p=>({...p,gallery:JSON.stringify(next)}));
                      }} style={{position:"absolute",top:2,left:2,background:"rgba(139,58,58,.85)",color:"#fff",border:"none",borderRadius:4,width:18,height:18,fontSize:11,cursor:"pointer",lineHeight:1}}>✕</button>
                    </div>
                  ));
                })()}
                <label style={{height:70,border:"2px dashed rgba(197,172,136,.5)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:SL,fontSize:imgUploading?12:22,color:T,textAlign:"center"}}>
                  {imgUploading?"⏳":"+"}
                  <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>{
                    const files = Array.from(e.target.files||[]) as File[];
                    if(!files.length) return;
                    let gal: string[] = [];
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
            <div style={{gridColumn:"span 2",background:SL,borderRadius:10,padding:14,border:"1px solid rgba(197,172,136,.25)"}}>
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
                        <button type="button" onClick={()=>update(slots.filter((_,si)=>si!==i))} style={{background:"rgba(139,58,58,.15)",color:"#8B3A3A",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer"}}>✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={()=>update([...slots,{name:"",from:"",to:"",price:""}])}
                      style={{background:"transparent",border:"1.5px dashed rgba(197,172,136,.5)",borderRadius:8,padding:"6px 14px",fontSize:12,color:T,cursor:"pointer",fontFamily:"'Tajawal',sans-serif"}}>+ إضافة فترة</button>
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
        <Mdl onClose={()=>setBMdl(null)} title={bMdl.id?"تعديل الحجز":"إضافة حجز جديد"}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"span 2"}}><label className="lbl">اسم الضيف</label><input className="inp" value={bMdl.guest||""} onChange={e=>setBMdl(p=>({...p,guest:e.target.value}))}/></div>
            <div><label className="lbl">رقم الهاتف</label><input className="inp" value={bMdl.phone||""} onChange={e=>setBMdl(p=>({...p,phone:e.target.value}))}/></div>
            <div><label className="lbl">الشاليه</label><select className="inp" value={bMdl.chalet||""} onChange={e=>setBMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="lbl">تاريخ الوصول</label><input className="inp" type="date" value={bMdl.date_from||""} onChange={e=>setBMdl(p=>({...p,date_from:e.target.value}))}/></div>
            <div><label className="lbl">تاريخ المغادرة</label><input className="inp" type="date" value={bMdl.date_to||""} onChange={e=>setBMdl(p=>({...p,date_to:e.target.value}))}/></div>
            <div><label className="lbl">وقت الدخول</label><input className="inp" type="time" value={bMdl.checkin_time||""} onChange={e=>setBMdl(p=>({...p,checkin_time:e.target.value}))} placeholder="مثال: 15:00"/></div>
            <div><label className="lbl">وقت الخروج</label><input className="inp" type="time" value={bMdl.checkout_time||""} onChange={e=>setBMdl(p=>({...p,checkout_time:e.target.value}))} placeholder="مثال: 12:00"/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">السعر (ريال)</label><input className="inp" type="number" value={bMdl.price||""} onChange={e=>setBMdl(p=>({...p,price:e.target.value}))}/></div>
            <div><label className="lbl">الحالة</label><select className="inp" value={bMdl.status||"confirmed"} onChange={e=>setBMdl(p=>({...p,status:e.target.value}))}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
            <div><label className="lbl">ملاحظات</label><input className="inp" value={bMdl.note||""} onChange={e=>setBMdl(p=>({...p,note:e.target.value}))}/></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setBMdl(null)}>إلغاء</button>
            <SaveBtn onClick={()=>svB(bMdl)}/>
          </div>
        </Mdl>
      )}

      {mMdl&&(
        <Mdl onClose={()=>setMMdl(null)} title={mMdl.id?"تعديل طلب الصيانة":"طلب صيانة جديد"}>
          {mMdl.status==="done"&&Number(mMdl.cost)>0&&(<div style={{background:SL,borderRadius:9,padding:"9px 13px",marginBottom:14,fontSize:13,color:T,fontWeight:600,border:"1px solid "+S}}>{"سيُخصم "+Number(mMdl.cost).toLocaleString()+" ريال من محفظة التأمين"}</div>)}
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
              <label style={{display:"block",border:"2px dashed rgba(197,172,136,.5)",borderRadius:10,padding:14,textAlign:"center",cursor:"pointer",background:SL}}>
                {mMdl.image?<div style={{position:"relative"}}><img src={mMdl.image} alt="preview" style={{width:"100%",height:160,objectFit:"cover",borderRadius:8}}/><button type="button" onClick={e=>{e.preventDefault();setMMdl(p=>({...p,image:null}));}} style={{position:"absolute",top:5,left:5,background:"rgba(139,58,58,.85)",color:"#fff",border:"none",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:11}}>حذف</button></div>:<div style={{color:T}}><div style={{fontSize:28,marginBottom:4}}>📷</div><div style={{fontWeight:600,fontSize:13}}>اضغط لرفع صورة</div></div>}
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
                <button key={cat} className="btn" onClick={()=>setExMdl(p=>({...p,category:cat}))} style={{padding:"7px 14px",fontSize:13,background:exMdl.category===cat?B:SL,color:exMdl.category===cat?S:B,border:"1.5px solid rgba(197,172,136,.3)"}}>{cat}</button>
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
        <Mdl onClose={()=>setFxMdl(null)} title="إضافة مصروف ثابت">
          <div style={{marginBottom:12}}><label className="lbl">اسم المصروف</label><input className="inp" value={fxMdl.name||""} onChange={e=>setFxMdl(p=>({...p,name:e.target.value}))} placeholder="مثال: كهرباء، ماء، إنترنت"/></div>
          <div style={{marginBottom:12}}><label className="lbl">الشاليه</label><select className="inp" value={fxMdl.chalet} onChange={e=>setFxMdl(p=>({...p,chalet:e.target.value}))}>{names.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{marginBottom:12}}><label className="lbl">المبلغ (ريال)</label><input className="inp" type="number" value={fxMdl.amount||""} onChange={e=>setFxMdl(p=>({...p,amount:Number(e.target.value)}))} placeholder="0"/></div>
          <div style={{marginBottom:12}}>
            <label className="lbl">التكرار</label>
            <div style={{display:"flex",gap:6}}>
              {([["monthly","شهري"],["quarterly","ربع سنوي"],["yearly","سنوي"]] as [string,string][]).map(([v,l])=>(
                <button key={v} className="btn" onClick={()=>setFxMdl(p=>({...p,frequency:v as "monthly"|"quarterly"|"yearly"}))} style={{padding:"8px 16px",fontSize:13,background:fxMdl.frequency===v?"#5B4636":"#F5EFE6",color:fxMdl.frequency===v?"#fff":"#5B4636",border:"1.5px solid rgba(197,172,136,.3)"}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:20}}>
            <label className="lbl">الفئة</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["إيجار","تنظيف","صيانة","إدارة","كهرباء","اشتراكات","غيره"].map(cat=>(
                <button key={cat} className="btn" onClick={()=>setFxMdl(p=>({...p,category:cat}))} style={{padding:"7px 14px",fontSize:13,background:fxMdl.category===cat?"#5B4636":"#F5EFE6",color:fxMdl.category===cat?"#fff":"#5B4636",border:"1.5px solid rgba(197,172,136,.3)"}}>{cat}</button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setFxMdl(null)}>إلغاء</button>
            <SaveBtn label="حفظ المصروف الثابت" disabled={!fxMdl.name||!fxMdl.chalet||!fxMdl.amount} onClick={async()=>{
              await db("fixed_expenses","POST",{chalet:fxMdl.chalet,name:fxMdl.name,amount:Number(fxMdl.amount),frequency:fxMdl.frequency||"monthly",category:fxMdl.category||"إيجار",active:true});
              await loadAll();setFxMdl(null);
            }}/>
          </div>
        </Mdl>
      )}

      {uMdl&&(
        <Mdl onClose={()=>setUMdl(null)} title={uMdl.id?"تعديل المستخدم":"إضافة مستخدم جديد"}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label className="lbl">الاسم</label><input className="inp" value={uMdl.name||""} onChange={e=>setUMdl(p=>({...p,name:e.target.value}))} placeholder="مثال: سالم"/></div>
            <div><label className="lbl">اسم المستخدم</label><input className="inp" value={uMdl.username||""} onChange={e=>setUMdl(p=>({...p,username:e.target.value}))} placeholder="staff1"/></div>
            <div><label className="lbl">البريد الإلكتروني</label><input className="inp" value={uMdl.email||""} onChange={e=>setUMdl(p=>({...p,email:e.target.value}))} placeholder="example@email.com"/></div>
            <div><label className="lbl">كلمة المرور</label><input className="inp" type="password" value={uMdl.password||""} onChange={e=>setUMdl(p=>({...p,password:e.target.value}))} placeholder={uMdl.id?"اتركها فارغة إذا لم تتغير":"كلمة المرور"}/></div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">الصلاحية</label>
              <div style={{display:"flex",gap:8}}>
                {[{v:"admin",l:"أدمن",d:"كل شيء"},{v:"staff",l:"موظف",d:"حجوزات وصيانة"},{v:"chalet_manager",l:"مدير شاليه",d:"شاليه واحد فقط"}].map(r=>(
                  <button key={r.v} className="btn" onClick={()=>setUMdl(p=>({...p,role:r.v}))} style={{flex:1,padding:"9px 4px",fontSize:12,background:uMdl.role===r.v?B:SL,color:uMdl.role===r.v?S:B,border:"1.5px solid rgba(197,172,136,.3)",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
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
            <SaveBtn disabled={!uMdl.name} onClick={async()=>{
              if(!uMdl.name) return;
              const body: Record<string,unknown>={name:uMdl.name,username:uMdl.username||null,email:uMdl.email||null,role:uMdl.role,chalet:uMdl.chalet||null};
              if(uMdl.password){
                body.password = await hashPassword(uMdl.password);
              } else if(!uMdl.id){
                body.password = await hashPassword("1234");
              }
              if(uMdl.id) await db("users","PATCH",body,uMdl.id);
              else await db("users","POST",body);
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
      {selB&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSelB(null)}>
          <div style={{background:W,borderRadius:20,width:"100%",maxWidth:520,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{background:"linear-gradient(135deg,"+B+","+BD+")",padding:"20px 24px",position:"relative"}}>
              <button onClick={()=>setSelB(null)} style={{position:"absolute",top:14,left:14,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:30,height:30,color:"#fff",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              <div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginBottom:4}}>تفاصيل الحجز</div>
              <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>{selB.guest}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.8)",marginTop:4}}>{selB.chalet}</div>
              <div style={{marginTop:12}}>
                <span style={{background:STATUS[selB.status]?.bg||"#eee",color:STATUS[selB.status]?.color||"#333",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700}}>{STATUS[selB.status]?.label||selB.status}</span>
              </div>
            </div>
            {/* Body */}
            <div style={{padding:24}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
                {[
                  {l:"تاريخ الوصول",    v:fd(selB.date_from), i:"📅"},
                  {l:"تاريخ المغادرة",  v:fd(selB.date_to),   i:"📅"},
                  {l:"وقت الدخول",      v:selB.checkin_time||"-", i:"⏰"},
                  {l:"وقت الخروج",      v:selB.checkout_time||"-", i:"⏰"},
                  {l:"عدد الليالي",     v:fn(selB.date_from,selB.date_to)+" ليلة", i:"🌙"},
                  {l:"السعر الإجمالي",  v:Number(selB.price).toLocaleString()+" ر", i:"💰"},
                  {l:"طريقة الدفع",     v:selB.payment_method||"-", i:"💳"},
                  {l:"الهاتف",          v:selB.phone||"-", i:"📞"},
                ].map((r,i)=>(
                  <div key={i} style={{background:SL,borderRadius:10,padding:"12px 14px"}}>
                    <div style={{fontSize:10,color:T,marginBottom:3}}>{r.i} {r.l}</div>
                    <div style={{fontWeight:700,color:B,fontSize:14}}>{r.v}</div>
                  </div>
                ))}
              </div>
              {/* Pool status */}
              {selB.pool_preference&&(
                <div style={{borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8,
                  background:selB.pool_approved?"rgba(34,197,94,.1)":"rgba(245,158,11,.1)",
                  border:selB.pool_approved?"1px solid rgba(34,197,94,.3)":"1px solid rgba(245,158,11,.3)"}}>
                  <span style={{fontSize:18}}>🏊</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:selB.pool_approved?"#166534":"#B45309"}}>
                      {selB.pool_preference==="on_arrival"?"تعبئة عند الوصول":selB.pool_preference.startsWith("ready")?"جاهز عند الوصول":selB.pool_preference}
                    </div>
                    <div style={{fontSize:10,color:T,marginTop:1}}>{selB.pool_approved?"✓ تم الموافقة والإبلاغ":"⏳ في انتظار الموافقة"}</div>
                  </div>
                  {!selB.pool_approved&&(
                    <button onClick={async()=>{
                      await db("bookings","PATCH",{pool_approved:true},selB.id);
                      await loadAll();
                      const msg=encodeURIComponent(buildPoolApprovalMsg(selB));
                      const phone=selB.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966")||"";
                      if(phone) window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");
                      setSelB(null);
                    }} style={{background:"#22C55E",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Tajawal',sans-serif"}}>موافقة</button>
                  )}
                </div>
              )}
              {selB.notes&&<div style={{background:"#FEF3C7",borderRadius:10,padding:"12px 14px",marginBottom:12,fontSize:13,color:"#8B6914"}}>📝 {selB.notes}</div>}
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button className="btn be" style={{flex:1}} onClick={()=>{setBMdl({...selB});setSelB(null);}}>✏️ تعديل</button>
                {(selB.status==="confirmed"||selB.status==="pending")&&<button className="btn" style={{flex:1,background:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",color:"#fff"}} onClick={()=>{setCoMdl(selB);setSelB(null);}}>🚪 خروج</button>}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
                <button onClick={()=>{setSelB(null);setPreArrMdl({booking:selB});}} style={{background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"10px 16px",fontSize:13,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:700,flex:1}}>📋 قبل الوصول</button>
                <button onClick={()=>{const url=`https://reetam-chalets.vercel.app?guest=1&b=${selB.id}&m=checkin`;const msg=`مرحباً ${selB.guest} 👋%0aأهلاً بك في ${selB.chalet}%0a%0aرابط تسجيل الدخول:%0a${encodeURIComponent(url)}`;const phone=selB.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");}} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:8,padding:"10px 16px",fontSize:13,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:700,flex:1}}>واتساب 📲</button>
                <button onClick={()=>{const url=`https://reetam-chalets.vercel.app?guest=1&b=${selB.id}&m=review`;const msg=`${selB.guest} 😊%0aرابط التقييم:%0a${encodeURIComponent(url)}`;const phone=selB.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");}} style={{background:"#F59E0B",color:"#fff",border:"none",borderRadius:8,padding:"10px 16px",fontSize:13,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:700,flex:1}}>تقييم ⭐</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {bkDetail&&(
        <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setBkDetail(null)}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)"}}/>
          <div style={{position:"relative",background:W,borderRadius:20,width:"100%",maxWidth:480,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{background:"linear-gradient(135deg,"+B+","+BD+")",padding:"20px 24px",position:"relative"}}>
              <button onClick={()=>setBkDetail(null)} style={{position:"absolute",top:14,left:16,background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:30,height:30,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginBottom:4}}>تفاصيل الحجز</div>
              <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>{bkDetail.guest}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:4,direction:"ltr",textAlign:"right"}}>{bkDetail.phone}</div>
              <span style={{position:"absolute",top:20,right:20,background:STATUS[bkDetail.status]?.bg||"#eee",color:STATUS[bkDetail.status]?.color||"#333",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:800}}>{STATUS[bkDetail.status]?.label||bkDetail.status}</span>
            </div>
            {/* Body */}
            <div style={{padding:"20px 24px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                {[
                  {l:"الشاليه",v:bkDetail.chalet,i:"🏠"},
                  {l:"عدد الليالي",v:fn(bkDetail.date_from,bkDetail.date_to)+" ليلة",i:"🌙"},
                  {l:"تاريخ الوصول",v:fd(bkDetail.date_from),i:"📅"},
                  {l:"تاريخ المغادرة",v:fd(bkDetail.date_to),i:"🚪"},
                  {l:"السعر الكلي",v:Number(bkDetail.price).toLocaleString()+" ر",i:"💰"},
                  {l:"طريقة الدفع",v:bkDetail.payment_method||"-",i:"💳"},
                ].map((item,i)=>(
                  <div key={i} style={{background:SL,borderRadius:10,padding:"12px 14px"}}>
                    <div style={{fontSize:10,color:T,marginBottom:4}}>{item.i} {item.l}</div>
                    <div style={{fontWeight:800,color:B,fontSize:14}}>{item.v}</div>
                  </div>
                ))}
              </div>
              {bkDetail.notes&&<div style={{background:SL,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                <div style={{fontSize:10,color:T,marginBottom:4}}>📝 ملاحظات</div>
                <div style={{fontSize:13,color:B}}>{bkDetail.notes}</div>
              </div>}
              <div style={{display:"flex",gap:8}}>
                <button className="btn be" style={{flex:1}} onClick={()=>{setBMdl({...bkDetail});setBkDetail(null);}}>✏️ تعديل</button>
                <button onClick={()=>{const url=`https://reetam-chalets.vercel.app?guest=1&b=${bkDetail.id}&m=checkin`;const msg=`مرحباً ${bkDetail.guest} 👋%0aأهلاً بك في ${bkDetail.chalet}%0a%0aرابط تسجيل الدخول:%0a${encodeURIComponent(url)}`;const phone=bkDetail.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");}} style={{flex:1,background:"#25D366",color:"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:13,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",fontWeight:700}}>واتساب 📲</button>
                {(bkDetail.status==="confirmed"||bkDetail.status==="pending")&&<button className="btn" style={{flex:1,background:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",color:"#fff"}} onClick={()=>{setCoMdl(bkDetail);setBkDetail(null);}}>🚪 خروج</button>}
              </div>
            </div>
          </div>
        </div>
      )}
      {goalMdl&&(
        <Mdl onClose={()=>setGoalMdl(null)} title={"🎯 هدف الشهر - "+goalMdl.name}>
          <p style={{color:T,fontSize:13,marginBottom:16}}>حدد الهدف الشهري لصافي الأرباح (الإيرادات - مصاريف الصيانة)</p>
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
                      width:"100%",background:"#4C1D95",color:"#fff",border:"none",
                      borderRadius:8,padding:"6px",fontSize:11,fontWeight:700,
                      cursor:"pointer",fontFamily:"'Tajawal',sans-serif",marginBottom:6,
                    }}>🔗 تجربة الرابط</button>
                    <button onClick={()=>{
                      const a=document.createElement("a");
                      a.href=qrSrc;
                      a.download=`QR-${qrMdl.chalet}-${room}.png`;
                      a.click();
                    }} style={{
                      width:"100%",background:"var(--th-bg)",color:"var(--text)",
                      border:"1px solid var(--border2)",borderRadius:8,padding:"6px",
                      fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Tajawal',sans-serif",
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
                fontSize:12,color:"#111",fontFamily:"'Tajawal',sans-serif",whiteSpace:"pre-wrap",
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
                background:"#25D366",color:"#fff",border:"none",borderRadius:10,
                padding:"10px 22px",fontSize:14,cursor:preArrMdl.booking.phone?"pointer":"not-allowed",
                fontFamily:"'Tajawal',sans-serif",fontWeight:700,opacity:preArrMdl.booking.phone?1:.5,
              }}>إرسال واتساب 📲</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default AppWrapper;
