// Read me Leca (Word) — versi 8 November 2026
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, HeadingLevel,
  LevelFormat, Footer, Header, PageNumber, BorderStyle, PageBreak } = require('docx');

const FONT = 'Arial';
const INK = '1F2A37', MUTED = '6B7280', AKSEN = '2F6FD0', HDR = 'DCE6F2', NOTE = 'F3F6FA';
const W = 9026; // lebar isi A4 (margin 1 inci)

const t = (s, o = {}) => new TextRun({ text: s, font: FONT, size: o.size ?? 20, bold: o.b, italics: o.i, color: o.c ?? INK });
/** teks dengan **tebal** sederhana */
const runs = (s, o = {}) => s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(x => x.startsWith('**') ? t(x.slice(2, -2), { ...o, b: true }) : t(x, o));
const p = (s, o = {}) => new Paragraph({ children: runs(s, o), spacing: { after: o.after ?? 100, line: 276 }, alignment: o.al });
const h1 = s => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: s, font: FONT })], pageBreakBefore: true });
const h2 = s => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: s, font: FONT })] });
const bab = (n, s) => [new Paragraph({ children: [t(`BAB ${n}`, { size: 18, b: true, c: AKSEN })], pageBreakBefore: true, spacing: { after: 40 } }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: s, font: FONT })] })];
const li = (s, lvl = 0) => new Paragraph({ children: runs(s), numbering: { reference: 'bul', level: lvl }, spacing: { after: 60, line: 268 } });
const no = (s, ref = 'num') => new Paragraph({ children: runs(s), numbering: { reference: ref, level: 0 }, spacing: { after: 60, line: 268 } });
const cell = (s, w, o = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  shading: o.bg ? { type: ShadingType.CLEAR, color: 'auto', fill: o.bg } : undefined,
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  children: String(s).split('\n').map(x => new Paragraph({ children: runs(x, { size: o.size ?? 18, b: o.b }), spacing: { after: 20 } })),
});
const brd = { style: BorderStyle.SINGLE, size: 4, color: 'C9D3E0' };
function tabel(header, rows, lebar) {
  const tot = lebar.reduce((a, b) => a + b, 0);
  const w = lebar.map(x => Math.round(x / tot * W)); w[w.length - 1] += W - w.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: w,
    borders: { top: brd, bottom: brd, left: brd, right: brd, insideHorizontal: brd, insideVertical: brd },
    rows: [new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, w[i], { bg: HDR, b: true })) }),
      ...rows.map(r => new TableRow({ children: r.map((c, i) => cell(c, w[i], { b: i === 0 && r.length > 1 ? false : false })) }))],
  });
}
const spasi = () => new Paragraph({ children: [], spacing: { after: 80 } });
function kotak(judul, isi) {
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.SINGLE, size: 24, color: AKSEN }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
    rows: [new TableRow({ children: [new TableCell({ width: { size: W, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: NOTE },
      margins: { top: 100, bottom: 100, left: 180, right: 140 },
      children: [new Paragraph({ children: [t(judul, { b: true })], spacing: { after: 60 } }), ...[].concat(isi).map(x => new Paragraph({ children: runs(x, { size: 19 }), spacing: { after: 40, line: 268 } }))] })] })],
  });
}

const isi = [];
// ---------------- Sampul
isi.push(
  new Paragraph({ children: [t('LECA', { size: 22, b: true, c: AKSEN })], spacing: { before: 2400, after: 120 } }),
  new Paragraph({ children: [t('Read Me — Panduan Penggunaan Leca', { size: 52, b: true })], spacing: { after: 200 } }),
  new Paragraph({ children: [t('Cost model, tender & quotation gudang, transportation & intermodal — dari input sampai Excel ber-rumus', { size: 24, c: MUTED })], spacing: { after: 600 } }),
  p('**Versi:** 8 November 2026 (menggantikan versi 20 Oktober 2026)'),
  p('**Untuk:** Super Admin · Manager · Solution Design · Business Development · Procurement · IT · HR · Operational'),
  p('**Alamat aplikasi:** niuleca.com · costmodel.esapanghegar.my.id'),
  p('**Dibuat oleh:** esapanghegar · CP 088291919234 · Niuleca@gmail.com'),
  spasi(),
  kotak('Yang baru di versi ini', [
    '• Tab tender warehouse sekarang **12 tab**: Key assumption · Volume · **Produk** · **Value Stream Mapping** · **Warehouse Planning** · **Loan & Interest Calculator** · **Technology & Equipment** · **Utilities Management** · **Cost Allocation** · **Result** · Quotation · Export.',
    '• **Cost Allocation**: matriks pembagian biaya per kategori ke Storage / Handling In / Handling Out (default dari simulasi, bisa diubah).',
    '• **Export Excel** disusun ulang: nama & urutan sheet = nama tab web, semua angka rumus, diverifikasi sama dengan sistem.',
    '• Kolom umur aset = **periode depresiasi = MIN(umur ekonomis, kontrak)**; supervisor otomatis bisa dihapus; startup otomatis tampil di ringkasan biaya; Water (air) di Utilities.',
    '• Margin manual = **GP% atas harga jual** (harga = biaya ÷ (1 − GP%)).',
  ]),
);

