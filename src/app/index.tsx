import { useState, useMemo, useEffect } from "react";
import { hashPassword } from "../lib/db";

const SUPA_URL = process.env.EXPO_PUBLIC_SUPA_URL!;
const SUPA_KEY = process.env.EXPO_PUBLIC_SUPA_KEY!;
const TUYA_DEVICES = { 16: "bf359141000334655ddl2t" };

async function fetchDeviceStatus(roomId) {
  const deviceId = TUYA_DEVICES[roomId];
  if (!deviceId) return null;
  try {
    const res = await fetch("https://kduoasfaqtrotesohqpf.supabase.co/functions/v1/tuya-control", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPA_KEY },
      body: JSON.stringify({ deviceId }),
    });
    const data = await res.json();
    if (!data?.result) return null;
    const status = {};
    data.result.forEach(s => { status[s.code] = s.value; });
    return {
      ac_on: status.power === "1" || status.power === true || status.power === 1,
      ac_temp: Number(status.temp) || 22,
      ac_mode: ["auto","cool","heat","fan","dry"][Number(status.mode)] || "cool",
      ac_speed: ["auto","low","medium","high"][Number(status.wind)] || "auto",
    };
  } catch(e) { return null; }
}

async function tuyaControl(deviceId, commands) {
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

async function sendACCommand(roomId, field, value) {
  const deviceId = TUYA_DEVICES[roomId];
  if (!deviceId) return;
  let commands = [];
  if (field === "ac_on")    commands = [{ code: value ? "PowerOn" : "PowerOff", value: value ? "PowerOn" : "PowerOff" }];
  if (field === "ac_temp")  commands = [{ code: "T", value: Number(value) }];
  if (field === "ac_mode")  { const m = {"cool":1,"heat":2,"fan":3,"dry":4,"auto":0}; commands = [{ code: "M", value: m[value]??0 }]; }
  if (field === "ac_speed") { const m = {"auto":0,"low":1,"medium":2,"high":3}; commands = [{ code: "F", value: m[value]??0 }]; }
  if (commands.length > 0) await tuyaControl(deviceId, commands);
}

async function db(table, method="GET", body=null, id=null) {
  let url = `${SUPA_URL}/rest/v1/${table}`;
  if (method === "GET") {
    url += id ? `?${id}&select=*` : "?order=id&select=*";
  } else if (id) {
    url += `?id=eq.${id}`;
  }
  const headers = {
    "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json", "Cache-Control": "no-cache",
  };
  if (method === "POST" || method === "PATCH") headers["Prefer"] = "return=representation";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  if (!res.ok) { const e = await res.text(); console.error("Supabase error:", method, table, id, e); return null; }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
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

const fd = d => d ? new Date(d).toLocaleDateString("ar-SA") : "-";
const fn = (f,t) => (!f||!t) ? 0 : Math.max(0, Math.round((new Date(t)-new Date(f))/86400000));
const td = () => new Date().toISOString().slice(0,10);

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
  @media(max-width:600px){
    .mbox{padding:16px;border-radius:14px}
    th,td{padding:8px;font-size:12px}
    h2{font-size:18px!important}
    .sg{grid-template-columns:repeat(2,1fr)}
    .g2{grid-template-columns:1fr}
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
function Logo({size}) {
  const s = size||40;
  return (
    <svg width={s} height={s*1.3} viewBox="0 0 100 130" fill="none">
      <rect x="10" y="2" width="80" height="96" rx="40" ry="40" stroke={S} strokeWidth="3" fill="none"/>
      <line x1="50" y1="2" x2="50" y2="98" stroke={S} strokeWidth="1.5"/>
      <line x1="10" y1="50" x2="90" y2="50" stroke={S} strokeWidth="1.5"/>
      <path d="M20 20 Q30 10 38 25 Q28 30 20 20Z" stroke={S} strokeWidth="1.5" fill="none"/>
      <path d="M25 35 Q35 20 42 38 Q32 42 25 35Z" stroke={S} strokeWidth="1.2" fill="none"/>
      <circle cx="70" cy="25" r="8" stroke={S} strokeWidth="1.2" fill="none"/>
      <circle cx="70" cy="25" r="4" stroke={S} strokeWidth="1" fill="none"/>
      <line x1="30" y1="75" x2="30" y2="92" stroke={S} strokeWidth="2"/>
      <path d="M30 75 Q22 68 18 60" stroke={S} strokeWidth="1.5" fill="none"/>
      <path d="M30 75 Q38 68 42 60" stroke={S} strokeWidth="1.5" fill="none"/>
      <circle cx="70" cy="65" r="7" stroke={S} strokeWidth="1.5" fill="none"/>
      <path d="M58 80 Q63 76 68 80 Q73 84 78 80" stroke={S} strokeWidth="1.5" fill="none"/>
      <path d="M58 85 Q63 81 68 85 Q73 89 78 85" stroke={S} strokeWidth="1.2" fill="none"/>
      <text x="50" y="118" textAnchor="middle" fill={S} fontSize="11" fontFamily="Tajawal,sans-serif" fontWeight="700">شاليه ريتام</text>
    </svg>
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

function BookingCalendar({bookings,names}) {
  const [view,setView] = useState("month");
  const [curDate,setCurDate] = useState(new Date());
  const [selCh,setSelCh] = useState("الكل");
  const y=curDate.getFullYear(), m=curDate.getMonth();
  const fb = bookings.filter(b=>b.status==="completed"&&(selCh==="الكل"||b.chalet===selCh));

  function getBookingsForDay(date) {
    return fb.filter(b=>{
      if(!b.date_from||!b.date_to) return false;
      const from=new Date(b.date_from); from.setHours(0,0,0,0);
      const to=new Date(b.date_to); to.setHours(23,59,59,999);
      return date>=from && date<=to;
    });
  }
  const SC = {
    confirmed:{bg:"#1a3a4a",border:"#4A9BAF",text:"#e0f4f8",grad:"linear-gradient(135deg,#1a3a4a,#1f4d5e)"},
    pending:  {bg:"#3d2e00",border:"#D4A017",text:"#FFE082",grad:"linear-gradient(135deg,#3d2e00,#4a3800)"},
    completed:{bg:"#1a2e1a",border:"#4CAF50",text:"#A5D6A7",grad:"linear-gradient(135deg,#1a2e1a,#1e3a1e)"},
  };

  function MonthView() {
    const firstDay=new Date(y,m,1).getDay();
    const daysInMonth=new Date(y,m+1,0).getDate();
    const days=[];
    for(let i=0;i<firstDay;i++) days.push(null);
    for(let d=1;d<=daysInMonth;d++) days.push(d);
    const dayNames=["أح","اث","ثل","أر","خم","جم","سب"];
    const today=new Date(); today.setHours(0,0,0,0);
    return (
      <div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:6}}>
          {dayNames.map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:800,color:B,padding:"6px 0",background:"rgba(197,172,136,.08)",borderRadius:6}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {days.map((d,i)=>{
            if(!d) return <div key={i} style={{minHeight:80}}/>;
            const date=new Date(y,m,d); date.setHours(0,0,0,0);
            const dayBookings=getBookingsForDay(date);
            const isToday=date.getTime()===today.getTime();
            const hasBk=dayBookings.length>0;
            return (
              <div key={i} style={{minHeight:80,padding:"5px 4px",borderRadius:10,background:isToday?"rgba(197,172,136,.12)":hasBk?"rgba(87,109,111,.04)":"#fafafa",border:isToday?"2px solid "+B:"1px solid rgba(197,172,136,.18)",transition:"box-shadow .2s",boxShadow:hasBk?"0 1px 4px rgba(0,0,0,.06)":"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <span style={{fontSize:12,fontWeight:isToday?900:600,color:isToday?"#fff":B,background:isToday?B:"transparent",borderRadius:isToday?"50%":"0",width:isToday?20:undefined,height:isToday?20:undefined,display:"flex",alignItems:"center",justifyContent:"center"}}>{d}</span>
                  {hasBk&&<span style={{fontSize:9,background:B,color:S,borderRadius:99,padding:"1px 5px",fontWeight:700}}>{dayBookings.length}</span>}
                </div>
                {dayBookings.slice(0,2).map((b,j)=>{
                  const sc=SC[b.status]||SC.confirmed;
                  const isStart=new Date(b.date_from).toDateString()===date.toDateString();
                  return (
                    <div key={j} style={{background:sc.grad||sc.bg,borderRight:"3px solid "+sc.border,borderRadius:5,padding:"2px 5px",fontSize:9,color:sc.text,fontWeight:700,marginBottom:2,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",boxShadow:"0 1px 3px rgba(0,0,0,.15)"}}>
                      {isStart?"▶ ":""}{b.guest}
                      <div style={{fontSize:8,opacity:.75,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{b.chalet}</div>
                    </div>
                  );
                })}
                {dayBookings.length>2&&<div style={{fontSize:9,color:B,fontWeight:700,textAlign:"center",marginTop:1}}>+{dayBookings.length-2} أكثر</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function WeekView() {
    const startOfWeek=new Date(curDate);
    startOfWeek.setDate(curDate.getDate()-curDate.getDay());
    startOfWeek.setHours(0,0,0,0);
    const days=Array.from({length:7},(_,i)=>{const d=new Date(startOfWeek);d.setDate(startOfWeek.getDate()+i);return d;});
    const today=new Date(); today.setHours(0,0,0,0);
    const dayNames=["أح","اث","ثل","أر","خم","جم","سب"];
    return (
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
        {days.map((date,i)=>{
          const dayBookings=getBookingsForDay(date);
          const isToday=date.getTime()===today.getTime();
          return (
            <div key={i} style={{borderRadius:12,overflow:"hidden",border:isToday?"2px solid "+B:"1px solid rgba(197,172,136,.2)",boxShadow:isToday?"0 2px 12px rgba(0,0,0,.1)":"none"}}>
              <div style={{background:isToday?B:SL,padding:"8px 4px",textAlign:"center"}}>
                <div style={{fontSize:10,fontWeight:700,color:isToday?S:T,marginBottom:2}}>{dayNames[i]}</div>
                <div style={{fontSize:18,fontWeight:900,color:isToday?S:B}}>{date.getDate()}</div>
                {dayBookings.length>0&&<div style={{fontSize:9,background:isToday?"rgba(255,255,255,.2)":"rgba(87,109,111,.15)",color:isToday?S:T,borderRadius:99,padding:"1px 6px",marginTop:2,display:"inline-block",fontWeight:700}}>{dayBookings.length} حجز</div>}
              </div>
              <div style={{padding:5,minHeight:90,background:W}}>
                {dayBookings.length===0
                  ?<div style={{fontSize:10,color:SI,textAlign:"center",marginTop:12,opacity:.5}}>فارغ</div>
                  :dayBookings.map((b,j)=>{
                    const sc=SC[b.status]||SC.confirmed;
                    return (
                      <div key={j} style={{background:sc.grad||sc.bg,borderRight:"3px solid "+sc.border,borderRadius:6,padding:"4px 6px",marginBottom:3,fontSize:10,color:sc.text,fontWeight:700,boxShadow:"0 1px 3px rgba(0,0,0,.15)"}}>
                        <div style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{b.guest}</div>
                        <div style={{fontSize:9,opacity:.8,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{b.chalet}</div>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const monthNames=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  function prev(){if(view==="month")setCurDate(new Date(y,m-1,1));else{const d=new Date(curDate);d.setDate(d.getDate()-7);setCurDate(d);}}
  function next(){if(view==="month")setCurDate(new Date(y,m+1,1));else{const d=new Date(curDate);d.setDate(d.getDate()+7);setCurDate(d);}}

  return (
    <div className="card" style={{overflow:"hidden",marginBottom:20}}>
      <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",background:SL,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button className="btn" onClick={prev} style={{background:W,color:B,border:"1px solid rgba(197,172,136,.4)",padding:"5px 10px",fontSize:14}}>‹</button>
          <div style={{fontWeight:800,color:B,fontSize:14,minWidth:120,textAlign:"center"}}>
            {view==="month"?monthNames[m]+" "+y:"الأسبوع · "+curDate.toLocaleDateString("ar-SA")}
          </div>
          <button className="btn" onClick={next} style={{background:W,color:B,border:"1px solid rgba(197,172,136,.4)",padding:"5px 10px",fontSize:14}}>›</button>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <select className="inp" style={{width:"auto",fontSize:12,padding:"5px 8px"}} value={selCh} onChange={e=>setSelCh(e.target.value)}>
            <option value="الكل">كل الشاليهات</option>
            {names.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{display:"flex",gap:4}}>
            {["month","week"].map(v=>(
              <button key={v} className="btn" onClick={()=>setView(v)} style={{background:view===v?B:W,color:view===v?S:B,border:"1px solid rgba(197,172,136,.4)",padding:"5px 12px",fontSize:12}}>
                {v==="month"?"شهري":"أسبوعي"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{padding:12}}>
        {view==="month"?<MonthView/>:<WeekView/>}
        <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
          {[{l:"مؤكد",c:"#4A9BAF",bg:"#1a3a4a"},{l:"معلق",c:"#D4A017",bg:"#3d2e00"},{l:"مكتمل",c:"#4CAF50",bg:"#1a2e1a"}].map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,background:"rgba(197,172,136,.08)",borderRadius:20,padding:"4px 10px"}}>
              <div style={{width:10,height:10,borderRadius:3,background:s.bg,border:"2px solid "+s.c}}/>
              <span style={{color:B,fontWeight:600}}>{s.l}</span>
            </div>
          ))}
        </div>
      </div>
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

function GuestPageEmbed({bookingId, mode}) {
  const [step,setStep] = useState("loading");
  const [booking,setBooking] = useState(null);
  const [rating,setRating] = useState(0);
  const [hover,setHover] = useState(0);
  const [comment,setComment] = useState("");
  const [submitted,setSubmitted] = useState(false);
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
          <div style={{background:"#F5EFE6",borderRadius:12,padding:16,marginBottom:20,maxHeight:280,overflowY:"auto"}}>
            <div style={{fontWeight:800,color:B,marginBottom:10,fontSize:14}}>📄 شروط وأحكام الإقامة</div>
            <div style={{fontSize:13,color:B,lineHeight:2,whiteSpace:"pre-line"}}>{TERMS}</div>
          </div>
          <button onClick={acceptTerms} style={{width:"100%",border:"none",cursor:"pointer",borderRadius:12,fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,background:`linear-gradient(135deg,${B},#2A2218)`,color:S}}>
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
      {step==="done"&&(
        <div style={{...card,textAlign:"center"}}>
          <div style={{fontSize:60,marginBottom:12}}>🌟</div>
          <div style={{fontSize:22,fontWeight:800,color:B,marginBottom:8}}>شكراً لك!</div>
          <div style={{fontSize:14,color:T}}>{submitted?"تم إرسال تقييمك 😊":"لقد قيّمت هذا الحجز مسبقاً"}</div>
          <div style={{marginTop:16,fontSize:13,color:T}}>مجموعة ريتام للشاليهات 🏖️</div>
        </div>
      )}
    </div>
  );
}

function LoginPage({onLogin}) {
  const [login,setLogin] = useState("");
  const [pass,setPass] = useState("");
  const [err,setErr] = useState("");
  const [loading,setLoading] = useState(false);

  async function doLogin() {
    if(!login||!pass){setErr("أدخل بيانات الدخول");return;}
    setLoading(true); setErr("");
    let user = null;
    const r1 = await db("users","GET",null,"email=eq."+encodeURIComponent(login)+"&select=*");
    if(r1&&r1[0]) user=r1[0];
    if(!user){
      const r2 = await db("users","GET",null,"username=eq."+encodeURIComponent(login)+"&select=*");
      if(r2&&r2[0]) user=r2[0];
    }
    if(!user){setErr("بيانات الدخول غير صحيحة");setLoading(false);return;}

    const hashed = await hashPassword(pass);
    const isHashed = user.password === hashed;
    const isPlaintext = !isHashed && user.password === pass;

    if(!isHashed && !isPlaintext){setErr("بيانات الدخول غير صحيحة");setLoading(false);return;}

    // ترقية تلقائية: إذا كانت كلمة المرور بنص واضح، نحولها لـ hash
    if(isPlaintext){
      await db("users","PATCH",{password: hashed},user.id);
      user = {...user, password: hashed};
    }

    const {password: _omit, ...safeUser} = user;
    localStorage.setItem("reetam_user",JSON.stringify(safeUser));
    onLogin(safeUser);
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
          <label className="lbl">البريد أو اسم المستخدم</label>
          <input className="inp" value={login} onChange={e=>setLogin(e.target.value)} placeholder="admin" onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        <div style={{marginBottom:20}}>
          <label className="lbl">كلمة المرور</label>
          <input className="inp" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        <button onClick={doLogin} disabled={loading}
          style={{width:"100%",border:"none",cursor:loading?"not-allowed":"pointer",borderRadius:12,fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,background:"linear-gradient(135deg,#413523,#2A2218)",color:"#C5AC88"}}>
          {loading?"جاري التحقق...":"تسجيل الدخول"}
        </button>
      </div>
    </div>
  );
}

function AppWrapper() {
  const [ready,setReady] = useState(false);
  const [isGuest,setIsGuest] = useState(false);
  const [guestParams,setGuestParams] = useState({bookingId:null,mode:"checkin"});
  const [currentUser,setCurrentUser] = useState(null);

  useEffect(()=>{
    const p = new URLSearchParams(window.location.search);
    if(p.get("guest")==="1"){
      setGuestParams({bookingId:p.get("b"),mode:p.get("m")||"checkin"});
      setIsGuest(true);
    }
    const saved = localStorage.getItem("reetam_user");
    if(saved){try{setCurrentUser(JSON.parse(saved));}catch(e){}}
    setReady(true);
  },[]);

  if(!ready) return null;
  if(isGuest) return <GuestPageEmbed bookingId={guestParams.bookingId} mode={guestParams.mode}/>;
  if(!currentUser) return <LoginPage onLogin={u=>setCurrentUser(u)}/>;
  return <App currentUser={currentUser} onLogout={()=>{localStorage.removeItem("reetam_user");setCurrentUser(null);}}/>;
}

function App({currentUser={role:"admin",name:"المستخدم"}, onLogout=()=>{}}) {
  const isAdmin        = currentUser.role === "admin";
  const isStaff        = currentUser.role === "staff";
  const isChaletMgr    = currentUser.role === "chalet_manager";
  const isMobile       = useIsMobile();
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [goalMdl,setGoalMdl]       = useState(null);
  const [bkDetail,setBkDetail]     = useState(null);
  const [selB,setSelB]             = useState(null);

  const [tab,setTab]           = useState("dashboard");
  const [chalets,setChalets]   = useState([]);
  const [bookings,setBookings] = useState([]);
  const [maint,setMaint]       = useState([]);
  const [wallet,setWallet]     = useState([]);
  const [cleaning,setCleaning] = useState([]);
  const [clMdl,setClMdl]       = useState(null);
  const [clnMdl,setClnMdl]     = useState(false);
  const [clExp,setClExp]       = useState([]);
  const [clExpMdl,setClExpMdl] = useState(null);
  const [clTasks,setClTasks]   = useState([]);
  const [clLogs,setClLogs]     = useState([]);
  const [clTaskMdl,setClTaskMdl] = useState(null);
  const [clSelCh,setClSelCh]   = useState(null);
  const [expenses,setExpenses] = useState([]);
  const [users,setUsers]       = useState([]);
  const [rooms,setRooms]       = useState([]);
  const [reviews,setReviews]   = useState([]);
  const [loading,setLoading]   = useState(true);
  const [fch,setFch]           = useState("الكل");
  const [selChalet,setSelChalet] = useState(null);

  const [bMdl,setBMdl]       = useState(null);
  const [mMdl,setMMdl]       = useState(null);
  const [mOld,setMOld]       = useState(null);
  const [cMdl,setCMdl]       = useState(null);
  const [iMdl,setIMdl]       = useState(false);
  const [wMdl,setWMdl]       = useState(null);
  const [coMdl,setCoMdl]     = useState(null);
  const [exMdl,setExMdl]     = useState(null);
  const [uMdl,setUMdl]       = useState(null);
  const [addRoomMdl,setAddRoomMdl] = useState(null);

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
    loadAll();
    // تحديث تلقائي كل 30 ثانية للبيانات المتغيرة
    const interval = setInterval(()=>loadAll(), 30_000);
    return ()=>clearInterval(interval);
  },[]);

  async function loadAll() {
    try {
      const [c,b,m,w,cl,cle,ctasks,clogs,sd,rm,rv,ex,us] = await Promise.all([
        db("chalets"), db("bookings"), db("maintenance"), db("wallet"), db("cleaning"), db("cleaning_expenses"), db("cleaning_tasks"), db("cleaning_logs"),
        db("smart_devices"), db("rooms"), db("reviews"), db("expenses"), db("users")
      ]);
      const sdMap = {};
      (sd||[]).forEach(d=>{if(d.room_id)sdMap["room_"+d.room_id]=d;else sdMap[d.chalet]=d;});
      setChalets((c||[]).map(ch=>({...ch,_acOn:sdMap[ch.name]?.ac_on||false,_acTemp:sdMap[ch.name]?.ac_temp||22,_acMode:sdMap[ch.name]?.ac_mode||"cool",_acSpeed:sdMap[ch.name]?.ac_speed||"auto",_sdId:sdMap[ch.name]?.id||null})));
      setRooms((rm||[]).map(r=>({...r,_acOn:sdMap["room_"+r.id]?.ac_on||false,_acTemp:sdMap["room_"+r.id]?.ac_temp||22,_acMode:sdMap["room_"+r.id]?.ac_mode||"cool",_acSpeed:sdMap["room_"+r.id]?.ac_speed||"auto",_sdId:sdMap["room_"+r.id]?.id||null})));
      setBookings(b||[]); setMaint(m||[]); setWallet(w||[]); setCleaning(cl||[]); setClExp(cle||[]); setClTasks(ctasks||[]); setClLogs(clogs||[]);
      setReviews(rv||[]); setExpenses(ex||[]); setUsers(us||[]);
      setLoading(false);
    } catch(e) { console.error(e); setLoading(false); }
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
    return chalets.map(c=>({
      ...c,
      rev:bookings.filter(b=>b.chalet===c.name&&b.status==="completed").reduce((s,b)=>s+Number(b.price),0),
      totalRev:(Number(c.prev_revenue)||0)+bookings.filter(b=>b.chalet===c.name&&b.status==="completed").reduce((s,b)=>s+Number(b.price),0),
      monthRev:bookings.filter(b=>b.chalet===c.name&&b.status==="completed"&&b.date_from&&new Date(b.date_from).getFullYear()===y&&new Date(b.date_from).getMonth()===mo).reduce((s,b)=>s+Number(b.price),0),
      monthExp:maint.filter(m=>m.chalet===c.name&&Number(m.cost)>0&&m.maint_date&&new Date(m.maint_date).getFullYear()===y&&new Date(m.maint_date).getMonth()===mo).reduce((s,m)=>s+Number(m.cost),0),
      mtot:maint.filter(m=>m.chalet===c.name).length,
      mop:maint.filter(m=>m.chalet===c.name&&m.status==="open").length,
      mip:maint.filter(m=>m.chalet===c.name&&m.status==="in_progress").length,
      mdn:maint.filter(m=>m.chalet===c.name&&m.status==="done").length,
      ins:cBal[c.name]||0,
      goal:Number(c.monthly_goal||0),
    }));
  },[chalets,bookings,maint,cBal]);

  const eC = {name:"",loc:"",cap:"",price:"",wprice:"",ins:"",description:"",st:"active",img:null};
  const eB = {chalet:names[0]||"",guest:"",phone:"",date_from:"",date_to:"",price:"",status:"confirmed",note:""};
  const eM = {chalet:names[0]||"",issue:"",maint_date:"",priority:"متوسط",status:"open",cost:"",note:"",req:"",image:null};

  async function svC(f){const openDate=f.open_date?f.open_date+"-01":null;const body={name:f.name,loc:f.loc,cap:Number(f.cap),price:Number(f.price),wprice:Number(f.wprice),ins:Number(f.ins),description:f.description,st:f.st,img:f.img||null,open_date:openDate,prev_revenue:Number(f.prev_revenue)||0};if(f.id){await db("chalets","PATCH",body,f.id);}else{await db("chalets","POST",body);if(Number(f.ins)>0)await db("wallet","POST",{trans_date:td(),type:"إيداع",chalet:f.name,cat:"تأمين",amount:Number(f.ins),note:"رصيد افتتاحي"});}await loadAll();setCMdl(null);}
  async function dlC(id){if(!window.confirm("حذف الشاليه نهائياً؟ لا يمكن التراجع."))return;await db("chalets","DELETE",null,id);await loadAll();}
  async function svB(f){const body={chalet:f.chalet,guest:f.guest,phone:f.phone,date_from:f.date_from,date_to:f.date_to,price:Number(f.price),status:f.status,note:f.note};if(f.id)await db("bookings","PATCH",body,f.id);else await db("bookings","POST",body);await loadAll();setBMdl(null);}
  async function svM(f,old){const cost=Number(f.cost)||0;const wasDone=old?.status==="done";const isDone=f.status==="done";const isNew=!f.id;const body={chalet:f.chalet,issue:f.issue,maint_date:f.maint_date,priority:f.priority,status:f.status,cost,note:f.note,req:f.req,image:f.image||null};if(f.id)await db("maintenance","PATCH",body,f.id);else await db("maintenance","POST",body);if(cost>0&&isDone&&(isNew||!wasDone))await db("wallet","POST",{trans_date:f.maint_date||td(),type:"سحب صيانة",chalet:f.chalet,cat:"صيانة",amount:cost,note:f.issue||"صيانة"});await loadAll();setMMdl(null);}
  async function svAC(chalet,field,value,roomId=null){if(roomId){const room=rooms.find(r=>r.id===roomId);const body={chalet,room_id:roomId,room_name:room?.name||"",ac_on:field==="ac_on"?value:(room?._acOn||false),ac_temp:field==="ac_temp"?value:(room?._acTemp||22),ac_mode:field==="ac_mode"?value:(room?._acMode||"cool"),ac_speed:field==="ac_speed"?value:(room?._acSpeed||"auto"),updated_at:new Date().toISOString()};if(room?._sdId){await db("smart_devices","PATCH",body,room._sdId);}else{const res=await db("smart_devices","POST",body);if(res?.[0])setRooms(p=>p.map(x=>x.id===roomId?{...x,_sdId:res[0].id}:x));}await sendACCommand(roomId,field,value);}else{const ch=chalets.find(x=>x.name===chalet);const body={chalet,ac_on:field==="ac_on"?value:(ch?._acOn||false),ac_temp:field==="ac_temp"?value:(ch?._acTemp||22),ac_mode:field==="ac_mode"?value:(ch?._acMode||"cool"),ac_speed:field==="ac_speed"?value:(ch?._acSpeed||"auto"),updated_at:new Date().toISOString()};if(ch?._sdId){await db("smart_devices","PATCH",body,ch._sdId);}else{const res=await db("smart_devices","POST",body);if(res?.[0])setChalets(p=>p.map(x=>x.name===chalet?{...x,_sdId:res[0].id}:x));}}}
  async function svCln(chalet,amount,note){const amt=Number(amount);if(!amt||!chalet)return;await db("cleaning","POST",{trans_date:td(),type:"إيداع",chalet,amount:amt,note:note||"إيداع نظافة"});await loadAll();setClnMdl(false);}
  async function svI(chalet,amount,note){const amt=Number(amount);if(!amt||!chalet)return;await db("wallet","POST",{trans_date:td(),type:"إيداع",chalet,cat:"تأمين",amount:amt,note:note||"إيداع تأمين"});await loadAll();setIMdl(false);}
  async function handleCheckout(booking,amt,pay){await db("bookings","PATCH",{status:"completed",price:amt},booking.id);await loadAll();setCoMdl(null);}

  const TABS = [
    {id:"dashboard",  l:"الرئيسية",    i:"⊞"},
    {id:"chalets",    l:"الشاليهات",   i:"🏠"},
    {id:"bookings",   l:"الحجوزات",    i:"📅"},
    {id:"finance",    l:"المالية",     i:"💰"},
    {id:"maintenance",l:"الصيانة",     i:"🔧"},
    {id:"insurance",  l:"التأمين",     i:"🛡️"},
    {id:"cleaning",   l:"النظافة",     i:"🧹"},
    {id:"smart",      l:"التحكم الذكي",i:"🌡️"},
    {id:"reviews",    l:"التقييمات",   i:"⭐"},
    {id:"settings",   l:"الإعدادات",   i:"⚙️"},
  ];

  function allowedTabs(t) {
    if(isAdmin) return true;
    if(isChaletMgr) return ["dashboard","bookings","maintenance","reviews","smart"].includes(t.id);
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
    width:220, background:"#2C2419", position:"fixed", top:0, right:0,
    height:"100vh", zIndex:50, overflowY:"auto", display:"flex", flexDirection:"column"
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
              <span style={{color:"#C5AC88",fontSize:11}}>{currentUser.name||currentUser.username}</span>
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
        <main style={{maxWidth:1100,margin:"0 auto",padding:isMobile?"14px 12px":"24px 20px",paddingBottom:isMobile?80:60}}>

          {/* ── Dashboard ── */}
          {tab==="dashboard"&&(
            <div>
              {/* ── الترويسة ── */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontSize:22,fontWeight:900,color:B}}>لوحة التحكم</div>
                  <div style={{fontSize:12,color:T,marginTop:2}}>{new Date().toLocaleDateString("ar-SA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
                </div>
              </div>

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

              {/* ── الأرقام الكبيرة ── */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:20}}>
                {/* إيرادات الشهر */}
                {(()=>{
                  const now=new Date();
                  const monthRev=bookings.filter(b=>b.status==="completed"&&b.date_from&&new Date(b.date_from).getFullYear()===now.getFullYear()&&new Date(b.date_from).getMonth()===now.getMonth()).reduce((s,b)=>s+Number(b.price),0);
                  const lastMonthRev=bookings.filter(b=>b.status==="completed"&&b.date_from&&new Date(b.date_from).getFullYear()===now.getFullYear()&&new Date(b.date_from).getMonth()===now.getMonth()-1).reduce((s,b)=>s+Number(b.price),0);
                  const diff=lastMonthRev>0?Math.round((monthRev-lastMonthRev)/lastMonthRev*100):0;
                  return (
                    <div style={{background:"linear-gradient(135deg,#1C3A3A,#0F2525)",borderRadius:14,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,.2)"}}>
                      <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginBottom:6}}>💰 إيرادات هذا الشهر</div>
                      <div style={{fontSize:28,fontWeight:900,color:"#fff"}}>{monthRev.toLocaleString()}<span style={{fontSize:14,marginRight:4}}>ر</span></div>
                      {diff!==0&&<div style={{fontSize:11,color:diff>0?"#4CAF50":"#FF6B6B",marginTop:4,fontWeight:700}}>{diff>0?"↑":"↓"} {Math.abs(diff)}% عن الشهر الماضي</div>}
                    </div>
                  );
                })()}
                {/* إجمالي الإيرادات */}
                <div style={{background:"linear-gradient(135deg,"+T+","+TD+")",borderRadius:14,padding:18,boxShadow:"0 4px 16px rgba(0,0,0,.2)"}}>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginBottom:6}}>📈 إجمالي الإيرادات</div>
                  <div style={{fontSize:28,fontWeight:900,color:"#fff"}}>{totRev.toLocaleString()}<span style={{fontSize:14,marginRight:4}}>ر</span></div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginTop:4}}>{bookings.filter(b=>b.status==="completed").length} حجز مكتمل</div>
                </div>
              </div>

              {/* ── صف ثاني: محافظ + إحصائيات ── */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
                {[
                  {l:"محفظة التأمين",  v:walletBal,   i:"🛡️", c:"#4A9BAF", bg:"rgba(74,155,175,.1)"},
                  {l:"محفظة النظافة",  v:cleaningBal, i:"🧹", c:"#4CAF50", bg:"rgba(76,175,80,.1)"},
                  {l:"تكاليف الصيانة",v:mCost,       i:"🔧", c:"#C97B63", bg:"rgba(201,123,99,.1)"},
                  {l:"حجوزات نشطة",   v:actB,        i:"📅", c:B,         bg:SL, isNum:true},
                ].map((s,i)=>(
                  <div key={i} style={{background:s.bg,borderRadius:12,padding:"14px 12px",border:"1px solid rgba(197,172,136,.2)"}}>
                    <div style={{fontSize:18,marginBottom:6}}>{s.i}</div>
                    <div style={{fontSize:s.isNum?24:18,fontWeight:900,color:s.c}}>{s.isNum?s.v:s.v.toLocaleString()+" ر"}</div>
                    <div style={{fontSize:10,color:T,marginTop:3}}>{s.l}</div>
                  </div>
                ))}
              </div>

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
                            <div key={b.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<upcoming.length-1?"1px solid rgba(197,172,136,.08)":"none"}}>
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

              {/* ── الرسم البياني ── */}
              {(()=>{
                const months=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
                const currentYear=new Date().getFullYear();
                const monthlyData=months.map((_,mi)=>bookings.filter(b=>b.status==="completed"&&b.date_from&&new Date(b.date_from).getFullYear()===currentYear&&new Date(b.date_from).getMonth()===mi).reduce((s,b)=>s+Number(b.price),0));
                const maxVal=Math.max(...monthlyData,1);
                const curMonth=new Date().getMonth();
                const total=monthlyData.reduce((s,v)=>s+v,0);
                return (
                  <div className="card" style={{overflow:"hidden",marginBottom:16}}>
                    <div style={{padding:"14px 18px",borderBottom:"2px solid rgba(197,172,136,.2)",background:SL,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontWeight:800,color:B,fontSize:14}}>📊 الإيرادات الشهرية {currentYear}</span>
                      <span style={{fontSize:12,color:T,fontWeight:600}}>الإجمالي: {total.toLocaleString()} ر</span>
                    </div>
                    <div style={{padding:"20px 16px 10px"}}>
                      <div style={{display:"flex",alignItems:"flex-end",gap:3,height:140}}>
                        {monthlyData.map((v,i)=>{
                          const h=maxVal>0?Math.max((v/maxVal)*100,2):2;
                          const isCur=i===curMonth;
                          const isPast=i<curMonth;
                          return (
                            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                              {v>0&&<div style={{fontSize:8,color:isCur?B:T,fontWeight:isCur?800:500}}>{v>=1000?(v/1000).toFixed(1)+"k":v}</div>}
                              <div style={{width:"100%",height:h+"%",background:isCur?"linear-gradient(180deg,"+B+","+BD+")":isPast?"linear-gradient(180deg,rgba(87,109,111,.6),rgba(87,109,111,.3))":"rgba(197,172,136,.2)",borderRadius:"6px 6px 0 0",position:"relative",transition:"height .3s"}}>
                                {isCur&&<div style={{position:"absolute",top:-3,left:"50%",transform:"translateX(-50%)",width:6,height:6,borderRadius:"50%",background:B}}/>}
                              </div>
                              <div style={{fontSize:8,color:isCur?B:SI,fontWeight:isCur?800:400}}>{months[i].slice(0,3)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Chalets ── */}
          {tab==="chalets"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
                <TH title="إدارة الشاليهات"/>
                <button className="btn bp" onClick={()=>setCMdl({...eC})}>+ إضافة شاليه</button>
              </div>
              <div className="cg">
                {cStats.map(c=>(
                  <div key={c.id} className="cc">
                    <div style={{position:"relative",height:170,overflow:"hidden",background:"linear-gradient(135deg,"+B+","+BD+")"}}>
                      {c.img?<img src={c.img} alt={c.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:40,opacity:.25}}>🏠</span></div>}
                      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(42,34,24,.9))",padding:"18px 14px 10px"}}>
                        <div style={{color:S,fontWeight:800,fontSize:15}}>{c.name}</div>
                        <div style={{color:SI,fontSize:11,marginTop:2}}>{"📍 "+c.loc+(c.open_date?" · افتتح: "+c.open_date.slice(0,7):"")}</div>
                      </div>
                      <div style={{position:"absolute",top:8,left:8}}><Bdg bg={c.st==="active"?"rgba(141,149,119,.85)":"rgba(139,58,58,.85)"} color="#fff">{c.st==="active"?"نشط":"موقف"}</Bdg></div>
                      <label style={{position:"absolute",top:8,right:8,background:"rgba(42,34,24,.7)",borderRadius:7,padding:"4px 8px",cursor:"pointer",color:S,fontSize:11,fontWeight:600}}>
                        📷 تغيير
                        <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>setChalets(p=>p.map(x=>x.id===c.id?{...x,img:ev.target.result}:x));r.readAsDataURL(file);}}/>
                      </label>
                    </div>
                    <div style={{padding:"14px 16px"}}>
                      <p style={{color:T,fontSize:12,marginBottom:12}}>{c.description||"—"}</p>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:12}}>
                        {[{l:"السعة",v:c.cap+" شخص",i:"👥"},{l:"سعر عادي",v:c.price+" ريال",i:"🌙"},{l:"سعر ويكند",v:(c.wprice||"-")+(c.wprice?" ريال":""),i:"🎉"},{l:"إيرادات النظام",v:c.rev.toLocaleString()+" ر",i:"📈"},{l:"إجمالي الإيرادات",v:c.totalRev.toLocaleString()+" ر",i:"💰"},{l:"التأمين",v:c.ins.toLocaleString()+" ر",i:"🛡️"}].map((item,i)=>(
                          <div key={i} style={{background:SL,borderRadius:8,padding:"7px 9px",border:"1px solid rgba(197,172,136,.2)"}}>
                            <div style={{fontSize:10,color:T}}>{item.i+" "+item.l}</div>
                            <div style={{fontWeight:700,color:B,fontSize:12,marginTop:2}}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:5,marginBottom:12}}>
                        {[{l:"مفتوح",c:"#8B3A3A",bg:"#F5E6E6",v:c.mop},{l:"جاري",c:"#8B6914",bg:"#F5EFD6",v:c.mip},{l:"منتهي",c:SD,bg:"#EEF0E9",v:c.mdn}].map((x,i)=>(
                          <div key={i} style={{flex:1,textAlign:"center",background:x.bg,borderRadius:7,padding:"6px 0"}}>
                            <div style={{fontSize:18,fontWeight:800,color:x.c}}>{x.v}</div>
                            <div style={{fontSize:10,color:x.c}}>{x.l}</div>
                          </div>
                        ))}
                      </div>

                      {/* هدف الشهر */}
                      {c.goal>0&&(()=>{
                        const netMonth=c.monthRev-c.monthExp;
                        const pct=Math.min(Math.round(netMonth/c.goal*100),100);
                        const color=pct>=100?"#4CAF50":pct>=60?"#B8A06A":"#C97B63";
                        return (
                          <div style={{marginBottom:12,background:SL,borderRadius:10,padding:"10px 12px",border:"1px solid rgba(197,172,136,.2)"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <span style={{fontSize:11,fontWeight:700,color:B}}>🎯 هدف الشهر</span>
                              <span style={{fontSize:11,fontWeight:800,color}}>{pct+"%"}</span>
                            </div>
                            <div style={{background:"rgba(197,172,136,.2)",borderRadius:99,height:8,overflow:"hidden",marginBottom:5}}>
                              <div style={{width:pct+"%",height:"100%",background:color,borderRadius:99,transition:"width .4s"}}/>
                            </div>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T}}>
                              <span>{"صافي: "+netMonth.toLocaleString()+" ر"}</span>
                              <span>{"هدف: "+c.goal.toLocaleString()+" ر"}</span>
                            </div>
                          </div>
                        );
                      })()}

                      <div style={{display:"flex",gap:7}}>
                        <button className="btn be" style={{flex:1,padding:"8px",fontSize:13}} onClick={()=>setCMdl({...c,open_date:c.open_date?c.open_date.slice(0,7):""})}>✏️ تعديل</button>
                        <button className="btn bp bsm" style={{padding:"8px 12px",fontSize:12}} onClick={()=>setGoalMdl({id:c.id,name:c.name,goal:c.goal||""})}>🎯</button>
                        <button className="btn bd bsm" style={{padding:"8px 12px"}} onClick={()=>dlC(c.id)}>🗑️</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                                <div style={{fontWeight:800,color:B,fontSize:13}}>{b.guest}</div>
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
            <FinTab
              bookings={bookings} maintenance={maint} wallet={wallet} names={names}
              expenses={expenses}
              onAddExpense={()=>setExMdl({chalet:names[0]||"",category:"إيجار",amount:"",note:"",expense_date:td()})}
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
                      <td>{fd(t.trans_date)}</td>
                      <td style={{fontWeight:600}}>{t.chalet}</td>
                      <td><Bdg bg={t.type==="إيداع"?"#E8F5EE":"#F5E6E6"} color={t.type==="إيداع"?"#3D7A5A":"#8B3A3A"}>{t.type}</Bdg></td>
                      <td style={{fontWeight:700,color:t.type==="إيداع"?"#3D7A5A":"#8B3A3A"}}>{(t.type==="إيداع"?"+":"-")+t.amount.toLocaleString()+" ر"}</td>
                      <td style={{color:T,fontSize:12}}>{t.note||"-"}</td>
                      <td><div style={{display:"flex",gap:4}}><button className="btn be bsm" onClick={()=>setClMdl({...t})}>تعديل</button><button className="btn bd bsm" onClick={async()=>{if(window.confirm("حذف هذا الصف؟")){await db("cleaning","DELETE",null,t.id);await loadAll();}}}>حذف</button></div></td>
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
                        <td style={{fontSize:12}}>{fd(e.expense_date)}</td>
                        <td style={{fontWeight:600}}>{e.chalet}</td>
                        <td><Bdg bg="#E8F5EE" color="#3D7A5A">{e.category}</Bdg></td>
                        <td style={{fontWeight:700,color:"#8B3A3A"}}>-{Number(e.amount).toLocaleString()+" ر"}</td>
                        <td style={{color:T,fontSize:12}}>{e.note||"-"}</td>
                        <td><div style={{display:"flex",gap:4}}>
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

                {(clSelCh?[clSelCh]:names).map(chName=>{
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
                      <table style={{width:"100%",borderCollapse:"collapse"}}>
                        <thead><tr style={{background:"rgba(197,172,136,.1)"}}>
                          {["المهمة","الفئة","التكرار","المسؤول","العامل ✓","المشرف ✓","ملاحظة",""].map((h,i)=><th key={i} style={{padding:"8px 12px",textAlign:"right",fontSize:12,color:T,fontWeight:600}}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {tasks.map(task=>{
                            const log = logs.find(l=>l.task_id===task.id);
                            return (
                              <tr key={task.id} style={{borderTop:"1px solid rgba(197,172,136,.15)",background:log?.supervisor_ok?"rgba(61,122,90,.05)":log?"rgba(184,160,106,.05)":""}}>
                                <td style={{padding:"10px 12px",fontWeight:600,fontSize:13}}>{task.title}</td>
                                <td style={{padding:"10px 12px"}}><Bdg bg="#E8F5EE" color="#3D7A5A">{task.category}</Bdg></td>
                                <td style={{padding:"10px 12px",fontSize:12,color:T}}>{task.frequency}</td>
                                <td style={{padding:"10px 12px",fontSize:12}}>{task.assigned_to||"-"}</td>
                                <td style={{padding:"10px 12px",textAlign:"center"}}>
                                  {log ? <span style={{color:"#3D7A5A",fontWeight:700,fontSize:16}}>✓</span> : <span style={{color:"#ccc",fontSize:16}}>○</span>}
                                </td>
                                <td style={{padding:"10px 12px",textAlign:"center"}}>
                                  {log?.supervisor_ok
                                    ? <span style={{color:"#3D7A5A",fontWeight:700,fontSize:16}}>✓</span>
                                    : <button className="btn be bsm" style={{fontSize:11}} onClick={async()=>{
                                        if(log){await db("cleaning_logs","PATCH",{supervisor_ok:true},log.id);}
                                        else{await db("cleaning_logs","POST",{task_id:task.id,chalet:chName,log_date:td(),worker_done:false,supervisor_ok:true,note:""});}
                                        await loadAll();
                                      }}>تأكيد</button>
                                  }
                                </td>
                                <td style={{padding:"10px 12px",fontSize:12,color:T}}>{log?.note||"-"}</td>
                                <td style={{padding:"10px 12px"}}>
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
                  );
                })}
                {clTasks.length===0&&<div className="card" style={{padding:24,textAlign:"center",color:T}}>لا توجد مهام بعد — أضف مهام النظافة لكل شاليه</div>}
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
          {tab==="reviews"&&(
            <div>
              <div style={{marginBottom:20}}><h2 style={{color:B,fontWeight:800,fontSize:22,marginBottom:6}}>⭐ تقييمات الضيوف</h2><div style={{width:50,height:3,background:S,borderRadius:99,marginBottom:16}}></div></div>
              {reviews.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:20}}>
                  {[{l:"إجمالي التقييمات",v:String(reviews.length),i:"📝",bg:W,c:B},{l:"متوسط التقييم",v:(reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1)+" ⭐",i:"⭐",bg:"linear-gradient(135deg,#F59E0B,#D97706)",c:"#fff"},{l:"تقييم 5 نجوم",v:String(reviews.filter(r=>r.rating===5).length),i:"🌟",bg:"linear-gradient(135deg,#10b981,#059669)",c:"#fff"}].map((s,i)=>(
                    <div key={i} style={{background:s.bg,borderRadius:12,padding:"16px",boxShadow:"0 4px 14px rgba(65,53,35,.1)",border:s.bg===W?"1px solid rgba(197,172,136,.3)":"none"}}>
                      <div style={{fontSize:20,marginBottom:5}}>{s.i}</div>
                      <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div>
                      <div style={{fontSize:11,color:s.bg===W?T:"rgba(255,255,255,.8)",marginTop:2}}>{s.l}</div>
                    </div>
                  ))}
                </div>
              )}
              {reviews.length===0
                ?<div className="card" style={{padding:40,textAlign:"center",color:T}}><div style={{fontSize:48,marginBottom:12}}>⭐</div><div style={{fontWeight:700,fontSize:16,marginBottom:8}}>لا توجد تقييمات بعد</div><div style={{fontSize:13}}>أرسل رابط التقييم للضيوف من صفحة الحجوزات</div></div>
                :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
                  {[...reviews].filter(r=>isAdmin||isStaff||(isChaletMgr&&r.chalet===currentUser.chalet)).reverse().map((r,i)=>(
                    <div key={i} className="card" style={{padding:16}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                        <div><div style={{fontWeight:700,color:B,fontSize:14}}>{r.guest}</div><div style={{fontSize:12,color:T}}>{r.chalet}</div></div>
                        <div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(s=>(<span key={s} style={{fontSize:18,color:r.rating>=s?"#F59E0B":"#E5E7EB"}}>★</span>))}</div>
                      </div>
                      {r.comment&&<div style={{fontSize:13,color:T,background:"#FAF8F5",borderRadius:8,padding:"8px 12px",lineHeight:1.7}}>{r.comment}</div>}
                      <div style={{fontSize:11,color:SI,marginTop:8}}>{new Date(r.created_at).toLocaleDateString("ar-SA")}</div>
                    </div>
                  ))}
                </div>
              }
            </div>
          )}

          {/* ── Settings ── */}
          {tab==="settings"&&isAdmin&&(
            <div>
              <TH title="⚙️ الإعدادات"/>
              <div className="card" style={{overflow:"hidden",marginBottom:20}}>
                <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",background:SL,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontWeight:700,color:B,fontSize:14}}>👥 إدارة المستخدمين</span>
                  <button className="btn bp" onClick={()=>setUMdl({name:"",username:"",email:"",password:"",role:"staff",chalet:""})}>+ إضافة مستخدم</button>
                </div>
                <Tbl heads={["الاسم","اسم المستخدم","البريد","الصلاحية","الشاليه","إجراءات"]}
                  rows={users.map(u=>(
                    <tr key={u.id}>
                      <td style={{fontWeight:600}}>{u.name}</td>
                      <td style={{color:T}}>{u.username||"—"}</td>
                      <td style={{color:T,fontSize:12}}>{u.email||"—"}</td>
                      <td><Bdg bg={u.role==="admin"?"#2C2419":u.role==="chalet_manager"?"#F5EFD6":"#E8F0F0"} color={u.role==="admin"?"#C5AC88":u.role==="chalet_manager"?"#8B6914":"#576D6F"}>{u.role==="admin"?"أدمن":u.role==="chalet_manager"?"مدير شاليه":"موظف"}</Bdg></td>
                      <td style={{color:T,fontSize:12}}>{u.chalet||"كل الشاليهات"}</td>
                      <td>
                        <div style={{display:"flex",gap:4}}>
                          <button className="btn be bsm" onClick={()=>setUMdl({...u})}>تعديل</button>
                          {u.role!=="admin"&&<button className="btn bd bsm" onClick={async()=>{if(!window.confirm("حذف "+u.name+"؟"))return;await db("users","DELETE",null,u.id);await loadAll();}}>حذف</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                />
              </div>
            </div>
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
              <label className="lbl">صورة الشاليه</label>
              <label style={{display:"block",border:"2px dashed rgba(197,172,136,.5)",borderRadius:10,padding:14,textAlign:"center",cursor:"pointer",background:SL}}>
                {cMdl.img?<div style={{position:"relative"}}><img src={cMdl.img} alt="preview" style={{width:"100%",height:140,objectFit:"cover",borderRadius:7}}/><button type="button" onClick={e=>{e.preventDefault();setCMdl(p=>({...p,img:null}));}} style={{position:"absolute",top:5,left:5,background:"rgba(139,58,58,.85)",color:"#fff",border:"none",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:11}}>حذف</button></div>:<div style={{color:T}}><div style={{fontSize:28,marginBottom:4}}>📷</div><div style={{fontWeight:600,fontSize:13}}>اضغط لرفع صورة</div></div>}
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>setCMdl(p=>({...p,img:ev.target.result}));r.readAsDataURL(file);}}/>
              </label>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setCMdl(null)}>إلغاء</button>
            <button className="btn bp" onClick={()=>svC(cMdl)}>حفظ</button>
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
            <div style={{gridColumn:"span 2"}}><label className="lbl">السعر (ريال)</label><input className="inp" type="number" value={bMdl.price||""} onChange={e=>setBMdl(p=>({...p,price:e.target.value}))}/></div>
            <div><label className="lbl">الحالة</label><select className="inp" value={bMdl.status||"confirmed"} onChange={e=>setBMdl(p=>({...p,status:e.target.value}))}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
            <div><label className="lbl">ملاحظات</label><input className="inp" value={bMdl.note||""} onChange={e=>setBMdl(p=>({...p,note:e.target.value}))}/></div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setBMdl(null)}>إلغاء</button>
            <button className="btn bp" onClick={()=>svB(bMdl)}>حفظ</button>
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
            <button className="btn bp" onClick={()=>svM(mMdl,mOld)}>حفظ</button>
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
            <button className="btn bp" onClick={async()=>{if(!exMdl.amount||!exMdl.chalet)return;await db("expenses","POST",{chalet:exMdl.chalet,category:exMdl.category,amount:Number(exMdl.amount),note:exMdl.note||"",expense_date:exMdl.expense_date});await loadAll();setExMdl(null);}}>حفظ المصروف</button>
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
                {[{v:"admin",l:"أدمن"},{v:"staff",l:"موظف"},{v:"chalet_manager",l:"مدير شاليه"}].map(r=>(
                  <button key={r.v} className="btn" onClick={()=>setUMdl(p=>({...p,role:r.v}))} style={{flex:1,padding:"9px 0",fontSize:13,background:uMdl.role===r.v?B:SL,color:uMdl.role===r.v?S:B,border:"1.5px solid rgba(197,172,136,.3)"}}>{r.l}</button>
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
            <button className="btn bp" onClick={async()=>{
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
            }}>حفظ</button>
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
            <button className="btn bp" style={{background:"#3D7A5A"}} onClick={async()=>{
              const body={chalet:clTaskMdl.chalet,title:clTaskMdl.title,category:clTaskMdl.category,frequency:clTaskMdl.frequency,assigned_to:clTaskMdl.assigned_to||"",active:true};
              if(clTaskMdl.id)await db("cleaning_tasks","PATCH",body,clTaskMdl.id);
              else await db("cleaning_tasks","POST",body);
              await loadAll();setClTaskMdl(null);
            }}>حفظ</button>
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
            <button className="btn bp" style={{background:"#3D7A5A"}} onClick={async()=>{
              const body={chalet:clExpMdl.chalet,category:clExpMdl.category,amount:Number(clExpMdl.amount),note:clExpMdl.note||"",expense_date:clExpMdl.expense_date||td()};
              if(clExpMdl.id)await db("cleaning_expenses","PATCH",body,clExpMdl.id);
              else await db("cleaning_expenses","POST",body);
              await loadAll();setClExpMdl(null);
            }}>حفظ</button>
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
                <button className="btn bp" style={{background:"#3D7A5A"}} onClick={()=>svCln(ch,amt,nt)}>إضافة</button>
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
            <button className="btn bp" style={{background:"#3D7A5A"}} onClick={async()=>{await db("cleaning","PATCH",{trans_date:clMdl.trans_date,chalet:clMdl.chalet,type:clMdl.type,amount:clMdl.amount,note:clMdl.note},clMdl.id);await loadAll();setClMdl(null);}}>حفظ</button>
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
              {selB.notes&&<div style={{background:"#FEF3C7",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:13,color:"#8B6914"}}>📝 {selB.notes}</div>}
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button className="btn be" style={{flex:1}} onClick={()=>{setBMdl({...selB});setSelB(null);}}>✏️ تعديل</button>
                {(selB.status==="confirmed"||selB.status==="pending")&&<button className="btn" style={{flex:1,background:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",color:"#fff"}} onClick={()=>{setCoMdl(selB);setSelB(null);}}>🚪 تسجيل خروج</button>}
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
            <button className="btn bp" onClick={async()=>{
              await db("chalets","PATCH",{monthly_goal:Number(goalMdl.goal)},goalMdl.id);
              await loadAll();setGoalMdl(null);
            }}>حفظ الهدف</button>
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
            <button className="btn bp" onClick={async()=>{await db("wallet","PATCH",{trans_date:wMdl.trans_date,chalet:wMdl.chalet,type:wMdl.type,amount:wMdl.amount,note:wMdl.note},wMdl.id);await loadAll();setWMdl(null);}}>حفظ</button>
          </div>
        </Mdl>
      )}
      {iMdl&&<InsMdl/>}
      {addRoomMdl&&<AddRoomMdl/>}

    </div>
  );
}

export default AppWrapper;
