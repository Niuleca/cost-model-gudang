// Pembaca DXF (ASCII) sederhana untuk latar denah: LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC → segmen garis.
// DWG tidak bisa dibaca langsung di browser — simpan / export dari AutoCAD sebagai DXF.

export interface HasilDxf { garis: [number, number, number, number][]; satuanKeMeter: number | null; lebar: number; tinggi: number }

export function bacaDxf(teks: string, batas = 30000): HasilDxf {
  const baris = teks.split(/\r?\n/);
  const pasang: [number, string][] = [];
  for (let i = 0; i + 1 < baris.length; i += 2) pasang.push([parseInt(baris[i].trim(), 10), baris[i + 1].trim()]);
  // satuan dari header $INSUNITS (4 = mm, 5 = cm, 6 = m, 1 = inch, 2 = feet)
  let satuan: number | null = null;
  const iu = pasang.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  if (iu >= 0 && pasang[iu + 1]) satuan = ({ 4: 0.001, 5: 0.01, 6: 1, 1: 0.0254, 2: 0.3048 } as Record<number, number>)[parseInt(pasang[iu + 1][1], 10)] ?? null;

  const g: [number, number, number, number][] = [];
  const tambah = (a: number, b: number, c: number, d: number) => { if (g.length < batas && [a, b, c, d].every(Number.isFinite)) g.push([a, b, c, d]); };
  const busur = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    let s = a0, e = a1; if (e <= s) e += 360;
    const n = Math.max(8, Math.ceil((e - s) / 15));
    for (let k = 0; k < n; k++) {
      const t0 = ((s + ((e - s) * k) / n) * Math.PI) / 180, t1 = ((s + ((e - s) * (k + 1)) / n) * Math.PI) / 180;
      tambah(cx + r * Math.cos(t0), cy + r * Math.sin(t0), cx + r * Math.cos(t1), cy + r * Math.sin(t1));
    }
  };
  let i = pasang.findIndex(([c, v]) => c === 2 && v === 'ENTITIES');
  if (i < 0) i = 0;
  while (i < pasang.length) {
    const [c, v] = pasang[i];
    if (c !== 0) { i++; continue; }
    if (v === 'ENDSEC' || v === 'EOF') break;
    // kumpulkan atribut entitas sampai kode 0 berikutnya
    let j = i + 1; const at: [number, string][] = [];
    while (j < pasang.length && pasang[j][0] !== 0) at.push(pasang[j++]);
    const n = (kode: number) => { const x = at.find(a => a[0] === kode); return x ? parseFloat(x[1]) : NaN; };
    if (v === 'LINE') tambah(n(10), n(20), n(11), n(21));
    else if (v === 'LWPOLYLINE') {
      const xs = at.filter(a => a[0] === 10).map(a => parseFloat(a[1])), ys = at.filter(a => a[0] === 20).map(a => parseFloat(a[1]));
      for (let k = 0; k + 1 < xs.length; k++) tambah(xs[k], ys[k], xs[k + 1], ys[k + 1]);
      if ((n(70) & 1) && xs.length > 2) tambah(xs[xs.length - 1], ys[ys.length - 1], xs[0], ys[0]);
    } else if (v === 'POLYLINE') {
      const tutup = (n(70) & 1) === 1; const pts: [number, number][] = [];
      let k = j;
      while (k < pasang.length && !(pasang[k][0] === 0 && pasang[k][1] === 'SEQEND')) {
        if (pasang[k][0] === 0 && pasang[k][1] === 'VERTEX') {
          let m = k + 1; let x = NaN, y = NaN;
          while (m < pasang.length && pasang[m][0] !== 0) { if (pasang[m][0] === 10) x = parseFloat(pasang[m][1]); if (pasang[m][0] === 20) y = parseFloat(pasang[m][1]); m++; }
          pts.push([x, y]); k = m; continue;
        }
        k++;
      }
      for (let q = 0; q + 1 < pts.length; q++) tambah(pts[q][0], pts[q][1], pts[q + 1][0], pts[q + 1][1]);
      if (tutup && pts.length > 2) tambah(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]);
      j = k + 1;
    } else if (v === 'CIRCLE') busur(n(10), n(20), n(40), 0, 360);
    else if (v === 'ARC') busur(n(10), n(20), n(40), n(50), n(51));
    i = j;
  }
  // geser ke (0,0); sumbu Y DXF dibalik supaya cocok dengan tampilan denah (atas = belakang)
  let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
  for (const [a, b, c, d] of g) { mx = Math.min(mx, a, c); my = Math.min(my, b, d); Mx = Math.max(Mx, a, c); My = Math.max(My, b, d); }
  if (!g.length) return { garis: [], satuanKeMeter: satuan, lebar: 0, tinggi: 0 };
  const garis = g.map(([a, b, c, d]) => [a - mx, My - b, c - mx, My - d] as [number, number, number, number]);
  return { garis, satuanKeMeter: satuan, lebar: Mx - mx, tinggi: My - my };
}