// ---------------- Daftar isi
isi.push(...bab('', 'Daftar isi').slice(1));
isi[isi.length - 1] = new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Daftar isi', font: FONT })], pageBreakBefore: true });
isi.push(tabel(['Bab', 'Topik'], [
  ['1', 'Mengenal Leca & alur kerja'], ['2', 'Akun: daftar, ACC, role & hak akses'], ['3', 'Profil: data diri, logo & tanda tangan'],
  ['4', 'Membuat tender warehouse baru'], ['5', 'Mengisi tender warehouse — 12 tab langkah demi langkah'], ['6', 'Cost Allocation: pembagian biaya ke layanan'],
  ['7', 'Membaca Result: KPI, rate card, margin & pajak'], ['8', 'Quotation & approval'], ['9', 'Export Excel ber-rumus & cara review'],
  ['10', 'Transportation, Intermodal & Market Price'], ['11', 'Simulasi Warehouse, Price Inquiry & Productivity'], ['12', 'Menu Super Admin & Manager'], ['13', 'Tips & pertanyaan umum'],
], [1, 9]));

// ---------------- Bab 1
isi.push(...bab(1, 'Mengenal Leca & alur kerja'),
  p('Leca menghitung cost model gudang (manpower, space, MHE, IT, biaya lain, utilitas, interest) dan transport, lalu menyusun rate card dan quotation PDF. Semua angka bisa ditelusuri: dari input di web sampai rumus di file Excel.'),
  tabel(['Langkah', 'Apa yang dilakukan'], [
    ['1. Daftar akun', 'Buat akun, konfirmasi email'], ['2. ACC', 'Admin menyetujui dan memberi role'], ['3. Profil', 'Lengkapi nama, perusahaan, logo & tanda tangan'],
    ['4. Tender', 'Isi 12 tab tender (warehouse) atau Input rute (transport/intermodal)'], ['5. Result', 'Cek red flag, atur Cost Allocation, margin & pajak, simpan versi'],
    ['6. Quotation', 'Buat, ajukan approval, pratinjau → print / unduh PDF'], ['7. Export', 'Unduh Excel ber-rumus untuk review'],
  ], [2, 6]),
  h2('Navigasi utama'),
  tabel(['Menu', 'Isi'], [
    ['Dashboard', 'Ringkasan pipeline, status project, heatmap backlog'],
    ['Logistics Tender', 'New Tender · Draft · Comparation · Riwayat · Approval quotation · Implementation · Transportation · Intermodal · Market Price (semua moda)'],
    ['Simulasi Warehouse', 'Editor layout 2D/3D (area rak, area kolom/pilar, trapesium), simulasi pergerakan barang'],
    ['Price Inquiry', 'Database harga: MHE, racking, office, gudang, IT, utilities, gudang sewa, HR (UMK, jabatan, payroll) · Comparation Price'],
    ['Productivity', 'Database produktivitas per aktivitas, tool, role & UoM (benchmark per kategori bisnis)'],
    ['Menu akun (kanan atas)', 'Pengguna & role · Approval akun · Master data · Profil & password · Keluar'],
    ['Pemilih bahasa', 'Indonesia · English · Korea · Jepang'],
  ], [2, 6]),
  spasi(),
  kotak('Navigasi tender', 'Menu tab tetap menempel di atas saat halaman di-scroll, dan bar **Undo · Redo · Simpan · Hitung** menempel di bawah layar. Tab yang terbuka tersimpan di alamat halaman, jadi bisa dibagikan / dibuka ulang di tab yang sama.'),
);

// ---------------- Bab 2
isi.push(...bab(2, 'Akun: daftar, ACC, role & hak akses'),
  h2('Mendaftar'),
  no('Buka halaman login → **Buat akun**. Isi nama lengkap, email, password (min. 8 karakter).', 'num1'),
  no('Buka email dan klik link konfirmasi.', 'num1'),
  no('Login. Akun berstatus **Menunggu persetujuan** — belum bisa membuka data.', 'num1'),
  no('Admin meng-ACC dan memberi role. Muat ulang halaman; menu terbuka sesuai role.', 'num1'),
  h2('Hirarki role & hak akses'),
  tabel(['Role', 'Tender & quotation', 'Approval quotation', 'Input harga', 'Productivity', 'Export Excel'], [
    ['Super Admin', 'Ya', 'Ya (approve sendiri)', 'Ya', 'Ya', 'Ya'],
    ['Manager', 'Ya', 'Ya — approve pekerjaan SD & BD', 'Ya', 'Ya', 'Ya'],
    ['Solution Design', 'Ya — unduh/print/kirim setelah approved', 'Ajukan', 'Ya', 'Ya', '—'],
    ['Business Development', 'Ya — unduh/print/kirim setelah approved', 'Ajukan', 'Ya', 'Ya', '—'],
    ['Procurement · IT · HR', '—', '—', 'Ya', '—', '—'],
    ['Operational', '—', '—', '—', 'Ya', '—'],
  ], [2.2, 2.4, 2.2, 1.2, 1.2, 1.2]),
  spasi(),
  kotak('Keamanan', 'Password tidak bisa dilihat siapa pun (disimpan terenkripsi). Kalau lupa: **Lupa password** di halaman login, atau minta Super Admin **Atur password** (password baru tampil sekali).'),
);

