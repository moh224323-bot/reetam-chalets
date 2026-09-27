import { useState, useEffect } from "react";
import { Booking } from "../lib/types";

export default function MonthlyChart({bookings,expenses,maint,B,T,SI,SL}:{bookings:Booking[];expenses:any[];maint:any[];B:string;T:string;SI:string;SL:string}) {
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
              {/* أرقام سالبة داخل صفحة RTL تحتاج اتجاه LTR صريح، وإلا تنعكس إشارة السالب بصرياً */}
              <div dir="ltr" style={{fontSize:18,fontWeight:900,color:c,lineHeight:1}}>{v<0?"−":""}{Math.abs(v).toLocaleString()}</div>
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
            <div dir="ltr" style={{fontWeight:900,color:activeData.net>=0?"#4CAF50":"#FF6B6B",fontSize:15}}>{activeData.net<0?"−":""}{Math.abs(activeData.net).toLocaleString()} <span style={{fontSize:11}}>ر</span></div>
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
              <div style={{fontSize:9,color:"#C97B63"}}>{qExp>0&&<><span dir="ltr">{"−"+(qExp>=1000?(qExp/1000).toFixed(1)+"k":qExp)}</span>{" مصاريف"}</>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
