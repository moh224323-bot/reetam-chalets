import { Review } from "../lib/types";
import { B, T, S, SI, W } from "../lib/colors";

interface Props {
  reviews: Review[];
}

export default function ReviewsTab({ reviews }: Props) {
  const avg = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "0";

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ color:B, fontWeight:800, fontSize:22, marginBottom:6 }}>⭐ تقييمات الضيوف</h2>
        <div style={{ width:50, height:3, background:S, borderRadius:99, marginBottom:16 }}/>
      </div>

      {reviews.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:12, marginBottom:20 }}>
          {[
            { l:"إجمالي التقييمات", v:String(reviews.length),                              i:"📝", bg:W,                                                     c:B     },
            { l:"متوسط التقييم",    v:avg+" ⭐",                                             i:"⭐", bg:"linear-gradient(135deg,#F59E0B,#D97706)",              c:"#fff" },
            { l:"تقييم 5 نجوم",    v:String(reviews.filter(r => r.rating===5).length),    i:"🌟", bg:"linear-gradient(135deg,#10b981,#059669)",               c:"#fff" },
          ].map((s, i) => (
            <div key={i} style={{ background:s.bg, borderRadius:12, padding:16, boxShadow:"0 4px 14px rgba(65,53,35,.1)", border:s.bg===W?"1px solid rgba(197,172,136,.3)":"none" }}>
              <div style={{ fontSize:20, marginBottom:5 }}>{s.i}</div>
              <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:s.bg===W?T:"rgba(255,255,255,.8)", marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {reviews.length === 0
        ? <div className="card" style={{ padding:40, textAlign:"center", color:T }}>
            <div style={{ fontSize:48, marginBottom:12 }}>⭐</div>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>لا توجد تقييمات بعد</div>
            <div style={{ fontSize:13 }}>أرسل رابط التقييم للضيوف من صفحة الحجوزات</div>
          </div>
        : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
            {[...reviews].reverse().map((r, i) => (
              <div key={i} className="card" style={{ padding:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ fontWeight:700, color:B, fontSize:14 }}>{r.guest}</div>
                    <div style={{ fontSize:12, color:T }}>{r.chalet}</div>
                  </div>
                  <div style={{ display:"flex", gap:2 }}>
                    {[1,2,3,4,5].map(s => (
                      <span key={s} style={{ fontSize:18, color:r.rating>=s?"#F59E0B":"#E5E7EB" }}>★</span>
                    ))}
                  </div>
                </div>
                {r.comment && (
                  <div style={{ fontSize:13, color:T, background:"#FAF8F5", borderRadius:8, padding:"8px 12px", lineHeight:1.7 }}>{r.comment}</div>
                )}
                <div style={{ fontSize:11, color:SI, marginTop:8 }}>{new Date(r.created_at).toLocaleDateString("ar-SA")}</div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}