// ---------------- Bab 3
isi.push(...bab(3, 'Profil: data diri, logo & tanda tangan'),
  p('Menu akun (kanan atas) → **Profil & password**.'),
  tabel(['Isian', 'Keterangan'], [
    ['Nama lengkap', 'Tanda tangan PDF & inisial nomor quotation (Muhammad esa panghegar → MEP)'],
    ['User ID', 'Unik, huruf kecil/angka/titik/_/- (3–30 karakter)'], ['Nomor telepon', 'Opsional'],
    ['Email · Role', 'Baca saja; email diganti lewat Ganti email, role diatur Admin'],
    ['Perusahaan', 'Kop PDF & inisial nomor quotation (PT Kamadjaja Logistics → PKL)'], ['Jabatan', 'Tanda tangan PDF'],
  ], [2, 6]),
  h2('Logo perusahaan & tanda tangan (wajib)'),
  p('Role yang membuat quotation wajib mengunggah logo dan TTD. Sebelum lengkap, tombol **Buat quotation** dan unduh PDF terkunci.'),
  li('Format PNG/JPG/WEBP, maks. 2 MB; PNG latar transparan paling rapi.'),
  li('Satu logo + satu TTD per akun; unggah baru menggantikan yang lama.'),
  li('Quotation otomatis memakai logo & TTD akun yang sedang login.'),
);

// ---------------- Bab 4
isi.push(...bab(4, 'Membuat tender warehouse baru'),
  p('Menu **Logistics Tender → New Tender** (tombol **Baca saya sebelum mulai** membuka panduan ini).'),
  tabel(['Isian', 'Cara isi'], [
    ['Customer', 'Nama perusahaan customer (dipakai di nomor quotation: PT Otsuka Indonesia → POI)'],
    ['Industri / kategori bisnis', 'Untuk benchmark produktivitas'], ['Tipe gudang', 'Ambient / cold / dll.'],
    ['Provinsi · Kab/Kota', 'Menentukan UMK (upah minimum berlaku tampil otomatis)'],
    ['Durasi kontrak', 'Bulan — dasar depresiasi (maks. kontrak), amortisasi, interest & eskalasi upah'],
    ['Rencana go-live', 'Dasar kalender & mulai kontrak'], ['Shift · Payment term · Skenario aset', 'Rental / Own Asset / Built-to-Suit'],
  ], [2, 6]),
  spasi(),
  kotak('Kebiasaan baik', ['Tekan **Simpan** sesering mungkin. **Hitung** tidak memindahkan Anda ke tab Result. **Undo/Redo** (Ctrl+Z / Ctrl+Y) membatalkan perubahan input.',
    'Koma dibaca sebagai desimal — tulis 20369, bukan 20,369.']),
  h2('Isi otomatis pada tender baru'),
  li('Value Stream Mapping langsung berisi skema default VSM (prosedur gudang standar) — tinggal disesuaikan.'),
  li('Supervisor dihitung otomatis dari span of control; peran tetap kosong.'),
  li('Technology & Equipment dan Utilities Management terisi daftar default dari data tender (luas, headcount, shift) — semua bisa diubah atau dihapus.'),
);

