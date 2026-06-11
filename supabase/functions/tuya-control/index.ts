import { useState, useMemo, useEffect } from "react";

const SUPA_URL = "https://kduoasfaqtrotesohqpf.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkdW9hc2ZhcXRyb3Rlc29ocXBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzIwODcsImV4cCI6MjA5NTU0ODA4N30.RTybT1rFOCbWMZ9qkjmk5j0z24RMFWlJSMATMdw8aNw";

/* ─── Tuya API ─── */
const TUYA_ID     = "vyjagcy488sqhcssyefv";
const TUYA_SECRET = "11ef2fe062c04dfdb4a6af02a9bc9d83";
const TUYA_REGION = "eu"; // Middle East uses EU region

// Device ID map: room_id → device_id
const TUYA_DEVICES = {
  16: "bf95a5c9ff7c47bb6derho", // تجربة - شاليه النخيل
};



async function tuyaControl(deviceId, commands) {
  try {
    const res = await fetch(
      "https://kduoasfaqtrotesohqpf.supabase.co/functions/v1/tuya-control",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + SUPA_KEY,
        },
        body: JSON.stringify({ deviceId, commands }),
      }
    );
    const data = await res.json();
    console.log("Tuya response:", data);
    return data?.success || false;
  } catch(e) {
    console.error("Tuya control error:", e);
    return false;
  }
}

async function sendACCommand(roomId, field, value) {
  const deviceId = TUYA_DEVICES[roomId];
  if (!deviceId) return; // لا يوجد جهاز مرتبط
  
  let commands = [];
  if (field === "ac_on")    commands = [{ code: "switch", value }];
  if (field === "ac_temp")  commands = [{ code: "temp_set", value: value * 10 }];
  if (field === "ac_mode")  commands = [{ code: "mode", value }];
  if (field === "ac_speed") commands = [{ code: "fan_speed_enum", value }];
  
  if (commands.length > 0) {
    const ok = await tuyaControl(deviceId, commands);
    console.log(ok ? "✅ Tuya command sent" : "❌ Tuya command failed", field, value);
  }
}

