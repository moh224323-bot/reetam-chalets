import { useState, useEffect } from "react";
import { db } from "../lib/db";
import { B, S, T, W } from "../lib/colors";

interface Props {
  bookingId: string | null;
  mode: "checkin" | "review";
}

const TERMS = `شروط وأحكام الإقامة — مجموعة ريتام

١. يُمنع إدخال المسكرات أو المخدرات.
٢. يُمنع إقامة الحفلات الصاخبة.
٣. المحافظة على نظافة الشاليه.
٤. أي تلف يتحمله الضيف.
٥. وقت تسجيل الخروج ١٢:٠٠ ظهراً.
٦. يُمنع إدخال حيوانات أليفة.
٧. في حالة الإلغاء قبل ٤٨ ساعة يُسترد المبلغ.`;

const GS = `@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Tajawal',sans-serif;background:#FAF8F5;min-height:100vh}`;

export default function GuestPage({ bookingId, mode }: Props) {
  const [step,      setStep]      = useState("loading");
  const [booking,   setBooking]   = useState<any>(null);
  const [rating,    setRating]    = useState(0);
  const [hover,     setHover]     = useState(0);
  const [comment,   setComment]   = useState("");
  const [submitted, setSubmitted] = useState(false);

  const wrap: React.CSSProperties = { fontFamily:"'Tajawal',sans-serif", minHeight:"100vh", background:"#FAF8F5", display:"flex", alignItems:"center", justifyContent:"center", padding:16 };
  const card: React.CSSProperties = { background:W, borderRadius:20, padding:24, maxWidth:480, width:"100%", boxShadow:"0 4px 24px rgba(65,53,35,.1)" };

  useEffect(() => {
    if (!bookingId) { setStep("error"); return; }
    async function load() {
      const data = await db("bookings", "GET", null, `id=eq.${bookingId}`);
      if (!data || !data[0]) { setStep("error"); return; }
      setBooking(data[0]);
      if (mode === "review") {
        const rv = await db("reviews", "GET", null, `booking_id=eq.${bookingId}`);
        if (rv && rv[0]) { setStep("done"); return; }
        setStep("review");
      } else {
        const ci = await db("guest_checkins", "GET", null, `booking_id=eq.${bookingId}`);
        setStep(ci && ci[0] ? "confirmed" : "terms");
      }
    }
    load();
  }, []);

  async function acceptTerms() {
    if (!booking) return;
    const now = new Date().toISOString();
    const res = await db("guest_checkins", "POST", { booking_id:Number(bookingId), chalet:booking.chalet, guest:booking.guest, phone:booking.phone, checked_in_at:now, terms_accepted:true, terms_accepted_at:now });
    if (res && res[0]) setStep("confirmed");
  }

  async function submitReview() {
    if (!rating || !booking) return;
    await db("reviews", "POST", { booking_id:Number(bookingId), chalet:booking.chalet, guest:booking.guest, rating, comment });
    setSubmitted(true);
    setStep("done");
  }

  if (step === "loading" || (!booking && step !== "error")) {
    return <div dir="rtl" style={wrap}><style>{GS}</style><div style={{textAlign:"center",color:T}}><div style={{fontSize:40}}>⌛</div><div style={{marginTop:12,fontWeight:600}}>جاري التحميل...</div></div></div>;
  }
  if (step === "error") {
    return <div dir="rtl" style={wrap}><style>{GS}</style><div style={{...card,textAlign:"center"}}><div style={{fontSize:48}}>❌</div><div style={{fontSize:18,fontWeight:800,color:B,marginTop:12}}>رابط غير صحيح</div></div></div>;
  }

  return (
    <div dir="rtl" style={wrap}>
      <style>{GS}</style>

      {step === "terms" && (
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

      {step === "confirmed" && (
        <div style={{...card,textAlign:"center"}}>
          <div style={{fontSize:60,marginBottom:12}}>✅</div>
          <div style={{fontSize:22,fontWeight:800,color:B,marginBottom:8}}>تم تسجيل دخولك!</div>
          <div style={{fontSize:14,color:T,marginBottom:20}}>أهلاً وسهلاً في {booking.chalet}</div>
          <div style={{background:"rgba(87,109,111,.08)",borderRadius:12,padding:14,fontSize:13,color:T}}>
            🌡️ المكيف متاح · 📶 الواي فاي · 📞 للطوارئ اتصل بالإدارة
          </div>
        </div>
      )}

      {step === "review" && (
        <div style={card}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:40,marginBottom:8}}>⭐</div>
            <div style={{fontSize:20,fontWeight:800,color:B}}>كيف كانت إقامتك؟</div>
            <div style={{fontSize:13,color:T,marginTop:4}}>{booking.chalet} · {booking.guest}</div>
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:16}}>
            {[1,2,3,4,5].map(s => (
              <span key={s} onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(0)} onClick={()=>setRating(s)}
                style={{fontSize:44,cursor:"pointer",color:(hover||rating)>=s?"#F59E0B":"#D1D5DB"}}>
                {(hover||rating)>=s?"★":"☆"}
              </span>
            ))}
          </div>
          {rating > 0 && <div style={{textAlign:"center",marginBottom:12,fontSize:14,fontWeight:600,color:T}}>{["","ضعيف 😞","مقبول 😐","جيد 😊","ممتاز 😄","رائع! 🌟"][rating]}</div>}
          <textarea placeholder="شاركنا تجربتك... (اختياري)" value={comment} onChange={e=>setComment(e.target.value)} rows={3}
            style={{width:"100%",padding:"12px 14px",border:"1.5px solid rgba(197,172,136,.4)",borderRadius:12,fontSize:14,fontFamily:"'Tajawal',sans-serif",color:B,background:"#FAF8F5",outline:"none",resize:"none",marginBottom:16}}/>
          <button onClick={submitReview} disabled={!rating}
            style={{width:"100%",border:"none",cursor:rating?"pointer":"not-allowed",borderRadius:12,fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,background:rating?`linear-gradient(135deg,${B},#2A2218)`:"#D1D5DB",color:rating?S:"#fff"}}>
            إرسال التقييم ✈️
          </button>
        </div>
      )}

      {step === "done" && (
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