// ---------------- Bab 5
isi.push(...bab(5, 'Mengisi tender warehouse — 12 tab'),
  tabel(['No', 'Tab', 'Isi utama'], [
    ['1', 'Key assumption', 'Data tender, UMK, shift, kalender, faktor produktivitas & efisiensi, workload palletize/loose & per shift'],
    ['2', 'Volume', 'Volume per arus (rata-rata, peak, komitmen), konversi UoM, parameter muatan, profil order & kendaraan'],
    ['3', 'Produk', 'Daftar SKU: dimensi (cm/mm), berat, UPP, qty → CBM, berat/palet, level rak maks, zonasi'],
    ['4', 'Value Stream Mapping', 'Aktivitas & produktivitas → man hour → FTE → headcount; peran tetap & supervisor; rincian biaya manpower'],
    ['5', 'Warehouse Planning', 'Pilih gudang, kebutuhan space A–E, racking level, biaya sewa & racking'],
    ['6', 'Loan & Interest Calculator', 'Capex yang dibiayai pinjaman, baris manual, working capital'],
    ['7', 'Technology & Equipment', 'MHE (sewa/beli), IT format BAP, office/consumable/pallet/HSE/services/asuransi/startup'],
    ['8', 'Utilities Management', 'Electrical (listrik) & Water (air bersih)'],
    ['9', 'Cost Allocation', 'Pembagian biaya per kategori ke Storage / Handling In / Handling Out'],
    ['10', 'Result', 'KPI, red flag, rate card & margin, pajak, simulasi, rincian biaya'],
    ['11', 'Quotation', 'Nomor, approval, pratinjau, print & unduh PDF'],
    ['12', 'Export', 'Excel ber-rumus (Super Admin & Manager) & upload kembali'],
  ], [0.6, 2.2, 6]),
  h2('1 · Key assumption'),
  li('Customer, industri, area (UMK), skema, skenario aset, kontrak, go-live, shift, hari & jam kerja, payment term, cuti, faktor produktivitas & efisiensi.'),
  li('Workload palletize vs loose per proses (unloading, putaway, replenishment, picking, loading). Aktivitas yang "Ikut porsi" otomatis memakai angka ini.'),
  li('Process Design: working day Man Power & MHE dan workload per shift terpisah Inbound / Outbound / Storage-VAS.'),
  h2('2 · Volume'),
  li('Isi per arus (storage, inbound, outbound): rata-rata, peak, komitmen (MGV). Peak & komitmen mengikuti rata-rata selama masih kosong.'),
  li('UoM palet: 1 palet = N case, 1 case = N pcs. UoM case/karton: 1 palet = N karton.'),
  li('Parameter muatan (kg & CBM per palet / per case) dan profil order (kontainer 20ft/40ft/40HC atau 19 jenis land transport, pemakaian ruang muat default 90%).'),
  h2('3 · Produk'),
  li('Isi Kode, Nama, UOM, P × L × T, berat per UOM, UPP (UOM per palet) dan qty stok — atau tempel dari Excel.'),
  li('**Satuan dimensi cm / mm** per produk; bila kosong dibaca otomatis (angka > 2,5 m untuk palet atau > 6 m untuk UOM lain dianggap mm).'),
  li('**UOM palet**: UPP = 1, berat = berat kotor satu palet (tanpa tambahan palet kayu), tinggi = T.'),
  li('Berat per palet = UPP × berat + palet kosong (default 25 kg) → **level rak maksimal** dari aturan berat (≤ 500 kg semua level, ≤ 750 kg maks level 3, ≤ 900 kg maks level 2, di atasnya level 1 / lantai; melebihi kapasitas beam → lantai).'),
  li('Bila Produk diaktifkan sebagai sumber data, Volume, parameter muatan dan space ikut disesuaikan (daftar perubahan ditampilkan).'),
  h2('4 · Value Stream Mapping'),
  li('Aktivitas: task, tool, role, produktivitas, UoM, arus, % volume (manual atau ikut porsi palletize/loose). Tombol skema default dan **Sinkronkan dengan database** Productivity.'),
  li('Process Design: workload → RfR → man hour → FTE → headcount (multi-skill pooling per shift). Man Power & MHE Summary.'),
  li('**Supervisor otomatis** = ROUNDUP(direct per shift ÷ span of control) × shift — tampil sebagai baris "otomatis" di tabel peran tetap dengan tombol **Hapus** (span = 0) atau **Ubah manual**. Span umumnya 10–20.'),
  li('**Peran tetap** per shift (Security 1/shift × 3 = 3) atau total (1 manager untuk gudang). Role yang dihapus ikut terhapus dari rincian biaya manpower.'),
  li('Rincian biaya manpower: gaji pokok = UMK × % level jabatan, BPJS TK/KS/Pensiun, THR, kompensasi, management fee, **Dedicated / Sharing** (0,5 = pegang 2 project), eskalasi upah tahunan.'),
  h2('5 · Warehouse Planning'),
  li('Pilih gudang dari database (per m² atau sewa utuh) atau tarif manual.'),
  li('Space A–E: selective rack (SPR), double deep (DDR), block stack, pallet floor, staging inbound/outbound, fasilitas, allowance → luas dipakai. Racking level otomatis dari tinggi gudang & muatan.'),
  li('Biaya: sewa = luas × tarif; racking = posisi × harga ÷ MIN(umur ekonomis, kontrak).'),
  h2('6 · Loan & Interest Calculator'),
  li('Bunga tidak dihitung otomatis. Pilih capex yang dibiayai pinjaman atau tambah baris manual; isi bunga %/tahun, metode (flat / menurun), pokok & tenor. Working capital dari payment term.'),
  h2('7 · Technology & Equipment'),
  li('**MHE**: unit dari MHE Summary + spare; sewa = unit × harga, beli = unit × harga ÷ periode depresiasi.'),
  li('**IT** (format BAP): bulanan, transaksi, yearly ÷ 12, OTC perangkat didepresiasi, development/mandays diamortisasi, atau ditagih terpisah. Tombol Isi default IT.'),
  li('**Biaya lain** per klasifikasi Price Inquiry: office, ATK, consumable, pallet, HSE, services, asuransi, startup & konstruksi, lainnya.'),
  li('Kolom **Depresiasi (bln)** = MIN(umur ekonomis, kontrak) — aset beli disusutkan penuh selama kontrak; bila umur ekonomis lebih panjang, tertulis "umur ekonomis 48 → kontrak 36".'),
  li('**Startup & implementation otomatis** (% OPEX/bln dan % biaya manpower/bln, diamortisasi selama kontrak) ikut dihitung di kartu Startup, ringkasan per klasifikasi, dan total biaya.'),
  h2('8 · Utilities Management'),
  li('**Electrical**: simulasi Utilities (Price Inquiry) atau peralatan per titik (watt × qty × jam/hari × hari operasional ÷ 1000 × tarif PLN).'),
  li('**Water**: orang × L/orang/hari + luas × L/m²/hari (× hari kerja) → m³ × tarif + abonemen; 0 bila air termasuk sewa gudang.'),
  h2('9–12 · Cost Allocation, Result, Quotation, Export'), p('Lihat Bab 6 (Cost Allocation), Bab 7 (Result), Bab 8 (Quotation) dan Bab 9 (Export).'),
);