async function db(table, method="GET", body=null, id=null) {
  let url = `${SUPA_URL}/rest/v1/${table}`;
  if (method === "GET") {
    url += "?order=id&select=*";
  } else if (id) {
    url += `?id=eq.${id}`;
  }

  const headers = {
    "apikey": SUPA_KEY,
    "Authorization": `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
  };
  if (method === "POST" || method === "PATCH") {
    headers["Prefer"] = "return=representation";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    const e = await res.text();
    console.error("Supabase error:", method, table, id, e);
    return null;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const S="#C5AC88",B="#413523",BD="#2A2218",SA="#8D9577";
const SD="#6B7258",T="#576D6F",TD="#3E5052",SI="#C8C9CA";
const W="#FFFFFF",OW="#FAF8F5",SL="#F5EFE6";

const STATUS={
  confirmed:{label:"مؤكد", color:T,       bg:"#E8F0F0"},
  pending:  {label:"معلق", color:"#8B6914",bg:"#F5EFD6"},
  cancelled:{label:"ملغي", color:"#8B3A3A",bg:"#F5E6E6"},
  completed:{label:"مكتمل",color:SA,       bg:"#EEF0E9"},
};
const MS={
  open:       {label:"مفتوح",      color:"#8B3A3A",bg:"#F5E6E6"},
  in_progress:{label:"قيد التنفيذ",color:"#8B6914",bg:"#F5EFD6"},
  done:       {label:"منتهي",      color:SD,       bg:"#EEF0E9"},
};

const fd=d=>d?new Date(d).toLocaleDateString("ar-SA"):"-";
const fn=(f,t)=>(!f||!t)?0:Math.max(0,Math.round((new Date(t)-new Date(f))/86400000));
const td=()=>new Date().toISOString().slice(0,10);

const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{overflow-y:auto!important;height:auto!important;min-height:100vh}
  #root{height:auto;overflow:visible}
  input,select,textarea{font-family:'Tajawal',sans-serif}
  ::-webkit-scrollbar{width:6px}
  ::-webkit-scrollbar-thumb{background:${SI};border-radius:3px}
  .card{background:${W};border-radius:16px;box-shadow:0 2px 16px rgba(65,53,35,.08);border:1px solid rgba(197,172,136,.2)}
  .btn{border:none;cursor:pointer;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:700;transition:all .18s;font-size:14px}
  .btn:hover{filter:brightness(.93);transform:translateY(-1px)}
  .bp{background:${B};color:${S};padding:10px 22px}
  .bo{background:transparent;color:${B};padding:10px 20px;border:2px solid ${S}}
  .bd{background:#8B3A3A;color:#fff;padding:7px 14px;font-size:13px}
  .be{background:${SL};color:${B};padding:7px 14px;font-size:13px;border:1px solid ${S}}
  .bsm{padding:5px 12px;font-size:13px}
  .tbl{width:100%;border-collapse:collapse;min-width:520px}
  .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%}
  th{background:${SL};color:${T};font-size:13px;font-weight:700;padding:12px 14px;text-align:right;border-bottom:2px solid rgba(197,172,136,.3);white-space:nowrap}
  td{padding:12px 14px;border-bottom:1px solid rgba(197,172,136,.15);font-size:13px;color:${B}}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:${SL}}
  .bdg{display:inline-block;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap}
  .inp{width:100%;padding:10px 14px;border:1.5px solid rgba(197,172,136,.4);border-radius:10px;font-size:14px;outline:none;transition:border .2s;color:${B};background:${W}}
  .inp:focus{border-color:${T}}
  .lbl{font-size:13px;color:${T};margin-bottom:5px;display:block;font-weight:600}
  .mbg{position:fixed;inset:0;background:rgba(65,53,35,.55);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}
  .mbox{background:${W};border-radius:20px;padding:24px;width:100%;max-width:540px;max-height:92vh;overflow-y:auto}
  .cc{background:${W};border-radius:16px;box-shadow:0 2px 12px rgba(65,53,35,.1);overflow:hidden;transition:transform .2s,box-shadow .2s;border:1px solid rgba(197,172,136,.2)}
  .cc:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(65,53,35,.15)}
  .sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
  .g2{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .cg{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
  .ig{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
  .mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .loading{display:flex;align-items:center;justify-content:center;height:200px;font-size:16px;color:${T}}
  @media(max-width:600px){
    .mbox{padding:16px;border-radius:14px}
    th,td{padding:8px 8px;font-size:12px}
    h2{font-size:18px!important}
  }
`;

function Bdg({bg,color,children}){
  return <span className="bdg" style={{background:bg,color:color}}>{children}</span>;
}
function TH({title}){
  return (
    <div style={{marginBottom:20}}>
      <h2 style={{color:B,fontWeight:800,fontSize:22}}>{title}</h2>
      <div style={{width:50,height:3,background:S,borderRadius:99,marginTop:5}}></div>
    </div>
  );
}
function Mdl({onClose,title,children}){
  return (
    <div className="mbg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mbox">
        <h3 style={{fontWeight:800,color:B,marginBottom:18,fontSize:17}}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
function Logo({size}){
  const s=size||40;
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
function Tbl({heads,rows,footer}){
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

function FinTab({bookings,maintenance,wallet,names}){
  const now=new Date();
  const [period,setPeriod]=useState("this_month");
  const [fch,setFch]=useState("الكل");
  const [cf,setCf]=useState("");
  const [ct,setCt]=useState("");

  function getRange(){
    const y=now.getFullYear(),m=now.getMonth();
    if(period==="this_month")return{from:new Date(y,m,1),to:new Date(y,m+1,0)};
    if(period==="last_month")return{from:new Date(y,m-1,1),to:new Date(y,m,0)};
    if(period==="this_year") return{from:new Date(y,0,1),to:new Date(y,11,31)};
    if(period==="custom")    return{from:cf?new Date(cf):null,to:ct?new Date(ct):null};
    return{from:null,to:null};
  }
  const{from:rf,to:rt}=getRange();
  const inR=d=>{if(!d)return false;const x=new Date(d);if(rf&&x<rf)return false;if(rt&&x>rt)return false;return true;};

  const fb=bookings.filter(b=>b.status!=="cancelled"&&(fch==="الكل"||b.chalet===fch)&&(period==="all"||inR(b.date_from)));
  const fm=maintenance.filter(m=>Number(m.cost)>0&&(fch==="الكل"||m.chalet===fch)&&(period==="all"||inR(m.maint_date)));
  const ft=wallet.filter(t=>(fch==="الكل"||t.chalet===fch)&&(period==="all"||inR(t.trans_date)));

  const bookRev=fb.reduce((s,b)=>s+Number(b.price),0);
  // اضافة الايراد السابق فقط في حالة "كل الوقت" او عند عدم تحديد فلتر شاليه
  const prevRevTotal = period==="all"
    ? (fch==="الكل"
        ? 0  // يتم احتسابه في كل شاليه
        : 0)
    : 0;
  const rev=bookRev+prevRevTotal;
  const mex=fm.reduce((s,m)=>s+Number(m.cost),0);
  const insIn=ft.filter(t=>t.type==="إيداع").reduce((s,t)=>s+t.amount,0);
  const net=rev-mex;
  const nts=fb.reduce((s,b)=>s+fn(b.date_from,b.date_to),0);
  const plab={this_month:"هذا الشهر",last_month:"الشهر الماضي",this_year:"هذا العام",all:"كل الوقت",custom:"مخصص"}[period];

  const csum=names.map(n=>{
    const r=bookings.filter(b=>b.chalet===n&&b.status!=="cancelled"&&(period==="all"||inR(b.date_from))).reduce((s,b)=>s+Number(b.price),0);
    const e=maintenance.filter(m=>m.chalet===n&&Number(m.cost)>0&&(period==="all"||inR(m.maint_date))).reduce((s,m)=>s+Number(m.cost),0);
    return{n,r,e,net:r-e};
  }).filter(c=>c.r>0||c.e>0);

  return (
    <div>
      <TH title="المالية"/>
      <div className="row" style={{marginBottom:12}}>
        <div className="row">
          {[{v:"this_month",l:"هذا الشهر"},{v:"last_month",l:"الشهر الماضي"},{v:"this_year",l:"هذا العام"},{v:"all",l:"كل الوقت"},{v:"custom",l:"مخصص"}].map(p=>(
            <button key={p.v} className="btn" onClick={()=>setPeriod(p.v)} style={{background:period===p.v?B:W,color:period===p.v?S:B,border:"1.5px solid "+(period===p.v?B:"rgba(197,172,136,.4)"),padding:"8px 12px",fontSize:12}}>
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
          {l:"الإيرادات",      v:rev.toLocaleString()+" ر",  i:"💵",bg:"linear-gradient(135deg,"+T+","+TD+")",c:"#fff"},
          {l:"تكاليف الصيانة",v:mex.toLocaleString()+" ر",  i:"🔧",bg:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",c:"#fff"},
          {l:"صافي الربح",    v:net.toLocaleString()+" ر",  i:"📈",bg:net>=0?"linear-gradient(135deg,"+SA+","+SD+")":"linear-gradient(135deg,#8B3A3A,#6B2A2A)",c:"#fff"},
          {l:"إيداعات التأمين",v:insIn.toLocaleString()+" ر",i:"🛡️",bg:"linear-gradient(135deg,"+B+","+BD+")",c:S},
          {l:"عدد الحجوزات",  v:String(fb.length),           i:"📅",bg:W,c:B},
          {l:"ليالي محجوزة",  v:String(nts),                 i:"🌙",bg:W,c:B},
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
              return(
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
          ?<div style={{padding:24,textAlign:"center",color:SI}}>لا توجد حجوزات في هذه الفترة</div>
          :<Tbl heads={["الضيف","الشاليه","الفترة","الليالي","المبلغ","الحالة"]}
            rows={fb.map(b=>(
              <tr key={b.id}>
                <td style={{fontWeight:600}}>{b.guest}</td>
                <td>{b.chalet}</td>
                <td style={{fontSize:12}}>{fd(b.date_from)+" - "+fd(b.date_to)}</td>
                <td style={{textAlign:"center"}}>{fn(b.date_from,b.date_to)}</td>
                <td style={{fontWeight:700,color:T}}>{Number(b.price).toLocaleString()+" ر"}</td>
                <td><Bdg bg={STATUS[b.status].bg} color={STATUS[b.status].color}>{STATUS[b.status].label}</Bdg></td>
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
      {ft.length>0&&(
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>{"🛡️ معاملات التأمين ("+ft.length+")"}</div>
          <Tbl heads={["التاريخ","الشاليه","النوع","المبلغ","ملاحظة"]}
            rows={[...ft].reverse().map((t,i)=>(
              <tr key={i}>
                <td>{fd(t.trans_date)}</td>
                <td style={{fontWeight:600}}>{t.chalet}</td>
                <td><Bdg bg={t.type==="إيداع"?"#EEF0E9":"#F5E6E6"} color={t.type==="إيداع"?SD:"#8B3A3A"}>{t.type}</Bdg></td>
                <td style={{fontWeight:700,color:t.type==="إيداع"?T:"#8B3A3A"}}>{(t.type==="إيداع"?"+":"-")+t.amount.toLocaleString()+" ر"}</td>
                <td style={{color:T,fontSize:12}}>{t.note||"-"}</td>
              </tr>
            ))}
          />
        </div>
      )}
    </div>
  );
}

export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [chalets,setChalets]=useState([]);
  const [bookings,setBookings]=useState([]);
  const [maint,setMaint]=useState([]);
  const [wallet,setWallet]=useState([]);
  const [loading,setLoading]=useState(true);
  const [bMdl,setBMdl]=useState(null);
  const [mMdl,setMMdl]=useState(null);
  const [mOld,setMOld]=useState(null);
  const [cMdl,setCMdl]=useState(null);
  const [iMdl,setIMdl]=useState(false);
  const [fch,setFch]=useState("الكل");
  const [rooms,setRooms]=useState([]);
  const [selChalet,setSelChalet]=useState(null);
  const [addRoomMdl,setAddRoomMdl]=useState(null);

  useEffect(()=>{
    if(typeof document!=="undefined"){
      document.body.style.overflow="auto";
      document.documentElement.style.overflow="auto";
    }
    loadAll();
  },[]);

  async function loadAll(){
    try {
    const [c,b,m,w,sd,rm]=await Promise.all([
      db("chalets"),
      db("bookings"),
      db("maintenance"),
      db("wallet"),
      db("smart_devices"),
      db("rooms"),
    ]);
    // دمج بيانات المكيف مع الشاليهات
    const sdMap={};
    (sd||[]).forEach(d=>{
      if(d.room_id) sdMap["room_"+d.room_id]=d;
      else sdMap[d.chalet]=d;
    });
    setChalets((c||[]).map(ch=>({
      ...ch,
      _acOn:   sdMap[ch.name]?.ac_on   || false,
      _acTemp: sdMap[ch.name]?.ac_temp || 22,
      _acMode: sdMap[ch.name]?.ac_mode || "cool",
      _acSpeed:sdMap[ch.name]?.ac_speed|| "auto",
      _sdId:   sdMap[ch.name]?.id      || null,
    })));
    // دمج بيانات المكيف مع الغرف
    const mergedRooms=(rm||[]).map(r=>({
      ...r,
      _acOn:   sdMap["room_"+r.id]?.ac_on   || false,
      _acTemp: sdMap["room_"+r.id]?.ac_temp || 22,
      _acMode: sdMap["room_"+r.id]?.ac_mode || "cool",
      _acSpeed:sdMap["room_"+r.id]?.ac_speed|| "auto",
      _sdId:   sdMap["room_"+r.id]?.id      || null,
    }));
    setRooms(mergedRooms);
    setBookings(b||[]);
    setMaint(m||[]);
    setWallet(w||[]);
    // rooms set in merge above
    setLoading(false);
    } catch(e) {
      console.error("loadAll error:", e);
      setLoading(false);
    }
  }

  const names=chalets.map(c=>c.name);
  const totRev=useMemo(()=>{
    const bookRev=bookings.filter(b=>b.status!=="cancelled").reduce((s,b)=>s+Number(b.price),0);
    const prevRev=chalets.reduce((s,c)=>s+Number(c.prev_revenue||0),0);
    return bookRev+prevRev;
  },[bookings,chalets]);
  const walletBal=useMemo(()=>wallet.reduce((s,t)=>t.type==="إيداع"?s+t.amount:s-t.amount,0),[wallet]);
  const actB=bookings.filter(b=>b.status==="confirmed"||b.status==="pending").length;
  const opM=maint.filter(m=>m.status==="open").length;
  const mCost=maint.filter(m=>m.cost).reduce((s,m)=>s+Number(m.cost),0);

  const cBal=useMemo(()=>{
    const map={};
    chalets.forEach(c=>{map[c.name]=0;});
    wallet.forEach(t=>{
      if(!Object.prototype.hasOwnProperty.call(map,t.chalet))return;
      if(t.type==="إيداع")map[t.chalet]+=t.amount;
      else map[t.chalet]=Math.max(0,map[t.chalet]-t.amount);
    });
    return map;
  },[wallet,chalets]);

  const cStats=useMemo(()=>chalets.map(c=>({
    ...c,
    rev:   bookings.filter(b=>b.chalet===c.name&&b.status!=="cancelled").reduce((s,b)=>s+Number(b.price),0),
    totalRev: (Number(c.prev_revenue)||0) + bookings.filter(b=>b.chalet===c.name&&b.status!=="cancelled").reduce((s,b)=>s+Number(b.price),0),
    mtot:  maint.filter(m=>m.chalet===c.name).length,
    mop:   maint.filter(m=>m.chalet===c.name&&m.status==="open").length,
    mip:   maint.filter(m=>m.chalet===c.name&&m.status==="in_progress").length,
    mdn:   maint.filter(m=>m.chalet===c.name&&m.status==="done").length,
    ins:   cBal[c.name]||0,
  })),[chalets,bookings,maint,cBal]);

  const eC={name:"",loc:"",cap:"",price:"",wprice:"",ins:"",description:"",st:"active",img:null};
  const eB={chalet:names[0]||"",guest:"",phone:"",date_from:"",date_to:"",price:"",status:"confirmed",note:""};
  const eM={chalet:names[0]||"",issue:"",maint_date:"",priority:"متوسط",status:"open",cost:"",note:"",req:"",image:null};

  async function svC(f){
    const openDate = f.open_date ? f.open_date+"-01" : null;
  const body={name:f.name,loc:f.loc,cap:Number(f.cap),price:Number(f.price),wprice:Number(f.wprice),ins:Number(f.ins),description:f.description,st:f.st,img:f.img||null,open_date:openDate,prev_revenue:Number(f.prev_revenue)||0};
    if(f.id){
      await db("chalets","PATCH",body,f.id);
    } else {
      const res=await db("chalets","POST",body);
      if(res&&Number(f.ins)>0){
        await db("wallet","POST",{trans_date:td(),type:"إيداع",chalet:f.name,cat:"تأمين",amount:Number(f.ins),note:"رصيد افتتاحي"});
      }
    }
    await loadAll();
    setCMdl(null);
  }

  async function dlC(id){
    await db("chalets","DELETE",null,id);
    await loadAll();
  }

  async function svB(f){
    const body={chalet:f.chalet,guest:f.guest,phone:f.phone,date_from:f.date_from,date_to:f.date_to,price:Number(f.price),status:f.status,note:f.note};
    if(f.id) await db("bookings","PATCH",body,f.id);
    else await db("bookings","POST",body);
    await loadAll();
    setBMdl(null);
  }

  async function svM(f,old){
    const cost=Number(f.cost)||0;
    const wasDone=old?.status==="done";
    const isDone=f.status==="done";
    const isNew=!f.id;
    const body={chalet:f.chalet,issue:f.issue,maint_date:f.maint_date,priority:f.priority,status:f.status,cost:cost,note:f.note,req:f.req,image:f.image||null};
    if(f.id) await db("maintenance","PATCH",body,f.id);
    else await db("maintenance","POST",body);
    if(cost>0&&isDone&&(isNew||!wasDone)){
      await db("wallet","POST",{trans_date:f.maint_date||td(),type:"سحب صيانة",chalet:f.chalet,cat:"صيانة",amount:cost,note:f.issue||"صيانة"});
    }
    await loadAll();
    setMMdl(null);
  }

  async function svAC(chalet, field, value, roomId=null){
    if(roomId){
      // حفظ حالة مكيف الغرفة
      const room = rooms.find(r=>r.id===roomId);
      const body = {
        chalet,
        room_id: roomId,
        room_name: room?.name||"",
        ac_on:   field==="ac_on"   ? value : (room?._acOn   || false),
        ac_temp: field==="ac_temp" ? value : (room?._acTemp || 22),
        ac_mode: field==="ac_mode" ? value : (room?._acMode || "cool"),
        ac_speed:field==="ac_speed"? value : (room?._acSpeed|| "auto"),
        updated_at: new Date().toISOString(),
      };
      if(room?._sdId){
        await db("smart_devices","PATCH",body,room._sdId);
      } else {
        const res = await db("smart_devices","POST",body);
        if(res?.[0]){
          setRooms(p=>p.map(x=>x.id===roomId?{...x,_sdId:res[0].id}:x));
        }
      }
      // أرسل الأمر لـ Tuya
      await sendACCommand(roomId, field, value);
    } else {
      // حفظ حالة مكيف الشاليه الكلي (legacy)
      const c = chalets.find(x=>x.name===chalet);
      const body = {
        chalet,
        ac_on:   field==="ac_on"   ? value : (c?._acOn   || false),
        ac_temp: field==="ac_temp" ? value : (c?._acTemp || 22),
        ac_mode: field==="ac_mode" ? value : (c?._acMode || "cool"),
        ac_speed:field==="ac_speed"? value : (c?._acSpeed|| "auto"),
        updated_at: new Date().toISOString(),
      };
      if(c?._sdId){
        await db("smart_devices","PATCH",body,c._sdId);
      } else {
        const res = await db("smart_devices","POST",body);
        if(res?.[0]){
          setChalets(p=>p.map(x=>x.name===chalet?{...x,_sdId:res[0].id}:x));
        }
      }
    }
  }

  async function svI(chalet,amount,note){
    const amt=Number(amount);
    if(!amt||!chalet)return;
    await db("wallet","POST",{trans_date:td(),type:"إيداع",chalet,cat:"تأمين",amount:amt,note:note||"إيداع تأمين"});
    await loadAll();
    setIMdl(false);
  }

  const TABS=[
    {id:"dashboard",l:"الرئيسية", i:"⊞"},
    {id:"chalets",  l:"الشاليهات",i:"🏠"},
    {id:"bookings", l:"الحجوزات", i:"📅"},
    {id:"finance",  l:"المالية",  i:"💰"},
    {id:"maintenance",l:"الصيانة",i:"🔧"},
    {id:"insurance",l:"التأمين",  i:"🛡️"},
    {id:"smart",    l:"التحكم الذكي",i:"🌡️"},
  ];

  function AddRoomMdl(){
    const [rname,setRname]=useState("");
    if(!addRoomMdl) return null;
    return (
      <Mdl onClose={()=>setAddRoomMdl(null)} title={"إضافة غرفة — "+addRoomMdl}>
        <div style={{marginBottom:16}}>
          <label className="lbl">اسم الغرفة</label>
          <input className="inp" value={rname} onChange={e=>setRname(e.target.value)} placeholder="مثال: غرفة 3 أو الصالة أو المسبح"/>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
          {["الصالة","غرفة 1","غرفة 2","غرفة 3","غرفة 4","المسبح","المطبخ"].map(n=>(
            <button key={n} className="btn" onClick={()=>setRname(n)}
              style={{padding:"6px 12px",fontSize:12,background:rname===n?B:SL,color:rname===n?S:B,border:"1.5px solid rgba(197,172,136,.3)"}}>
              {n}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn bo" onClick={()=>setAddRoomMdl(null)}>إلغاء</button>
          <button className="btn bp" onClick={async()=>{
            if(!rname) return;
            await db("rooms","POST",{chalet:addRoomMdl,name:rname});
            await loadAll();
            setAddRoomMdl(null);
          }}>+ إضافة</button>
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

  if(loading){
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

  return (
    <div dir="rtl" style={{fontFamily:"'Tajawal',sans-serif",background:OW,minHeight:"100vh"}}>
      <style>{CSS}</style>

      <header style={{background:"linear-gradient(135deg,"+B+","+BD+")",padding:"0 20px",boxShadow:"0 2px 20px rgba(65,53,35,.4)",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",minHeight:66,flexWrap:"wrap",gap:8,paddingTop:8,paddingBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <Logo size={40}/>
            <div>
              <div style={{color:S,fontWeight:800,fontSize:17,lineHeight:1}}>مجموعة ريتام</div>
              <div style={{color:SI,fontSize:11,marginTop:2}}>نظام إدارة الشاليهات</div>
            </div>
          </div>
          <nav style={{display:"flex",gap:2,flexWrap:"wrap"}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} className="btn" style={{background:tab===t.id?"rgba(197,172,136,.2)":"transparent",color:tab===t.id?S:SI,padding:"7px 10px",fontSize:12,border:"1.5px solid "+(tab===t.id?"rgba(197,172,136,.4)":"transparent")}}>
                {t.i} {t.l}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{maxWidth:1200,margin:"0 auto",padding:"20px 14px",paddingBottom:60}}>

        {tab==="dashboard"&&(
          <div>
            <TH title="لوحة التحكم الرئيسية"/>
            <div className="sg" style={{marginBottom:20}}>
              {[
                {l:"إجمالي الإيرادات",v:totRev.toLocaleString()+" ر",    i:"💵",bg:"linear-gradient(135deg,"+T+","+TD+")",c:"#fff"},
                {l:"محفظة التأمين",   v:walletBal.toLocaleString()+" ر",  i:"🛡️",bg:"linear-gradient(135deg,"+B+","+BD+")",c:S},
                {l:"تكاليف الصيانة", v:mCost.toLocaleString()+" ر",       i:"🔧",bg:"linear-gradient(135deg,"+SA+","+SD+")",c:"#fff"},
                {l:"حجوزات نشطة",    v:String(actB),                       i:"📅",bg:W,c:B},
                {l:"صيانة مفتوحة",   v:String(opM),                        i:"⚠️",bg:W,c:B},
                {l:"عدد الشاليهات",  v:String(chalets.length),             i:"🏠",bg:W,c:B},
              ].map((s,i)=>(
                <div key={i} style={{background:s.bg,borderRadius:12,padding:"16px",boxShadow:"0 4px 14px rgba(65,53,35,.1)",border:s.bg===W?"1px solid rgba(197,172,136,.3)":"none"}}>
                  <div style={{fontSize:20,marginBottom:5}}>{s.i}</div>
                  <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:11,color:s.bg===W?T:"rgba(255,255,255,.8)",marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>
            {/* قسم الحجوزات القادمة */}
            {(()=>{
              const today=new Date(); today.setHours(0,0,0,0);
              const upcoming=bookings
                .filter(b=>b.status!=="cancelled"&&b.status!=="completed")
                .map(b=>({...b,daysLeft:Math.ceil((new Date(b.date_from)-today)/86400000)}))
                .filter(b=>b.daysLeft>=-1)
                .sort((a,b)=>a.daysLeft-b.daysLeft)
                .slice(0,8);
              if(!upcoming.length) return null;
              return (
                <div className="card" style={{overflow:"hidden",marginBottom:16}}>
                  <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>
                    🔔 الحجوزات القادمة
                  </div>
                  <div style={{padding:"8px 0"}}>
                    {upcoming.map((b,i)=>{
                      const isToday=b.daysLeft===0;
                      const isTomorrow=b.daysLeft===1;
                      const isCheckin=b.daysLeft<0;
                      const urgColor=isCheckin?"#8B6914":isToday?"#8B3A3A":isTomorrow?"#8B6914":b.daysLeft<=3?SD:T;
                      const urgBg=isCheckin?"#F5EFD6":isToday?"#F5E6E6":isTomorrow?"#FEF3C7":b.daysLeft<=3?"#EEF0E9":SL;
                      const urgLabel=isCheckin?"داخل الآن":isToday?"اليوم":isTomorrow?"غداً":b.daysLeft+" يوم";
                      return (
                        <div key={b.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:i<upcoming.length-1?"1px solid rgba(197,172,136,.1)":"none",background:isToday?"rgba(139,58,58,.04)":"transparent"}}>
                          <div style={{background:urgBg,color:urgColor,borderRadius:10,padding:"6px 10px",minWidth:70,textAlign:"center",fontWeight:800,fontSize:13,flexShrink:0}}>
                            {urgLabel}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,color:B,fontSize:14}}>{b.guest}</div>
                            <div style={{fontSize:12,color:T,marginTop:1}}>{b.chalet} · {fd(b.date_from)} ← {fd(b.date_to)}</div>
                          </div>
                          <div style={{textAlign:"left",flexShrink:0}}>
                            <div style={{fontWeight:700,color:T,fontSize:13}}>{Number(b.price).toLocaleString()+" ر"}</div>
                            <div style={{fontSize:11,color:SI}}>{fn(b.date_from,b.date_to)+" ليلة"}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="g2">
              <div className="card" style={{overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>🏠 أداء الشاليهات</div>
                <Tbl heads={["الشاليه","الإيرادات","التأمين","صيانة"]}
                  rows={cStats.map((c,i)=>(
                    <tr key={i}>
                      <td style={{fontWeight:600}}>{c.name}</td>
                      <td style={{color:T,fontWeight:700}}>{c.rev.toLocaleString()}</td>
                      <td style={{color:B,fontWeight:700}}>{c.ins.toLocaleString()}</td>
                      <td><Bdg bg={c.mop>0?"#F5E6E6":"#EEF0E9"} color={c.mop>0?"#8B3A3A":SD}>{String(c.mtot)}</Bdg></td>
                    </tr>
                  ))}
                />
              </div>
              <div className="card" style={{overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>📅 آخر الحجوزات</div>
                <Tbl heads={["الضيف","الشاليه","الوصول","الحالة"]}
                  rows={bookings.slice(-4).reverse().map(b=>(
                    <tr key={b.id}>
                      <td style={{fontWeight:600}}>{b.guest}</td>
                      <td style={{fontSize:12}}>{b.chalet}</td>
                      <td style={{fontSize:12}}>{fd(b.date_from)}</td>
                      <td><Bdg bg={STATUS[b.status]?.bg||"#eee"} color={STATUS[b.status]?.color||"#333"}>{STATUS[b.status]?.label||b.status}</Bdg></td>
                    </tr>
                  ))}
                />
              </div>
            </div>
          </div>
        )}

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
                    {c.img
                      ?<img src={c.img} alt={c.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:40,opacity:.25}}>🏠</span></div>
                    }
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(42,34,24,.9))",padding:"18px 14px 10px"}}>
                      <div style={{color:S,fontWeight:800,fontSize:15}}>{c.name}</div>
                      <div style={{color:SI,fontSize:11,marginTop:2}}>{"📍 "+c.loc+(c.open_date?" · افتتح: "+c.open_date.slice(0,7):"")}</div>
                    </div>
                    <div style={{position:"absolute",top:8,left:8}}><Bdg bg={c.st==="active"?"rgba(141,149,119,.85)":"rgba(139,58,58,.85)"} color="#fff">{c.st==="active"?"نشط":"موقف"}</Bdg></div>
                    <label style={{position:"absolute",top:8,right:8,background:"rgba(42,34,24,.7)",borderRadius:7,padding:"4px 8px",cursor:"pointer",color:S,fontSize:11,fontWeight:600}}>
                      📷 تغيير
                      <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                        const file=e.target.files[0];if(!file)return;
                        const r=new FileReader();r.onload=ev=>setChalets(p=>p.map(x=>x.id===c.id?{...x,img:ev.target.result}:x));r.readAsDataURL(file);
                      }}/>
                    </label>
                  </div>
                  <div style={{padding:"14px 16px"}}>
                    <p style={{color:T,fontSize:12,marginBottom:12}}>{c.description||"—"}</p>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:12}}>
                      {[
                        {l:"السعة",          v:c.cap+" شخص",                    i:"👥"},
                        {l:"سعر عادي",       v:c.price+" ريال",                 i:"🌙"},
                        {l:"سعر ويكند",      v:(c.wprice||"-")+(c.wprice?" ريال":""),i:"🎉"},
                        {l:"إيرادات النظام", v:c.rev.toLocaleString()+" ر",     i:"📈"},
                        {l:"إجمالي الإيرادات",v:c.totalRev.toLocaleString()+" ر",i:"💰"},
                        {l:"التأمين",        v:c.ins.toLocaleString()+" ر",     i:"🛡️"},
                      ].map((item,i)=>(
                        <div key={i} style={{background:item.i==="🎉"?"rgba(87,109,111,.1)":SL,borderRadius:8,padding:"7px 9px",border:"1px solid rgba(197,172,136,.2)"}}>
                          <div style={{fontSize:10,color:T}}>{item.i+" "+item.l}</div>
                          <div style={{fontWeight:700,color:item.i==="🎉"?T:B,fontSize:12,marginTop:2}}>{item.v}</div>
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
                    <div style={{display:"flex",gap:7}}>
                      <button className="btn be" style={{flex:1,padding:"8px",fontSize:13}} onClick={()=>setCMdl({...c,open_date:c.open_date?c.open_date.slice(0,7):""})}>✏️ تعديل</button>
                      <button className="btn bd bsm" style={{padding:"8px 12px"}} onClick={()=>dlC(c.id)}>🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab==="bookings"&&(
          <div>
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
              <Tbl heads={["الضيف","الهاتف","الشاليه","من","إلى","ليالي","السعر","الحالة","إجراءات"]}
                rows={bookings.filter(b=>fch==="الكل"||b.chalet===fch).map(b=>(
                  <tr key={b.id}>
                    <td style={{fontWeight:700}}>{b.guest}</td>
                    <td style={{direction:"ltr",textAlign:"right",color:T}}>{b.phone}</td>
                    <td>{b.chalet}</td>
                    <td>{fd(b.date_from)}</td>
                    <td>{fd(b.date_to)}</td>
                    <td style={{textAlign:"center"}}>{fn(b.date_from,b.date_to)}</td>
                    <td style={{fontWeight:700,color:T}}>{Number(b.price).toLocaleString()+" ر"}</td>
                    <td><Bdg bg={STATUS[b.status]?.bg||"#eee"} color={STATUS[b.status]?.color||"#333"}>{STATUS[b.status]?.label||b.status}</Bdg></td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="btn be bsm" onClick={()=>setBMdl({...b})}>تعديل</button>
                        <button className="btn bd bsm" onClick={async()=>{await db("bookings","DELETE",null,b.id);await loadAll();}}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              />
            </div>
          </div>
        )}

        {tab==="finance"&&(
          <FinTab bookings={bookings} maintenance={maint} wallet={wallet} names={names}/>
        )}

        {tab==="maintenance"&&(
          <div>
            <div className="sg" style={{marginBottom:18}}>
              {[
                {l:"مفتوح",          cnt:maint.filter(m=>m.status==="open").length,        bg:"#F5E6E6",c:"#8B3A3A",i:"🔴"},
                {l:"قيد التنفيذ",    cnt:maint.filter(m=>m.status==="in_progress").length,  bg:"#F5EFD6",c:"#8B6914",i:"🟡"},
                {l:"منتهي",          cnt:maint.filter(m=>m.status==="done").length,         bg:"#EEF0E9",c:SD,       i:"🟢"},
                {l:"إجمالي التكاليف",cnt:mCost.toLocaleString()+" ر",                      bg:SL,       c:B,        i:"💰"},
              ].map((s,i)=>(
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
                rows={maint.filter(m=>fch==="الكل"||m.chalet===fch).map(m=>(
                  <tr key={m.id}>
                    <td style={{fontWeight:600}}>{m.chalet}</td>
                    <td>{m.issue}</td>
                    <td style={{fontSize:12,color:T}}>{m.req||"-"}</td>
                    <td>{fd(m.maint_date)}</td>
                    <td><Bdg bg={m.priority==="عالي"?"#F5E6E6":m.priority==="متوسط"?"#F5EFD6":"#EEF0E9"} color={m.priority==="عالي"?"#8B3A3A":m.priority==="متوسط"?"#8B6914":SD}>{m.priority}</Bdg></td>
                    <td><Bdg bg={MS[m.status]?.bg||"#eee"} color={MS[m.status]?.color||"#333"}>{MS[m.status]?.label||m.status}</Bdg></td>
                    <td style={{fontWeight:700,color:m.cost?T:SI}}>{m.cost?Number(m.cost).toLocaleString()+" ر":"-"}</td>
                    <td>
                      {m.image
                        ? <img src={m.image} alt="صورة" onClick={()=>window.open(m.image,"_blank")}
                            style={{width:40,height:40,objectFit:"cover",borderRadius:6,cursor:"pointer",border:"1px solid rgba(197,172,136,.3)"}}/>
                        : <span style={{color:SI,fontSize:12}}>-</span>
                      }
                    </td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="btn be bsm" onClick={()=>{setMOld({...m});setMMdl({...m});}}>تعديل</button>
                        <button className="btn bd bsm" onClick={async()=>{await db("maintenance","DELETE",null,m.id);await loadAll();}}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              />
            </div>
          </div>
        )}

        {tab==="insurance"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
              <div>
                <TH title="محفظة التأمين"/>
                <p style={{color:T,fontSize:13}}>يزيد بإضافة تأمين ويُخصم تلقائياً عند إغلاق طلبات الصيانة</p>
              </div>
              <button className="btn bp" onClick={()=>setIMdl(true)}>+ إضافة تأمين</button>
            </div>
            <div style={{background:"linear-gradient(135deg,"+B+","+BD+")",borderRadius:18,padding:"24px 28px",marginBottom:22,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 8px 32px rgba(65,53,35,.3)",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{color:SI,fontSize:13,marginBottom:3}}>إجمالي محفظة التأمين — مجموعة ريتام</div>
                <div style={{color:S,fontSize:36,fontWeight:800}}>{walletBal.toLocaleString()+" ريال"}</div>
                <div style={{color:SI,fontSize:12,marginTop:6}}>
                  {"إيداعات: "+wallet.filter(t=>t.type==="إيداع").reduce((s,t)=>s+t.amount,0).toLocaleString()+" ر"}
                  {" | صرف: "+wallet.filter(t=>t.type!=="إيداع").reduce((s,t)=>s+t.amount,0).toLocaleString()+" ر"}
                </div>
              </div>
              <Logo size={55}/>
            </div>
            <div className="ig" style={{marginBottom:22}}>
              {cStats.map(c=>(
                <div key={c.id} style={{background:W,borderRadius:12,padding:16,boxShadow:"0 2px 10px rgba(65,53,35,.08)",borderTop:"4px solid "+(c.ins<500?"#8B3A3A":c.ins<1000?SA:T)}}>
                  <div style={{fontWeight:700,color:B,fontSize:14,marginBottom:3}}>{c.name}</div>
                  <div style={{fontSize:11,color:T,marginBottom:8}}>{"📍 "+c.loc}</div>
                  <div style={{fontSize:24,fontWeight:800,color:c.ins<500?"#8B3A3A":T,marginBottom:7}}>{c.ins.toLocaleString()+" ر"}</div>
                  <div style={{background:SL,borderRadius:99,height:5,marginBottom:7,overflow:"hidden"}}>
                    <div style={{width:Math.min(100,(c.ins/(c.ins||1))*100)+"%",height:"100%",background:c.ins<500?"#8B3A3A":c.ins<1000?SA:T,borderRadius:99}}></div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T}}>
                    <span>{"طلبات: "+c.mtot}</span>
                    <Bdg bg={c.ins<500?"#F5E6E6":SL} color={c.ins<500?"#8B3A3A":B}>{c.ins<500?"منخفض":"جيد"}</Bdg>
                  </div>
                </div>
              ))}
            </div>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"2px solid rgba(197,172,136,.2)",fontWeight:700,color:B,fontSize:14,background:SL}}>سجل معاملات التأمين</div>
              <Tbl heads={["التاريخ","الشاليه","النوع","المبلغ","ملاحظة"]}
                rows={[...wallet].reverse().map((t,i)=>(
                  <tr key={i}>
                    <td>{fd(t.trans_date)}</td>
                    <td style={{fontWeight:600}}>{t.chalet}</td>
                    <td><Bdg bg={t.type==="إيداع"?"#EEF0E9":"#F5E6E6"} color={t.type==="إيداع"?SD:"#8B3A3A"}>{t.type}</Bdg></td>
                    <td style={{fontWeight:700,color:t.type==="إيداع"?T:"#8B3A3A"}}>{(t.type==="إيداع"?"+":"-")+t.amount.toLocaleString()+" ر"}</td>
                    <td style={{color:T,fontSize:12}}>{t.note||"-"}</td>
                  </tr>
                ))}
              />
            </div>
          </div>
        )}

      {tab==="smart"&&(
        <div>
          <div style={{marginBottom:20}}>
            <h2 style={{color:B,fontWeight:800,fontSize:22,marginBottom:6}}>🌡️ التحكم الذكي</h2>
            <div style={{width:50,height:3,background:S,borderRadius:99,marginBottom:16}}></div>
          </div>
          {/* اختيار شاليه */}
          {!selChalet ? (
            <div>
              <p style={{color:T,fontSize:14,marginBottom:16}}>اختر شاليهاً للتحكم بمكيفاته</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:14}}>
                {chalets.map(c=>{
                  const chRooms=rooms.filter(r=>r.chalet===c.name);
                  const chDevices=rooms.filter(r=>r.chalet===c.name).map(r=>{
                    return {room:r,device:null};
                  });
                  return (
                    <div key={c.id} className="card" style={{overflow:"hidden",cursor:"pointer"}} onClick={()=>setSelChalet(c)}>
                      <div style={{background:"linear-gradient(135deg,"+B+","+BD+")",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{color:S,fontWeight:800,fontSize:15}}>{c.name}</div>
                          <div style={{color:SI,fontSize:11,marginTop:2}}>{"📍 "+c.loc}</div>
                        </div>
                        <div style={{color:S,fontSize:24}}>🏠</div>
                      </div>
                      <div style={{padding:"14px 18px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                          <span style={{fontSize:13,color:T}}>{chRooms.length+" غرفة · "+chRooms.length+" مكيف"}</span>
                          <span style={{fontSize:11,background:SL,color:B,padding:"3px 10px",borderRadius:20,fontWeight:600}}>اضغط للتحكم</span>
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {chRooms.map(r=>(
                            <span key={r.id} style={{fontSize:11,background:SL,color:T,padding:"3px 10px",borderRadius:20,border:"1px solid rgba(197,172,136,.3)"}}>
                              {r.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              {/* هيدر الشاليه المختار */}
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
                <button className="btn" onClick={()=>setSelChalet(null)}
                  style={{background:SL,color:B,padding:"8px 16px",border:"1.5px solid rgba(197,172,136,.4)",fontSize:13}}>
                  ← رجوع
                </button>
                <div>
                  <div style={{color:B,fontWeight:800,fontSize:18}}>{selChalet.name}</div>
                  <div style={{color:T,fontSize:12}}>{"📍 "+selChalet.loc}</div>
                </div>
                <div style={{marginRight:"auto",display:"flex",gap:8}}>
                  <button className="btn" style={{background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",padding:"8px 16px",fontSize:13}}
                    onClick={async()=>{
                      const chRooms=rooms.filter(r=>r.chalet===selChalet.name);
                      setChalets(p=>p.map(c=>c.id===selChalet.id?{...c,_acOn:true}:c));
                      for(const r of chRooms){ await svAC(selChalet.name,"ac_on",true,r.id); }
                    }}>▶ تشغيل الكل</button>
                  <button className="btn" style={{background:SL,color:B,padding:"8px 16px",fontSize:13,border:"1.5px solid rgba(197,172,136,.4)"}}
                    onClick={async()=>{
                      const chRooms=rooms.filter(r=>r.chalet===selChalet.name);
                      setChalets(p=>p.map(c=>c.id===selChalet.id?{...c,_acOn:false}:c));
                      for(const r of chRooms){ await svAC(selChalet.name,"ac_on",false,r.id); }
                    }}>⏹ إيقاف الكل</button>
                  <button className="btn" style={{background:S,color:B,padding:"8px 16px",fontSize:13}}
                    onClick={()=>setAddRoomMdl(selChalet.name)}>+ إضافة غرفة</button>
                </div>
              </div>

              {/* غرف الشاليه */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
                {rooms.filter(r=>r.chalet===selChalet.name).map(room=>{
                  const dev=room;
                  const isOn=dev._acOn||false;
                  const temp=dev._acTemp||22;
                  const mode=dev._acMode||"cool";
                  const speed=dev._acSpeed||"auto";
                  return (
                    <div key={room.id} className="card" style={{overflow:"hidden"}}>
                      <div style={{background:isOn?"linear-gradient(135deg,#0f7b5f,#0a5c47)":"linear-gradient(135deg,"+B+","+BD+")",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"background .3s"}}>
                        <div>
                          <div style={{color:S,fontWeight:800,fontSize:15}}>{"🏠 "+room.name}</div>
                          <div style={{color:SI,fontSize:11,marginTop:2}}>{selChalet.name}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          {isOn&&<div style={{width:8,height:8,borderRadius:"50%",background:"#10b981"}}></div>}
                          <div style={{background:isOn?"rgba(16,185,129,.2)":"rgba(200,201,202,.15)",color:isOn?"#10b981":SI,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>
                            {isOn?"شغّال":"مطفي"}
                          </div>
                        </div>
                      </div>
                      <div style={{padding:"16px"}}>
                        {/* درجة الحرارة */}
                        <div style={{textAlign:"center",marginBottom:14}}>
                          <div style={{fontSize:11,color:T,marginBottom:6,fontWeight:600}}>درجة الحرارة</div>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
                            <button className="btn" disabled={!isOn}
                              onClick={async()=>{
                                const t=Math.max(16,temp-1);
                                setRooms(p=>p.map(x=>x.id===room.id?{...x,_acTemp:t}:x));
                                await svAC(selChalet.name,"ac_temp",t,room.id);
                              }}
                              style={{width:32,height:32,borderRadius:9,background:SL,color:B,fontSize:16,border:"1.5px solid rgba(197,172,136,.3)",opacity:isOn?1:.4}}>−</button>
                            <div style={{fontSize:38,fontWeight:800,color:isOn?(temp<=18?"#3b82f6":temp>=28?"#ef4444":B):SI,minWidth:65,textAlign:"center"}}>
                              {temp}°
                            </div>
                            <button className="btn" disabled={!isOn}
                              onClick={async()=>{
                                const t=Math.min(30,temp+1);
                                setRooms(p=>p.map(x=>x.id===room.id?{...x,_acTemp:t}:x));
                                await svAC(selChalet.name,"ac_temp",t,room.id);
                              }}
                              style={{width:32,height:32,borderRadius:9,background:SL,color:B,fontSize:16,border:"1.5px solid rgba(197,172,136,.3)",opacity:isOn?1:.4}}>+</button>
                          </div>
                          <div style={{margin:"8px auto",maxWidth:160,background:"#f1f5f9",borderRadius:99,height:4,overflow:"hidden"}}>
                            <div style={{width:((temp-16)/(30-16)*100)+"%",height:"100%",background:temp<=18?"#3b82f6":"linear-gradient(90deg,#3b82f6,#10b981,#ef4444)",borderRadius:99}}></div>
                          </div>
                        </div>
                        {/* الوضع */}
                        <div style={{marginBottom:12}}>
                          <div style={{fontSize:11,color:T,marginBottom:6,fontWeight:600}}>الوضع</div>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                            {[{id:"cool",l:"❄️ تبريد"},{id:"heat",l:"🔥 تدفئة"},{id:"fan",l:"💨 هواء"},{id:"auto",l:"🔄 تلقائي"}].map(m=>(
                              <button key={m.id} className="btn" disabled={!isOn}
                                onClick={async()=>{
                                  setRooms(p=>p.map(x=>x.id===room.id?{...x,_acMode:m.id}:x));
                                  await svAC(selChalet.name,"ac_mode",m.id,room.id);
                                }}
                                style={{padding:"5px 10px",fontSize:11,background:mode===m.id&&isOn?B:SL,color:mode===m.id&&isOn?S:B,border:"1.5px solid rgba(197,172,136,.3)",opacity:isOn?1:.5}}>
                                {m.l}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* سرعة */}
                        <div style={{marginBottom:14}}>
                          <div style={{fontSize:11,color:T,marginBottom:6,fontWeight:600}}>سرعة المروحة</div>
                          <div style={{display:"flex",gap:4}}>
                            {[{id:"auto",l:"تلقائي"},{id:"low",l:"بطيء"},{id:"med",l:"متوسط"},{id:"high",l:"سريع"}].map(sp=>(
                              <button key={sp.id} className="btn" disabled={!isOn}
                                onClick={async()=>{
                                  setRooms(p=>p.map(x=>x.id===room.id?{...x,_acSpeed:sp.id}:x));
                                  await svAC(selChalet.name,"ac_speed",sp.id,room.id);
                                }}
                                style={{flex:1,padding:"5px 0",fontSize:11,background:speed===sp.id&&isOn?B:SL,color:speed===sp.id&&isOn?S:B,border:"1.5px solid rgba(197,172,136,.3)",opacity:isOn?1:.5}}>
                                {sp.l}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* تشغيل */}
                        <div style={{display:"flex",gap:8}}>
                          <button className="btn" style={{flex:1,padding:"11px",fontSize:14,background:isOn?"linear-gradient(135deg,#ef4444,#dc2626)":"linear-gradient(135deg,#10b981,#059669)",color:"#fff",boxShadow:isOn?"0 4px 14px rgba(239,68,68,.3)":"0 4px 14px rgba(16,185,129,.3)"}}
                            onClick={async()=>{
                              const newOn=!isOn;
                              setRooms(p=>p.map(x=>x.id===room.id?{...x,_acOn:newOn}:x));
                              await svAC(selChalet.name,"ac_on",newOn,room.id);
                            }}>
                            {isOn?"⏸ إيقاف":"▶ تشغيل"}
                          </button>
                          <button className="btn" style={{padding:"11px 14px",background:"#F5E6E6",color:"#8B3A3A",fontSize:13}}
                            onClick={async()=>{
                              if(!window.confirm("حذف غرفة "+room.name+"؟")) return;
                              await db("rooms","DELETE",null,room.id);
                              await loadAll();
                            }}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ملخص سريع */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:20}}>
            {[
              {l:"أجهزة متصلة",   v:String(chalets.length), i:"📡",bg:"linear-gradient(135deg,"+T+",#3E5052)",c:"#fff"},
              {l:"مكيفات شغّالة", v:String(chalets.filter(c=>c._acOn).length||0),i:"❄️",bg:"linear-gradient(135deg,#3b82f6,#2563eb)",c:"#fff"},
              {l:"مجدولة اليوم",  v:"0",                    i:"⏰",bg:"linear-gradient(135deg,"+SA+","+SD+")",c:"#fff"},
              {l:"درجة متوسطة",   v:"22°",                  i:"🌡️",bg:W,c:B},
            ].map((s,i)=>(
              <div key={i} style={{background:s.bg,borderRadius:12,padding:"16px",boxShadow:"0 4px 14px rgba(65,53,35,.1)",border:s.bg===W?"1px solid rgba(197,172,136,.3)":"none"}}>
                <div style={{fontSize:20,marginBottom:5}}>{s.i}</div>
                <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div>
                <div style={{fontSize:11,color:s.bg===W?T:"rgba(255,255,255,.8)",marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>


        </div>
      )}

      </main>

      {cMdl&&(
        <Mdl onClose={()=>setCMdl(null)} title={cMdl.id?"تعديل الشاليه":"إضافة شاليه جديد"}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"span 2"}}><label className="lbl">اسم الشاليه</label><input className="inp" value={cMdl.name} onChange={e=>setCMdl(p=>({...p,name:e.target.value}))} placeholder="مثال: شاليه الياسمين"/></div>
            <div><label className="lbl">الموقع</label><input className="inp" value={cMdl.loc||""} onChange={e=>setCMdl(p=>({...p,loc:e.target.value}))} placeholder="مثال: الرياض"/></div>
            <div><label className="lbl">السعة</label><input className="inp" type="number" value={cMdl.cap||""} onChange={e=>setCMdl(p=>({...p,cap:e.target.value}))} placeholder="10"/></div>
            <div><label className="lbl">سعر الليلة العادية</label><input className="inp" type="number" value={cMdl.price||""} onChange={e=>setCMdl(p=>({...p,price:e.target.value}))} placeholder="500"/></div>
            <div><label className="lbl">سعر الويكند 🎉</label><input className="inp" type="number" value={cMdl.wprice||""} onChange={e=>setCMdl(p=>({...p,wprice:e.target.value}))} placeholder="800"/></div>
            <div><label className="lbl">رصيد التأمين الافتتاحي</label><input className="inp" type="number" value={cMdl.ins||""} onChange={e=>setCMdl(p=>({...p,ins:e.target.value}))} placeholder="2000"/></div>
            <div><label className="lbl">الحالة</label>
              <select className="inp" value={cMdl.st||"active"} onChange={e=>setCMdl(p=>({...p,st:e.target.value}))}>
                <option value="active">نشط</option>
                <option value="inactive">موقف</option>
              </select>
            </div>
            <div><label className="lbl">تاريخ الافتتاح</label><input className="inp" type="month" value={cMdl.open_date||""} onChange={e=>setCMdl(p=>({...p,open_date:e.target.value}))}/></div>
            <div><label className="lbl">الإيراد السابق (ريال) 📊</label><input className="inp" type="number" value={cMdl.prev_revenue||""} onChange={e=>setCMdl(p=>({...p,prev_revenue:e.target.value}))} placeholder="مجموع الأرباح قبل النظام"/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">الوصف</label><textarea className="inp" rows={2} value={cMdl.description||""} onChange={e=>setCMdl(p=>({...p,description:e.target.value}))} placeholder="وصف مختصر..."/></div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">صورة الشاليه</label>
              <label style={{display:"block",border:"2px dashed rgba(197,172,136,.5)",borderRadius:10,padding:14,textAlign:"center",cursor:"pointer",background:SL}}>
                {cMdl.img
                  ?<div style={{position:"relative"}}><img src={cMdl.img} alt="preview" style={{width:"100%",height:140,objectFit:"cover",borderRadius:7}}/><button type="button" onClick={e=>{e.preventDefault();setCMdl(p=>({...p,img:null}));}} style={{position:"absolute",top:5,left:5,background:"rgba(139,58,58,.85)",color:"#fff",border:"none",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:11}}>حذف</button></div>
                  :<div style={{color:T}}><div style={{fontSize:28,marginBottom:4}}>📷</div><div style={{fontWeight:600,fontSize:13}}>اضغط لرفع صورة</div></div>
                }
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                  const file=e.target.files[0];if(!file)return;
                  const r=new FileReader();r.onload=ev=>setCMdl(p=>({...p,img:ev.target.result}));r.readAsDataURL(file);
                }}/>
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
            <div><label className="lbl">الشاليه</label>
              <select className="inp" value={bMdl.chalet||""} onChange={e=>setBMdl(p=>({...p,chalet:e.target.value}))}>
                {names.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="lbl">تاريخ الوصول</label><input className="inp" type="date" value={bMdl.date_from||""} onChange={e=>setBMdl(p=>({...p,date_from:e.target.value}))}/></div>
            <div><label className="lbl">تاريخ المغادرة</label><input className="inp" type="date" value={bMdl.date_to||""} onChange={e=>setBMdl(p=>({...p,date_to:e.target.value}))}/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">السعر (ريال)</label><input className="inp" type="number" value={bMdl.price||""} onChange={e=>setBMdl(p=>({...p,price:e.target.value}))}/></div>
            <div><label className="lbl">الحالة</label>
              <select className="inp" value={bMdl.status||"confirmed"} onChange={e=>setBMdl(p=>({...p,status:e.target.value}))}>
                {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
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
          {mMdl.status==="done"&&Number(mMdl.cost)>0&&(
            <div style={{background:SL,borderRadius:9,padding:"9px 13px",marginBottom:14,fontSize:13,color:T,fontWeight:600,border:"1px solid "+S}}>
              {"سيُخصم "+Number(mMdl.cost).toLocaleString()+" ريال من محفظة التأمين تلقائياً"}
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label className="lbl">الشاليه</label>
              <select className="inp" value={mMdl.chalet||""} onChange={e=>setMMdl(p=>({...p,chalet:e.target.value}))}>
                {names.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="lbl">التاريخ</label><input className="inp" type="date" value={mMdl.maint_date||""} onChange={e=>setMMdl(p=>({...p,maint_date:e.target.value}))}/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">وصف المشكلة</label><input className="inp" value={mMdl.issue||""} onChange={e=>setMMdl(p=>({...p,issue:e.target.value}))} placeholder="اوصف المشكلة..."/></div>
            <div><label className="lbl">مقدم الطلب</label><input className="inp" value={mMdl.req||""} onChange={e=>setMMdl(p=>({...p,req:e.target.value}))} placeholder="الاسم..."/></div>
            <div><label className="lbl">الأولوية</label>
              <select className="inp" value={mMdl.priority||"متوسط"} onChange={e=>setMMdl(p=>({...p,priority:e.target.value}))}>
                <option value="منخفض">منخفض</option>
                <option value="متوسط">متوسط</option>
                <option value="عالي">عالي</option>
              </select>
            </div>
            <div><label className="lbl">الحالة</label>
              <select className="inp" value={mMdl.status||"open"} onChange={e=>setMMdl(p=>({...p,status:e.target.value}))}>
                {Object.entries(MS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label className="lbl">التكلفة (ريال)</label><input className="inp" type="number" value={mMdl.cost||""} onChange={e=>setMMdl(p=>({...p,cost:e.target.value}))} placeholder="0"/></div>
            <div style={{gridColumn:"span 2"}}><label className="lbl">ملاحظات</label><textarea className="inp" rows={2} value={mMdl.note||""} onChange={e=>setMMdl(p=>({...p,note:e.target.value}))}/></div>
            <div style={{gridColumn:"span 2"}}>
              <label className="lbl">صورة المشكلة 📷</label>
              <label style={{display:"block",border:"2px dashed rgba(197,172,136,.5)",borderRadius:10,padding:14,textAlign:"center",cursor:"pointer",background:SL}}>
                {mMdl.image
                  ? <div style={{position:"relative"}}>
                      <img src={mMdl.image} alt="preview" style={{width:"100%",height:160,objectFit:"cover",borderRadius:8}}/>
                      <button type="button" onClick={e=>{e.preventDefault();setMMdl(p=>({...p,image:null}));}}
                        style={{position:"absolute",top:5,left:5,background:"rgba(139,58,58,.85)",color:"#fff",border:"none",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:11}}>
                        حذف
                      </button>
                    </div>
                  : <div style={{color:T}}>
                      <div style={{fontSize:28,marginBottom:4}}>📷</div>
                      <div style={{fontWeight:600,fontSize:13}}>اضغط لرفع صورة المشكلة</div>
                      <div style={{fontSize:11,color:SI,marginTop:3}}>JPG, PNG, WEBP</div>
                    </div>
                }
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                  const file=e.target.files[0];if(!file)return;
                  const r=new FileReader();
                  r.onload=ev=>setMMdl(p=>({...p,image:ev.target.result}));
                  r.readAsDataURL(file);
                }}/>
              </label>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
            <button className="btn bo" onClick={()=>setMMdl(null)}>إلغاء</button>
            <button className="btn bp" onClick={()=>svM(mMdl,mOld)}>حفظ</button>
          </div>
        </Mdl>
      )}

      {iMdl&&<InsMdl/>}
      {addRoomMdl&&<AddRoomMdl/>}
    </div>
  );
}