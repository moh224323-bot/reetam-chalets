import { useState } from "react";
import { Booking } from "../lib/types";

export default function MonthlyChart({bookings,expenses,maint,B,T,SI,SL}:{bookings:Booking[];expenses:any[];maint:any[];B:string;T:string;SI:string;SL:string}) {
  const [hovered,setHovered]=useState<number|null>(null);
  const [selected,setSelected]=useState<number|null>(null);

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
  const maxV=Math.max(...monthlyData.map(d=>Math.max(d.rev,d.exp)),1);
  const fmt=(v:number)=>(v<0?"−":"")+Math.abs(Math.round(v)).toLocaleString("en-US");
  const k=(v:number)=>v>=1000?(v/1000).toFixed(v>=10000?0:1)+"k":String(Math.round(v));
  const show=activeData??monthlyData[curMonth];
  const showIdx=active??curMonth;

  return (
    <div className="x-card">
      <div className="x-card-h">
        <h2><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>{"الإيرادات والمصاريف · "+currentYear}</h2>
        <div style={{display:"flex",gap:14,fontSize:13,color:"var(--text2)"}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:6}}><i style={{width:10,height:10,borderRadius:3,background:"var(--brand)",display:"inline-block"}}/>الإيرادات</span>
          <span style={{display:"inline-flex",alignItems:"center",gap:6}}><i style={{width:10,height:10,borderRadius:3,background:"var(--gold)",display:"inline-block",opacity:.75}}/>المصاريف</span>
        </div>
      </div>
      <div className="x-pad" style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10}}>
          {[{l:"إيرادات "+MONTHS[showIdx],v:show.rev},{l:"مصاريف",v:show.exp},{l:"صافي",v:show.net}].map((x,i)=>(
            <div key={i} style={{background:"var(--surface-2)",borderRadius:10,padding:"8px 10px",minWidth:0}}>
              <div style={{fontSize:12,color:"var(--text2)"}}>{x.l}</div>
              <div dir="ltr" style={{fontWeight:700,fontSize:16,textAlign:"right",fontVariantNumeric:"tabular-nums",color:i===2?(x.v<0?"var(--bad)":"var(--ok)"):"var(--text)"}}>{fmt(x.v)}</div>
            </div>
          ))}
        </div>
        <div role="img" aria-label={"الإيرادات والمصاريف الشهرية لعام "+currentYear} style={{display:"flex",alignItems:"flex-end",gap:6,height:170,borderBottom:"1px solid var(--border)",position:"relative"}}>
          {avgRev>0&&<div style={{position:"absolute",left:0,right:0,bottom:(avgRev/maxV*100)+"%",borderTop:"1px dashed var(--border2)",pointerEvents:"none"}}><span style={{position:"absolute",left:0,top:-16,fontSize:11,color:"var(--text3)"}}>{"متوسط "+k(avgRev)}</span></div>}
          {monthlyData.map((d,i)=>{
            const on=i===showIdx;
            return (
              <button key={i} type="button" aria-label={MONTHS[i]+": إيرادات "+fmt(d.rev)+"، مصاريف "+fmt(d.exp)}
                onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onClick={()=>setSelected(selected===i?null:i)}
                style={{flex:1,height:"100%",display:"flex",alignItems:"flex-end",justifyContent:"center",gap:2,background:on?"var(--surface-2)":"transparent",border:0,borderRadius:"6px 6px 0 0",padding:"0 1px",cursor:"pointer",opacity:i>curMonth?.45:1}}>
                <span style={{width:"42%",maxWidth:16,height:(d.rev/maxV*100)+"%",minHeight:d.rev>0?2:0,background:"var(--brand)",borderRadius:"4px 4px 0 0"}}/>
                <span style={{width:"42%",maxWidth:16,height:(d.exp/maxV*100)+"%",minHeight:d.exp>0?2:0,background:"var(--gold)",opacity:.75,borderRadius:"4px 4px 0 0"}}/>
              </button>
            );
          })}
        </div>
        <div style={{display:"flex",gap:6,marginTop:-6}}>
          {monthlyData.map((d,i)=>(
            <span key={i} style={{flex:1,textAlign:"center",fontSize:11,color:i===showIdx?"var(--text)":"var(--text2)",fontWeight:i===showIdx?700:400,whiteSpace:"nowrap",overflow:"hidden"}}>{MONTHS[i].slice(0,3)}</span>
          ))}
        </div>
        <div style={{fontSize:13,color:"var(--text2)",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <span>{"أفضل شهر: "+MONTHS[bestIdx]+" ("+fmt(monthlyData[bestIdx].rev)+" ر.س)"}</span>
          <span>{"إجمالي العام: "+fmt(total)+" · صافي "}<b dir="ltr" style={{color:total-totalExp<0?"var(--bad)":"var(--ok)",unicodeBidi:"isolate"}}>{fmt(total-totalExp)}</b></span>
        </div>
      </div>
    </div>
  );
}