// ---------------- Bab 6
isi.push(...bab(6, 'Cost Allocation: pembagian biaya ke layanan'),
  p('Tab **Cost Allocation** menentukan berapa bagian tiap kategori biaya yang masuk ke tarif **Storage**, **Handling In** dan **Handling Out** (dan VAS bila ada). Total biaya dan total GP tidak berubah — yang bergeser hanya porsi dan tarif per layanan.'),
  h2('Default = hasil simulasi (cost-to-serve)'),
  tabel(['Kategori', 'Dasar default'], [
    ['Fasilitas (sewa gedung / space), Racking', '100% Storage'],
    ['Manpower', 'Direct: jam aktivitas per arus di VSM · Indirect: 40% In · 40% Out · 20% Storage · Peran tetap: manajemen (disebar)'],
    ['MHE', 'Jam pakai alat per aktivitas; tanpa data jam: 40% Storage · 30% In · 30% Out'],
    ['Utilitas', 'Listrik 60% Storage · 20% In · 20% Out; air 40/30/30'],
    ['Overhead, Startup, biaya lain', '40% Storage · 30% In · 30% Out (atau alokasi baris)'],
    ['Manajemen (SPV, manager, biaya tetap)', 'Disebar ke layanan sesuai porsi biaya operasionalnya'],
  ], [3, 5]),
  h2('Cara mengubah'),
  li('Ubah sel mana pun di matriks → kategori itu ditandai **Diubah** dan semua barisnya memakai porsi tersebut. Nilai default tetap terlihat di bawah sel.'),
  li('Total per baris harus 100% — bila tidak, angkanya merah, ada tombol **jadikan 100%**, dan sistem menormalkan otomatis (red flag).'),
  li('**Pola cepat**: "Fasilitas & rak → Storage 100%, lainnya Handling In/Out 50/50", "Semua kategori 1/3 rata", dan **Samakan semua kategori ke porsi …** (mis. 50/25/25 → porsi layanan total 50/25/25).'),
  li('**reset** per kategori atau **reset semua ke default simulasi**.'),
  li('Baris bawah menampilkan biaya per layanan, porsi layanan dan tarif rate card yang langsung berubah.'),
  spasi(),
  kotak('Kapan diubah?', 'Default paling mudah dipertanggungjawabkan bila customer membandingkan tarif per layanan. Ubah bila ada strategi harga — mis. storage dibesarkan agar pendapatan tetap stabil walau throughput turun, atau handling dibesarkan untuk gudang turnover tinggi.'),
);

// ---------------- Bab 7
isi.push(...bab(7, 'Membaca Result: KPI, rate card, margin & pajak'),
  p('Tab Result selalu dihitung ulang dari input terbaru. Bila berbeda dengan versi tersimpan, tekan **Simpan hasil sebagai versi baru** agar quotation & export memakai angka ini.'),
  tabel(['Bagian', 'Isi & cara pakai'], [
    ['KPI', 'Cost, selling (bersih PPh), profit, GP %, jumlah manpower, luas gudang'],
    ['Red flag', 'Kritis / peringatan / info — bisa disembunyikan. Red flag kritis diselesaikan sebelum quotation'],
    ['Pembagian biaya ke layanan', 'Ringkasan Cost Allocation + tombol "Atur di Cost Allocation"'],
    ['Rate card & margin', 'Satuan tarif per layanan (palet, case, m², CBM, kg…), GP% manual per layanan, PPh 23 & PPN'],
    ['Layanan yang dijual', 'Centang layanan yang ditagih terpisah. Hapus centang = "termasuk": biayanya dipindah ke layanan yang dijual (proporsional biaya), total biaya & GP tetap; di quotation tertulis "Termasuk"'],
    ['Tarif tambahan', 'Additional charges yang bisa ditambah/dihapus: handling per karton/pcs, movement product charge, VAS (labeling, wrapping, repacking), palletizing, cross-docking, lembur, admin dokumen — ikut ke quotation'],
    ['Simulasi', 'Pendapatan, biaya, GP per bulan/tahun/kontrak untuk volume komitmen, rata-rata & peak'],
    ['Porsi biaya per kategori', 'Klik kategori → tab baru; harga tiap baris bisa direvisi dan disimpan sebagai versi baru'],
    ['Opex vs capex · Rincian biaya', 'Porsi biaya operasional, depresiasi/amortisasi, interest; rincian per baris'],
  ], [2.2, 6]),
  h2('Rumus margin & pajak'),
  li('**GP% (input) = GP atas harga jual**: harga = biaya ÷ (1 − GP%). Contoh biaya Rp85.000, GP 15% → harga Rp100.000, GP Rp15.000 (15% dari harga).'),
  li('Kosong = default per kategori risiko (master margin).'),
  li('**PPh 23 exclude** (ditanggung customer): tarif di-gross-up ÷ (1 − 2%), customer memotong PPh, diterima utuh. **Include**: PPh mengurangi pendapatan.'),
  li('**PPN** exclude: ditambahkan di invoice (tarif PPN efektif default 11% = 12% × DPP 11/12); include: tarif sudah termasuk PPN. PPN bukan pendapatan.'),
  li('**Tarif tambahan** — dasar biaya: *Turunan* (biaya layanan utama ÷ volume dalam satuan lain, mis. handling in per karton), *Aktivitas* (menit/unit ÷ 60 × (orang × tarif orang/jam × pengali + alat × tarif alat/jam) + material; tarif orang/jam = biaya manpower ÷ headcount ÷ jam kerja, tarif alat/jam = biaya MHE ÷ unit ÷ jam MHE), atau *Manual*. Tarif = biaya ÷ (1 − GP%), gross-up PPh bila exclude, dibulatkan ke atas. Estimasi volume hanya menampilkan potensi pendapatan (di luar simulasi utama).'),
  li('**Overhead** = % master Finance (default 3%) × subtotal biaya — biaya tidak langsung kantor pusat (finance, HR, legal, IT pusat, manajemen regional). Dihitung sebagai biaya, jadi GP sudah setelah overhead.'),
);

