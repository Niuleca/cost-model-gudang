/** Logo Leca: tiga balok bertingkat (rak / tumpukan palet) membentuk huruf L. */
export default function LecaMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#1f1f1f" />
      <rect x="8" y="7" width="5" height="18" rx="1.5" fill="#ffffff" />
      <rect x="8" y="20" width="16" height="5" rx="1.5" fill="#ffffff" />
      <rect x="15.5" y="13.5" width="5" height="4.5" rx="1.2" fill="#b0b0b0" />
      <rect x="21.5" y="13.5" width="3" height="4.5" rx="1.2" fill="#d9d9d9" />
    </svg>
  );
}
