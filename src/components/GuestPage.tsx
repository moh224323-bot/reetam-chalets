import { useState, useEffect } from "react";
import { db } from "../lib/db";

interface Props {
  bookingId: string | null;
  mode: "checkin" | "review";
}

// ── هوية بصرية جديدة مستوحاة من دليل عمارة واحات الأحساء (أبيض جيري + خشب + طيني)
// مطبّقة محلياً على هذه الصفحة فقط، بدون المساس بألوان لوحة تحكم الموظفين
const NIGHT      = "#4A3520"; // بني الخشب الداكن
const DUSK        = "#6B4A30";
const SAND         = "#EFE3C8"; // بيج
const PAPER         = "#FBF7EC"; // أبيض جيري
const INK             = "#2B2119";
const INK_SOFT         = "#6B5D50";
const EMBER               = "#C1652E"; // طيني (لون تمييز، الأزرار الأساسية)
const EMBER_DEEP           = "#9C4E22";
const GOLD                   = "#B08D2B";

const TERMS = `شروط وأحكام الإقامة — مجموعة ريتام

١. يُمنع إدخال المسكرات أو المخدرات.
٢. يُمنع إقامة الحفلات الصاخبة.
٣. المحافظة على نظافة الشاليه.
٤. أي تلف يتحمله الضيف.
٥. وقت تسجيل الخروج ١٢:٠٠ ظهراً.
٦. يُمنع إدخال حيوانات أليفة.
٧. في حالة الإلغاء قبل ٤٨ ساعة يُسترد المبلغ.`;

const GS = `@import url('https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@700&family=Tajawal:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Tajawal',sans-serif;background:${SAND};min-height:100vh}`;