// ---------------- Bab 8
isi.push(...bab(8, 'Quotation & approval'),
  h2('Nomor quotation otomatis'),
  tabel(['Bagian', 'Sumber', 'Contoh'], [
    ['Tanggal', 'ddmmyy', '081126'], ['Perusahaan Anda', 'Profil → Perusahaan', 'PKL'], ['Customer', 'Isian Kepada', 'POI'],
    ['Akun', 'Nama profil', 'MEP'], ['Pembuatan ke-', '001 = pertama, 002 = revisi 1', '001'], ['Urutan hari ini', 'Semua tender', '001'],
  ], [2, 4, 2]),
  p('Contoh lengkap: **081126/PKL/POI/MEP/001/001**'),
  h2('Alur approval'),
  tabel(['Status', 'Artinya', 'Yang bisa dilakukan'], [
    ['Draft', 'Baru dibuat', 'SD/BD: Ajukan approval · Manager/Super Admin: Approve sendiri / Revisi / Tolak'],
    ['Menunggu approval', 'Diajukan SD/BD', 'Manager/Super Admin: Approve · Revisi (catatan wajib) · Tolak (catatan wajib)'],
    ['Perlu revisi', 'Diminta perbaikan', 'Pembuat: Edit → Ajukan lagi'], ['Ditolak', 'Tidak disetujui', 'Edit ulang atau hapus'],
    ['Approved', 'Disetujui', 'Pratinjau → Print / Unduh PDF · Tandai terkirim · Buat revisi · Batalkan approve'],
    ['Terkirim', 'Sudah dikirim ke customer', 'Buat revisi'],
  ], [1.6, 1.8, 4.6]),
  spasi(),
  kotak('Penting', 'Print dan unduh PDF hanya di dalam **Pratinjau** dan hanya setelah **Approved**. Transportation & Intermodal memakai alur quotation yang sama dari tab Quotation masing-masing.'),
);

