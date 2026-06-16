import { S } from "../lib/colors";

interface Props { size?: number }

export default function Logo({ size = 40 }: Props) {
  const s = size;
  return (
    <svg width={s} height={s * 1.3} viewBox="0 0 100 130" fill="none">
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