export default function GuestPage({ bookingId, mode }: Props) {
  const [step,      setStep]      = useState("loading");
  const [booking,   setBooking]   = useState<any>(null);
  const [rating,    setRating]    = useState(0);
  const [hover,     setHover]     = useState(0);
  const [comment,   setComment]   = useState("");
  const [submitted, setSubmitted] = useState(false);

  const wrap: React.CSSProperties = { fontFamily:"'Tajawal',sans-serif", minHeight:"100vh", background:SAND, display:"flex", alignItems:"center", justifyContent:"center", padding:16 };
  const card: React.CSSProperties = { background:PAPER, borderRadius:20, padding:24, maxWidth:480, width:"100%", boxShadow:"0 4px 24px rgba(43,33,25,.12)", border:`1px solid rgba(43,33,25,.08)` };
  const heading: React.CSSProperties = { fontFamily:"'Aref Ruqaa', serif" };
  // شارة أيقونة بأعلى مقوّس، محاكاة للنوافذ والمداخل المقوسة بالطراز الأحسائي
  const iconBadge = (bg: string): React.CSSProperties => ({
    width:72, height:82, margin:"0 auto 14px", borderRadius:"44px 44px 10px 10px",
    background:bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32,
  });

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
    return <div dir="rtl" style={wrap}><style>{GS}</style><div style={{textAlign:"center",color:INK_SOFT}}><div style={{fontSize:40}}>⌛</div><div style={{marginTop:12,fontWeight:600}}>جاري التحميل...</div></div></div>;
  }
  if (step === "error") {
    return <div dir="rtl" style={wrap}><style>{GS}</style><div style={{...card,textAlign:"center"}}><div style={{fontSize:48}}>❌</div><div style={{...heading,fontSize:18,fontWeight:800,color:INK,marginTop:12}}>رابط غير صحيح</div></div></div>;
  }

  return (
    <div dir="rtl" style={wrap}>
      <style>{GS}</style>

      {step === "terms" && (
        <div style={card}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={iconBadge(SAND)}>📋</div>
            <div style={{...heading,fontSize:21,fontWeight:800,color:INK}}>أهلاً {booking.guest}!</div>
            <div style={{fontSize:13,color:INK_SOFT,marginTop:4}}>{booking.chalet}</div>
          </div>
          <div style={{background:SAND,borderRadius:12,padding:16,marginBottom:20,maxHeight:280,overflowY:"auto"}}>
            <div style={{fontWeight:800,color:INK,marginBottom:10,fontSize:14}}>📄 شروط وأحكام الإقامة</div>
            <div style={{fontSize:13,color:INK,lineHeight:2,whiteSpace:"pre-line"}}>{TERMS}</div>
          </div>
          <button onClick={acceptTerms} style={{width:"100%",border:"none",cursor:"pointer",borderRadius:12,fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,background:`linear-gradient(135deg,${EMBER},${EMBER_DEEP})`,color:PAPER}}>
            ✅ أوافق وأسجّل دخولي
          </button>
        </div>
      )}

      {step === "confirmed" && (
        <div style={{...card,textAlign:"center"}}>
          <div style={iconBadge(SAND)}>✅</div>
          <div style={{...heading,fontSize:23,fontWeight:800,color:INK,marginBottom:8}}>تم تسجيل دخولك!</div>
          <div style={{fontSize:14,color:INK_SOFT,marginBottom:20}}>أهلاً وسهلاً في {booking.chalet}</div>
          <div style={{background:"rgba(193,101,46,.08)",borderRadius:12,padding:14,fontSize:13,color:INK_SOFT}}>
            🌡️ المكيف متاح · 📶 الواي فاي · 📞 للطوارئ اتصل بالإدارة
          </div>
        </div>
      )}

      {step === "review" && (
        <div style={card}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={iconBadge(SAND)}>⭐</div>
            <div style={{...heading,fontSize:21,fontWeight:800,color:INK}}>كيف كانت إقامتك؟</div>
            <div style={{fontSize:13,color:INK_SOFT,marginTop:4}}>{booking.chalet} · {booking.guest}</div>
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:16}}>
            {[1,2,3,4,5].map(s => (
              <span key={s} onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(0)} onClick={()=>setRating(s)}
                style={{fontSize:44,cursor:"pointer",color:(hover||rating)>=s?GOLD:"#D1D5DB"}}>
                {(hover||rating)>=s?"★":"☆"}
              </span>
            ))}
          </div>
          {rating > 0 && <div style={{textAlign:"center",marginBottom:12,fontSize:14,fontWeight:600,color:INK_SOFT}}>{["","ضعيف 😞","مقبول 😐","جيد 😊","ممتاز 😄","رائع! 🌟"][rating]}</div>}
          <textarea placeholder="شاركنا تجربتك... (اختياري)" value={comment} onChange={e=>setComment(e.target.value)} rows={3}
            style={{width:"100%",padding:"12px 14px",border:`1.5px solid rgba(107,74,48,.35)`,borderRadius:12,fontSize:14,fontFamily:"'Tajawal',sans-serif",color:INK,background:SAND,outline:"none",resize:"none",marginBottom:16}}/>
          <button onClick={submitReview} disabled={!rating}
            style={{width:"100%",border:"none",cursor:rating?"pointer":"not-allowed",borderRadius:12,fontFamily:"'Tajawal',sans-serif",fontWeight:700,fontSize:16,padding:14,background:rating?`linear-gradient(135deg,${EMBER},${EMBER_DEEP})`:"#D1D5DB",color:rating?PAPER:"#fff"}}>
            إرسال التقييم ✈️
          </button>
        </div>
      )}

      {step === "done" && (
        <div style={{...card,textAlign:"center"}}>
          <div style={iconBadge(SAND)}>🌟</div>
          <div style={{...heading,fontSize:23,fontWeight:800,color:INK,marginBottom:8}}>شكراً لك!</div>
          <div style={{fontSize:14,color:INK_SOFT}}>{submitted?"تم إرسال تقييمك 😊":"لقد قيّمت هذا الحجز مسبقاً"}</div>
          <div style={{marginTop:16,fontSize:13,color:INK_SOFT}}>مجموعة ريتام للشاليهات 🏖️</div>
        </div>
      )}
    </div>
  );
}