// ---------------- Bab 9
isi.push(...bab(9, 'Export Excel ber-rumus & cara review'),
  p('Tab **Export** (Super Admin & Manager): tekan **Siapkan review** → periksa isi tiap sheet di layar → centang sheet → **Unduh (.xlsx)**. Tender dihitung ulang dengan master data terbaru sebelum disusun.'),
  h2('Susunan sheet = tab web'),
  tabel(['Sheet', 'Isi (semua angka hasil = rumus Excel)'], [
    ['0 Ringkasan', 'Hasil utama, 1-1 PNL (selling, cost, indirect, gross profit), 2-1 manpower, 2-2 other cost, porsi kategori, opex vs capex, rate card, alur perhitungan'],
    ['Key assumption', 'Data tender, UMK, shift, kalender, faktor, porsi palletize/loose, workload per shift'],
    ['Volume', 'Volume & konversi, ringkasan order, parameter muatan, profil order & kendaraan'],
    ['Produk', 'Aturan berat, daftar SKU dengan rumus CBM, berat/palet, palet, layer, tinggi muatan, level maks, cara simpan, turunan tertimbang'],
    ['Value Stream Mapping', 'Man Power & MHE Summary, rincian biaya manpower (gaji → BPJS → THR → fee → sharing), rincian per task, matriks multi-skill, indirect & peran tetap, VSM'],
    ['Warehouse Planning', 'Gudang terpilih, space A–E, racking level, komposisi luas, biaya sewa & racking'],
    ['Loan & Interest Calculator', 'Pinjaman capex & baris manual, working capital'],
    ['Technology & Equipment', 'Kebutuhan MHE, IT format BAP, biaya lain per klasifikasi (+ kolom Depresiasi), startup & implementation otomatis'],
    ['Utilities Management', 'Listrik (simulasi / peralatan per titik) & air bersih'],
    ['Cost Allocation', 'Matriks per kategori: Diubah? (Ya/Tidak), porsi Storage/In/Out/VAS, biaya per layanan, default simulasi, porsi sebaran manajemen, tarif'],
    ['Result', 'KPI, red flag, biaya per layanan & risiko (+ kolom Dijual? Ya/Tidak), rate card (GP, PPh gross-up, PPN, pembulatan), tarif tambahan, simulasi, kurs, opex/capex, kalender, **Rincian biaya** semua baris + alokasi'],
    ['Quotation', 'Rate card penawaran, layanan termasuk, tarif tambahan & tagihan sekali'],
    ['Daftar', 'Sumber semua droplist & data master (UMK, jabatan, produktivitas, item harga, gudang, PLN, libur)'],
    ['Data Input', 'Semua isian tender (path → nilai) — dipakai untuk upload kembali ke Leca'],
    ['Master Data · Data Mentah', 'Parameter master & seluruh isi asumsi/hasil untuk audit'],
  ], [2.3, 6]),
  h2('Warna sel'),
  tabel(['Warna', 'Arti'], [
    ['Header silver', 'Header rumus / hasil — arahkan kursor ke header untuk melihat catatan rumus'], ['Header abu-abu muda', 'Header input'],
    ['Putih tulang', 'Sel input — boleh diubah untuk simulasi; hasil, rate card, quotation & ringkasan ikut berubah'], ['Abu-abu', 'Sel hasil rumus — jangan ditimpa'],
  ], [2, 6]),
  h2('Cara review di Excel'),
  no('Mulai dari **0 Ringkasan**: baris Total Cost menampilkan ✓ bila sama dengan total Rincian biaya di sheet Result.', 'num2'),
  no('Klik menu tab di baris 4 setiap sheet untuk pindah sheet (sama dengan tab web).', 'num2'),
  no('Telusuri angka: klik sel → lihat rumus di formula bar; **Ctrl + [** melompat ke sel sumber, **Formulas → Trace Precedents** menampilkan panah asal angka. Nama range (mis. TotalBiaya, Rinci_Biaya, LuasM2, RackLevel) ada di **Name Manager**.', 'num2'),
  no('**Result → Rincian biaya**: tiap baris berisi biaya sistem, revisi (bila ada), kelompok, tahap, jenis (opex/capex) dan alokasi ke layanan. Alokasi kategori yang "Diubah" di Cost Allocation otomatis mengikuti matriks.', 'num2'),
  no('Ubah input (sel putih tulang) untuk simulasi, mis. GP% di rate card, porsi di Cost Allocation, tarif sewa — semua hasil ikut berubah. File dihitung ulang otomatis saat dibuka.', 'num2'),
  spasi(),
  kotak('Verifikasi', ['Setiap rilis export diuji dengan menghitung ulang file (LibreOffice) dan membandingkan dengan sistem: total biaya, biaya per kategori, setiap baris Rincian biaya, rate card (biaya & tarif), tarif quotation, simulasi pendapatan & GP, headcount, luas, Cost Allocation per layanan, dan perhitungan Produk — semua sama, tanpa error rumus.',
    '**Batasan**: headcount hasil multi-skill pooling dan alokasi manpower/MHE per arus berasal dari algoritma web (ditulis sebagai nilai). Bila volume berubah besar, hitung ulang di web lalu export lagi.']),
  h2('Upload kembali ke Leca'),
  p('Ubah nilai di sheet input atau kolom Nilai sheet **Data Input** → di tab Export, bagian **Upload Excel (ubah data lewat Excel)**, pilih file .xlsx → periksa daftar perubahan → **Terapkan perubahan & hitung ulang**.'),
);

// ---------------- Bab 10
isi.push(...bab(10, 'Transportation, Intermodal & Market Price'),
  tabel(['Tab', 'Isi'], [
    ['Input rute', 'Asal–tujuan (database kota, pelabuhan, bandara), armada/moda, volume per bulan, harga beli; peta rute 3D'],
    ['Result & margin', 'Review sebelum quotation (kritis / perhatian / info) dan **Perbandingan margin**: margin global + tier (default 15% / 10% / 5%, isi bebas), harga jual per rute, pendapatan, GP, nilai kontrak; "pakai untuk semua rute"'],
    ['Quotation', 'Rate card per rute → alur quotation & approval yang sama dengan warehouse'],
    ['Simulasi 3D', 'Animasi armada (truk, kapal, kereta, pesawat) di peta rute'],
  ], [2, 6]),
  li('Margin transport = **GP% atas harga jual**: harga jual = harga beli ÷ (1 − margin).'),
  li('Tombol **Export Excel** di halaman tender transport/intermodal: sheet Ringkasan, per stage, Rute, Perbandingan Margin, Review — semua rumus.'),
  li('**Market Price (semua moda)** di menu Logistics Tender: harga pasar per moda dengan template contoh; dipakai sebagai acuan harga beli.'),
);

