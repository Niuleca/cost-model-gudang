// Pembuat file Word (.docx) sederhana tanpa dependensi tambahan (JSZip sudah ada): judul, paragraf, daftar, tabel.
import JSZip from 'jszip';

export type BlokDocx =
  | { t: 'judul'; teks: string } | { t: 'h1' | 'h2' | 'h3'; teks: string } | { t: 'p'; teks: string; tebal?: boolean; miring?: boolean; kecil?: boolean }
  | { t: 'list'; item: string[]; nomor?: boolean } | { t: 'tabel'; kolom?: string[]; baris: string[][]; lebar?: number[] } | { t: 'halaman' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (teks: string, o: { b?: boolean; i?: boolean; sz?: number; color?: string } = {}) =>
  `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(teks)}</w:t></w:r>`;
const para = (isi: string, gaya?: string, o: { ind?: number; spasiSetelah?: number; keep?: boolean } = {}) =>
  `<w:p><w:pPr>${gaya ? `<w:pStyle w:val="${gaya}"/>` : ''}${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:after="${o.spasiSetelah ?? 80}"/>${o.ind ? `<w:ind w:left="${o.ind}" w:hanging="300"/>` : ''}</w:pPr>${isi}</w:p>`;

function tabel(b: Extract<BlokDocx, { t: 'tabel' }>) {
  const nKol = Math.max(b.kolom?.length ?? 0, ...b.baris.map(r => r.length));
  const total = 9638; // lebar area tulis A4 (twip)
  const lebar = b.lebar && b.lebar.length === nKol ? b.lebar.map(x => Math.round(x * total)) : Array.from({ length: nKol }, () => Math.round(total / nKol));
  const sel = (teks: string, i: number, hdr: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${lebar[i]}" w:type="dxa"/>${hdr ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>' : ''}</w:tcPr>${
    (teks || '').split('\n').map(l => para(run(l, { b: hdr, sz: 18 }), undefined, { spasiSetelah: 0 })).join('') || para('')}</w:tc>`;
  const brs = (r: string[], hdr: boolean) => `<w:tr>${hdr ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${Array.from({ length: nKol }, (_, i) => sel(r[i] ?? '', i, hdr)).join('')}</w:tr>`;
  const garis = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${garis}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${lebar.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${b.kolom ? brs(b.kolom, true) : ''}${b.baris.map(r => brs(r, false)).join('')}</w:tbl>${para('', undefined, { spasiSetelah: 60 })}`;
}

function badan(blok: BlokDocx[]) {
  return blok.map(b => {
    switch (b.t) {
      case 'judul': return para(run(b.teks), 'Title');
      case 'h1': return para(run(b.teks), 'Heading1', { keep: true });
      case 'h2': return para(run(b.teks), 'Heading2', { keep: true });
      case 'h3': return para(run(b.teks), 'Heading3', { keep: true });
      case 'p': return para(run(b.teks, { b: b.tebal, i: b.miring, sz: b.kecil ? 18 : undefined, color: b.kecil ? '595959' : undefined }));
      case 'list': return b.item.filter(x => x.trim()).map((x, i) => para(run(b.nomor ? `${i + 1}.` : '•') + '<w:r><w:tab/></w:r>' + run(x), undefined, { ind: 400, spasiSetelah: 40 })).join('');
      case 'tabel': return tabel(b);
      case 'halaman': return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    }
  }).join('');
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
</w:styles>`;

/** Buat file .docx (A4, margin 2 cm) dari daftar blok. */
export async function buatDocx(blok: BlokDocx[], judul = 'Dokumen'): Promise<Blob> {
  const z = new JSZip();
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(judul)}</dc:title><dc:creator>Leca</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('word/styles.xml', STYLES);
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${badan(blok)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
