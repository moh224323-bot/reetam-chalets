import { useState } from "react";
import { Booking } from "../lib/types";
import { T, SI } from "../lib/colors";
import { BOOKING_STATUS } from "../lib/constants";
import { formatDate, nightsBetween, db } from "../lib/db";
import { Bdg, SectionTitle, DataTable } from "./ui";
import BookingCalendar from "./BookingCalendar";

interface Props {
  bookings:       Booking[];
  names:          string[];
  filteredNames?: string[];
  onAdd:          () => void;
  onEdit:         (b: Booking) => void;
  onReload:       () => void;
}

export default function BookingsTab({ bookings, names, filteredNames, onAdd, onEdit, onReload }: Props) {
  const [fch, setFch] = useState("الكل");
  const fd = formatDate;
  const fn = nightsBetween;
  const STATUS = BOOKING_STATUS;

  const visibleNames = filteredNames ?? names;
  const rows = bookings.filter(b => fch === "الكل" || b.chalet === fch);

  return (
    <div>
      <BookingCalendar bookings={rows} names={visibleNames}/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <SectionTitle title="جدول الحجوزات"/>
        <div style={{ display:"flex", gap:8 }}>
          <select className="inp" style={{ width:"auto" }} value={fch} onChange={e => setFch(e.target.value)}>
            <option value="الكل">الكل</option>
            {names.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn bp" onClick={onAdd}>+ إضافة حجز</button>
        </div>
      </div>
      <div className="card" style={{ overflow:"hidden" }}>
        <DataTable
          heads={["الضيف","الهاتف","الشاليه","من","إلى","ليالي","السعر","الحالة","إجراءات"]}
          rows={rows.map(b => (
            <tr key={b.id} style={{ background:(STATUS[b.status]?.bg||"transparent")+"44" }}>
              <td style={{ fontWeight:700, borderRight:"3px solid "+(STATUS[b.status]?.color||T) }}>{b.guest}</td>
              <td style={{ direction:"ltr", textAlign:"right", color:T }}>{b.phone}</td>
              <td>{b.chalet}</td>
              <td>{fd(b.date_from)}</td>
              <td>{fd(b.date_to)}</td>
              <td style={{ textAlign:"center" }}>{fn(b.date_from, b.date_to)}</td>
              <td style={{ fontWeight:700, color:T }}>{Number(b.price).toLocaleString()+" ر"}</td>
              <td><Bdg bg={STATUS[b.status]?.bg||"#eee"} color={STATUS[b.status]?.color||"#333"}>{STATUS[b.status]?.label||b.status}</Bdg></td>
              <td>
                <div style={{ display:"flex", gap:4 }}>
                  <button className="btn be bsm" onClick={() => onEdit(b)}>تعديل</button>
                  <button className="btn bd bsm" onClick={async () => { await db("bookings","DELETE",null,b.id); onReload(); }}>حذف</button>
                  <button className="btn bsm" onClick={() => {
                    const url = `https://reetam-chalets.vercel.app?guest=1&b=${b.id}&m=checkin`;
                    const msg = `مرحباً ${b.guest} 👋%0aأهلاً بك في ${b.chalet}%0a%0aرابط تسجيل الدخول:%0a${encodeURIComponent(url)}`;
                    const phone = b.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");
                    window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");
                  }} style={{ background:"#25D366", color:"#fff", padding:"5px 10px", fontSize:13 }}>واتساب 📲</button>
                  <button className="btn bsm" onClick={() => {
                    const url = `https://reetam-chalets.vercel.app?guest=1&b=${b.id}&m=review`;
                    const msg = `${b.guest} 😊%0aرابط التقييم:%0a${encodeURIComponent(url)}`;
                    const phone = b.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");
                    window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");
                  }} style={{ background:"#F59E0B", color:"#fff", padding:"5px 10px", fontSize:13 }}>تقييم ⭐</button>
                </div>
              </td>
            </tr>
          ))}
        />
      </div>
    </div>
  );
}