// ---------------- Bab 11
isi.push(...bab(11, 'Simulasi Warehouse, Price Inquiry & Productivity'),
  h2('Simulasi Warehouse'),
  li('Editor layout 2D/3D: area rak otomatis, **area kolom (grid pilar)** yang bisa ditarik, dipecah per bentang, digabung; gedung trapesium; kolom bisa digeser tanpa berubah ukuran.'),
  li('Simulasi pergerakan barang (inbound, putaway, picking) dengan MHE & manpower.'),
  h2('Price Inquiry'),
  li('Tambah/ubah harga (MHE, racking, office, gudang, IT, utilities, gudang sewa, HR). Harga baru berstatus draft dan perlu di-approve. Harga kedaluwarsa muncul sebagai red flag di tender.'),
  li('Kolom Vendor dan unggahan quotation vendor; **Comparation Price** mengurutkan vendor termurah → termahal.'),
  li('Tabel master: baris yang diubah ditandai warna; simpan lewat bar **Simpan perubahan** di bawah layar.'),
  h2('Productivity'),
  li('Produktivitas per aktivitas, tool, role & UoM, dengan benchmark per kategori bisnis. Data baru berstatus draft sampai divalidasi (Time Motion Study / benchmark / asumsi).'),
  li('Perubahan tidak otomatis mengubah tender lama — pakai **Sinkronkan dengan database** di Value Stream Mapping. Role baru sebaiknya juga ditambahkan di master Jabatan.'),
);

// ---------------- Bab 12
isi.push(...bab(12, 'Menu Super Admin & Manager'),
  tabel(['Menu', 'Fungsi'], [
    ['Approval akun', 'ACC + pilih role, Tolak, Jadikan / Cabut Super Admin (akun pemilik tidak bisa dicabut)'],
    ['Pengguna & role', 'Ubah role, Atur password (tampil sekali), Kirim link reset, Hapus akun (data kerjanya dialihkan)'],
    ['Approval quotation', 'Antrean quotation menunggu + riwayat keputusan'],
    ['Master data', 'Kalender libur, parameter keuangan (overhead, bunga, AP), margin per risiko, template T&C'],
    ['Export Excel', 'Hanya Super Admin & Manager'],
  ], [2, 6]),
);

// ---------------- Bab 13
isi.push(...bab(13, 'Tips & pertanyaan umum'),
  tabel(['Pertanyaan', 'Jawaban'], [
    ['Angka di Result berbeda dengan quotation?', 'Simpan hasil sebagai versi baru, lalu buat quotation / revisi dari hasil tersimpan'],
    ['Harga terasa mahal', 'Cek Result → porsi per kategori. Volume kecil dengan sumber daya penuh (forklift, admin, security) membuat biaya per palet tinggi — pertimbangkan sharing (Dedicated/Sharing di rincian manpower), pola Cost Allocation, dan GP%'],
    ['Supervisor muncul lagi setelah dihapus', 'Hapus baris "otomatis dari span of control" di tabel peran tetap (span = 0)'],
    ['Umur aset 48 tapi biaya ÷ 36', 'Benar: periode depresiasi = MIN(umur ekonomis, kontrak); kontrak 36 bulan'],
    ['Apakah startup otomatis masuk biaya?', 'Ya — Startup & implementation otomatis selalu masuk total biaya; kartu Startup menghitung item manual + otomatis'],
    ['Storage / handling beda jauh', 'Lihat dasar default di Cost Allocation; ubah matriks atau pakai pola cepat bila perlu'],
    ['Tombol Buat quotation tidak aktif', 'Lengkapi logo & TTD di Profil; selesaikan red flag kritis; simpan hasil dulu'],
    ['Tidak bisa unduh / print PDF', 'Quotation harus Approved; unduh & print ada di dalam Pratinjau'],
    ['Produk 1.200 CBM (tidak wajar)', 'Dimensi diisi mm tapi dibaca cm — pilih satuan mm di baris produk'],
    ['Excel menampilkan angka beda setelah saya ubah', 'Wajar bila mengubah sel input (simulasi). Sel abu-abu jangan ditimpa'],
    ['Angka jadi kecil sekali (mis. 20,369)', 'Koma = desimal. Tulis 20369 tanpa titik/koma'],
    ['Perubahan tidak muncul setelah update aplikasi', 'Muat ulang (refresh) halaman'],
  ], [3, 5]),
  spasi(),
  kotak('Butuh bantuan?', 'CP 088291919234 · Email Niuleca@gmail.com'),
);

const num = ref => ({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } }, run: { font: FONT, size: 20 } } }] });
const doc = new Document({
  creator: 'esapanghegar', title: 'Read Me — Panduan Penggunaan Leca', description: 'Panduan penggunaan Leca versi 8 November 2026',
  styles: {
    default: { document: { run: { font: FONT, size: 20, color: INK } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 34, bold: true, color: INK }, paragraph: { spacing: { before: 0, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: AKSEN }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } },
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 800, hanging: 260 } } } }] },
    num('num'), num('num1'), num('num2'),
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1300, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [t('Leca · Read Me · panduan penggunaan', { size: 16, c: MUTED })], alignment: AlignmentType.RIGHT })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      t('Leca · esapanghegar · CP 088291919234 · Niuleca@gmail.com · Halaman ', { size: 16, c: MUTED }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })] }) },
    children: isi,
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(process.argv[2] || 'Read_Me_Leca.docx', b); console.log('ok'); });
void PageBreak;
