"""Panduan penggunaan Leca (PDF)."""
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, KeepTogether, NextPageTemplate)

D = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('Sans', D + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Sans-B', D + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Sans-I', D + 'DejaVuSans-Oblique.ttf'))
pdfmetrics.registerFont(TTFont('Sans-BI', D + 'DejaVuSans-BoldOblique.ttf'))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily('Sans', normal='Sans', bold='Sans-B', italic='Sans-I', boldItalic='Sans-BI')

INK = colors.HexColor('#1F2A37'); MUTED = colors.HexColor('#6B7280'); AKSEN = colors.HexColor('#2F6FD0')
BIRU_MUDA = colors.HexColor('#EAF1FB'); ABU = colors.HexColor('#F3F4F6'); GARIS = colors.HexColor('#D1D5DB')
KUNING = colors.HexColor('#FFF7E0'); KUNING_GARIS = colors.HexColor('#E8C25A')

st = {
  'h1': ParagraphStyle('h1', fontName='Sans-B', fontSize=18, leading=23, textColor=INK, spaceBefore=4, spaceAfter=6),
  'h2': ParagraphStyle('h2', fontName='Sans-B', fontSize=12.5, leading=16, textColor=INK, spaceBefore=10, spaceAfter=4),
  'p': ParagraphStyle('p', fontName='Sans', fontSize=9.5, leading=14, textColor=INK, spaceAfter=5),
  'small': ParagraphStyle('s', fontName='Sans', fontSize=8.3, leading=11.5, textColor=MUTED),
  'li': ParagraphStyle('li', fontName='Sans', fontSize=9.5, leading=14, textColor=INK, leftIndent=14, bulletIndent=3, spaceAfter=2),
  'td': ParagraphStyle('td', fontName='Sans', fontSize=8.6, leading=11.5, textColor=INK),
  'th': ParagraphStyle('th', fontName='Sans-B', fontSize=8.6, leading=11.5, textColor=INK),
  'eyebrow': ParagraphStyle('e', fontName='Sans-B', fontSize=8, leading=10, textColor=AKSEN, spaceAfter=2),
}

def P(t, s='p'): return Paragraph(t, st[s])
def L(items): return [Paragraph(x, st['li'], bulletText='•') for x in items]
def N(items): return [Paragraph(x, st['li'], bulletText=f'{i + 1}.') for i, x in enumerate(items)]

def tabel(rows, w, head=True):
    data = [[Paragraph(str(c), st['th' if (head and i == 0) else 'td']) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=w, repeatRows=1 if head else 0)
    s = [('GRID', (0, 0), (-1, -1), 0.4, GARIS), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
         ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5), ('TOPPADDING', (0, 0), (-1, -1), 3.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5)]
    if head: s.append(('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#C0C0C0')))
    t.setStyle(TableStyle(s))
    return t

def kotak(teks, judul='Catatan', warna=BIRU_MUDA, garis=AKSEN):
    t = Table([[Paragraph(f'<b>{judul}</b><br/>{teks}', st['td'])]], colWidths=[170 * mm])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), warna), ('LINEBEFORE', (0, 0), (0, -1), 3, garis),
                           ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    return t

def alur(langkah):
    """Diagram alur horizontal: kotak bernomor."""
    sel = []
    for i, (j, k) in enumerate(langkah):
        sel.append(Paragraph(f'<font size=7 color="#2F6FD0"><b>{i + 1}</b></font><br/><b>{j}</b><br/><font size=7 color="#6B7280">{k}</font>', ParagraphStyle('a', parent=st['td'], alignment=TA_CENTER, fontSize=8, leading=10)))
    w = 170 * mm / len(sel)
    t = Table([sel], colWidths=[w] * len(sel))
    t.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.5, GARIS), ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.white),
                           ('BACKGROUND', (0, 0), (-1, -1), BIRU_MUDA), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7)]))
    return t

def halaman(c, doc):
    c.saveState()
    w, h = A4
    c.setFillColor(INK); c.rect(0, h - 14 * mm, w, 14 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white); c.setFont('Sans-B', 10); c.drawString(20 * mm, h - 9 * mm, 'Leca')
    c.setFont('Sans', 8); c.setFillColor(colors.HexColor('#C9D3E0')); c.drawString(31 * mm, h - 9 * mm, 'Panduan penggunaan · cost model, tender & quotation gudang')
    c.setFillColor(MUTED); c.setFont('Sans', 7.5)
    c.drawString(20 * mm, 10 * mm, 'Leca · dibuat oleh esapanghegar · CP 088291919234 · Niuleca@gmail.com')
    c.drawRightString(w - 20 * mm, 10 * mm, f'Halaman {doc.page}')
    c.restoreState()

def sampul(c, doc):
    c.saveState()
    w, h = A4
    c.setFillColor(INK); c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(AKSEN); c.rect(20 * mm, h - 95 * mm, 18 * mm, 2.2 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white); c.roundRect(20 * mm, h - 70 * mm, 16 * mm, 16 * mm, 3 * mm, fill=1, stroke=0)
    c.setFillColor(INK); c.setFont('Sans-B', 13); c.drawCentredString(28 * mm, h - 64 * mm, 'L')
    c.setFillColor(colors.white); c.setFont('Sans-B', 34); c.drawString(20 * mm, h - 120 * mm, 'Panduan Penggunaan')
    c.setFont('Sans-B', 34); c.drawString(20 * mm, h - 135 * mm, 'Leca')
    c.setFont('Sans', 12); c.setFillColor(colors.HexColor('#C9D3E0'))
    c.drawString(20 * mm, h - 150 * mm, 'Cost model, tender & quotation gudang — dari input sampai Excel ber-rumus')
    c.setFont('Sans', 9.5)
    for i, t in enumerate(['Untuk: Super Admin · Manager · Solution Design · Business Development · Procurement · IT · HR · Operational',
                           'Alamat aplikasi: costmodel.esapanghegar.my.id', 'Versi Oktober 2026']):
        c.drawString(20 * mm, 45 * mm - i * 6 * mm, t)
    c.setFillColor(colors.white); c.setFont('Sans-B', 9.5); c.drawString(20 * mm, 22 * mm, 'by esapanghegar')
    c.restoreState()

def bangun(out):
    doc = BaseDocTemplate(out, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=22 * mm, bottomMargin=18 * mm,
                          title='Panduan Penggunaan Leca', author='esapanghegar', subject='Cara penggunaan aplikasi Leca')
    fr = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
    doc.addPageTemplates([PageTemplate(id='sampul', frames=[fr], onPage=sampul), PageTemplate(id='isi', frames=[fr], onPage=halaman)])
    s = [NextPageTemplate('isi'), PageBreak()]

    # ---- Daftar isi
    s += [P('DAFTAR ISI', 'eyebrow'), P('Isi panduan', 'h1')]
    s.append(tabel([['Bab', 'Topik'],
        ['1', 'Mengenal Leca & alur kerja'], ['2', 'Akun: daftar, ACC, role & hak akses'], ['3', 'Profil: data diri, logo & tanda tangan, email & password'],
        ['4', 'Membuat tender baru'], ['5', 'Mengisi tender langkah demi langkah (tab 1–8)'], ['6', 'Membaca Hasil: KPI, rate card, kategori biaya, revisi'],
        ['7', 'Quotation: nomor, approval, pratinjau, print & unduh'], ['8', 'Export Excel ber-rumus'], ['9', 'Price Inquiry & Productivity'],
        ['10', 'Menu Super Admin & Manager'], ['11', 'Tips & pertanyaan umum']], [18 * mm, 152 * mm]))

    # ---- 1
    s += [PageBreak(), P('BAB 1', 'eyebrow'), P('Mengenal Leca & alur kerja', 'h1'),
          P('Leca menghitung <b>cost model gudang</b> (manpower, space, MHE, IT, biaya lain, interest) lalu menyusun <b>rate card</b> dan <b>quotation</b> PDF. '
            'Semua angka bisa ditelusuri: dari input di web sampai rumus di file Excel.'),
          Spacer(1, 4), alur([('Daftar', 'akun baru'), ('ACC', 'oleh Admin'), ('Profil', 'logo & TTD'), ('Tender', 'isi 8 tab'), ('Hasil', 'cek & revisi'), ('Quotation', 'approval'), ('Export', 'Excel')]),
          Spacer(1, 8), P('Navigasi utama', 'h2'),
          tabel([['Menu', 'Isi'],
                 ['Dashboard', 'Ringkasan pipeline, status project, heatmap backlog'],
                 ['Tender', 'New Tender · Draft Tender · Comparation Tender · Riwayat Tender · Approval quotation (Manager/Super Admin) · Implementation'],
                 ['Price Inquiry', 'Database harga: MHE, racking, office, gudang, IT, utilities, gudang sewa, HR (UMK, jabatan, payroll)'],
                 ['Productivity', 'Database produktivitas per aktivitas & UoM'],
                 ['Menu akun (kanan atas)', 'Pengguna & role · Approval akun · Master data · Profil & password · Keluar'],
                 ['Pemilih bahasa (ikon bola dunia)', 'Indonesia · English · Korea · Jepang'],
                 ['? Cara penggunaan', 'Membuka panduan ini']], [42 * mm, 128 * mm])]

    # ---- 2
    s += [PageBreak(), P('BAB 2', 'eyebrow'), P('Akun: daftar, ACC, role & hak akses', 'h1'), P('Mendaftar', 'h2')]
    s += N(['Buka halaman login → <b>Buat akun</b>. Isi nama lengkap, email, password (min. 8 karakter).',
            'Buka email dan klik link konfirmasi dari Leca/Supabase.',
            'Login. Akun berstatus <b>Menunggu persetujuan</b> — belum bisa membuka data apa pun.',
            'Admin meng-<b>ACC</b> dan memberi role. Setelah itu muat ulang halaman; menu terbuka sesuai role.'])
    s.append(kotak('Butuh dipercepat? Hubungi CP 088291919234 / Niuleca@gmail.com.', 'Menunggu ACC'))
    s += [P('Hirarki role & hak akses', 'h2'),
          tabel([['Role', 'Tender & quotation', 'Approval quotation', 'Input harga (Price Inquiry)', 'Productivity', 'Export Excel'],
                 ['Super Admin', 'Ya', 'Ya (approve sendiri)', 'Ya', 'Ya', 'Ya'],
                 ['Manager', 'Ya', 'Ya — approve pekerjaan SD & BD', 'Ya', 'Ya', 'Ya'],
                 ['Solution Design', 'Ya — unduh/print/kirim setelah di-approve', 'Ajukan', 'Ya', 'Ya', '—'],
                 ['Business Development', 'Ya — unduh/print/kirim setelah di-approve', 'Ajukan', 'Ya', 'Ya', '—'],
                 ['Procurement · IT · HR', '—', '—', 'Ya', '—', '—'],
                 ['Operational', '—', '—', '—', 'Ya', '—']], [32 * mm, 36 * mm, 30 * mm, 28 * mm, 22 * mm, 22 * mm]),
          Spacer(1, 6), kotak('Password tidak bisa dilihat siapa pun (disimpan terenkripsi). Kalau lupa: minta Super Admin <b>Atur password</b> '
                              '(password baru ditampilkan sekali) atau pakai <b>Lupa password</b> di halaman login.', 'Keamanan')]

    # ---- 3
    s += [PageBreak(), P('BAB 3', 'eyebrow'), P('Profil: data diri, logo & tanda tangan', 'h1'),
          P('Buka menu akun (kanan atas) → <b>Profil &amp; password</b>.'),
          tabel([['Isian', 'Keterangan'],
                 ['Nama lengkap', 'Dipakai di tanda tangan PDF & inisial nomor quotation (mis. Muhammad esa panghegar → MEP)'],
                 ['User ID', 'Unik, huruf kecil/angka/titik/_/- (3–30 karakter)'],
                 ['Nomor telepon', 'Opsional'], ['Email · Role', 'Baca saja. Email diganti lewat bagian <b>Ganti email</b>; role diatur Admin'],
                 ['Perusahaan', 'Dipakai di kop PDF & inisial nomor quotation (PT Kamadjaja Logistics → PKL)'],
                 ['Jabatan', 'Dipakai di tanda tangan PDF']], [36 * mm, 134 * mm]),
          P('Logo perusahaan & tanda tangan (wajib)', 'h2'),
          P('Role yang membuat quotation (Super Admin, Manager, SD, BD, Finance) <b>wajib</b> mengunggah logo dan TTD. Sebelum lengkap, muncul pengingat di setiap halaman '
            'dan tombol <i>Buat quotation</i> serta unduh PDF terkunci.'),
          *L(['Format PNG/JPG/WEBP, maks. 2 MB; PNG latar transparan paling rapi.', 'Satu logo + satu TTD per akun — unggah baru menggantikan yang lama.',
              'Quotation otomatis memakai logo & TTD milik akun yang sedang login.']),
          P('Ganti email & password', 'h2'),
          *L(['<b>Ganti email</b>: isi email baru → klik link konfirmasi di email baru (dan email lama bila diminta).',
              '<b>Ganti password</b>: isi password baru (min. 8 karakter) → Simpan password.'])]

    # ---- 4
    s += [PageBreak(), P('BAB 4', 'eyebrow'), P('Membuat tender baru', 'h1'), P('Menu <b>Tender → New Tender</b>.'),
          tabel([['Isian', 'Cara isi'],
                 ['Customer', 'Nama perusahaan customer (dipakai di nomor quotation: PT Otsuka Indonesia → POI)'],
                 ['Industri', 'Untuk benchmark produktivitas'], ['Tipe gudang', 'Ambient / cold / dll.'],
                 ['Provinsi · Kab/Kota', 'Menentukan UMK (upah minimum berlaku tampil otomatis)'],
                 ['Durasi kontrak', 'Bulan — dasar depresiasi, amortisasi, interest & kenaikan upah'],
                 ['Rencana go-live', 'Dasar kalender & mulai kontrak'], ['Jumlah shift · Payment term · Skenario aset', 'Rental / Own Asset / Built-to-Suit']],
                [44 * mm, 126 * mm]),
          Spacer(1, 6), P('Tekan <b>Buat tender &amp; lanjut isi asumsi</b>. Tender tersimpan sebagai draft dan hanya bisa diedit pembuatnya, Manager, atau Super Admin.'),
          kotak('Tombol <b>Simpan</b> dan <b>Hitung</b> ada di atas dan bawah setiap tab. <b>Undo/Redo</b> (Ctrl+Z / Ctrl+Y) membatalkan perubahan input. '
                'Simpan sesering mungkin.', 'Kebiasaan baik')]

    # ---- 5
    s += [PageBreak(), P('BAB 5', 'eyebrow'), P('Mengisi tender langkah demi langkah', 'h1'),
          alur([('Asumsi', 'key assumption'), ('Volume', 'palet/order'), ('Aktivitas', '& manpower'), ('Gudang', 'space & MHE'), ('Interest', 'pinjaman'), ('IT', 'sistem'), ('Biaya lain', 'opex/capex'), ('Hasil', 'cek')]),
          P('1 · Key assumption', 'h2'),
          *L(['Provinsi & area (UMK), hari kerja per minggu, jam efektif, cuti, faktor produktivitas & efisiensi.', 'Span of control supervisor dan peran tetap (SPV, security, dll.).']),
          P('2 · Volume', 'h2'),
          *L(['Isi volume per arus (storage, inbound, outbound) per bulan: <b>rata-rata, peak, komitmen (MGV)</b>.', 'Konversi palet → case → pcs dengan pilihan UoM.',
              '<b>Parameter muatan</b>: kg & CBM per palet / per case — satu sumber untuk tarif storage alternatif (per kg/CBM) dan profil order.',
              '<b>Profil order</b>: volume/bln ÷ hari operasional, dibagi per moda (kontainer, truk) → jumlah mobil/hari & order admin.']),
          P('3 · Aktivitas & manpower', 'h2'),
          *L(['Pilih aktivitas dari database Productivity; atur % volume dan tool (RT, RF, PC…).',
              'Process Design menghitung: workload → RfR → man hour → <b>FTE</b> → headcount (dibulatkan & di-pooling multi-skill).',
              '<b>Matriks rangkap</b>: atur siapa boleh merangkap siapa. TKBM & Helper tidak bisa rangkap; admin tidak boleh menggantikan operator RT/CB.',
              '<b>Biaya manpower</b>: gaji = UMK × % level jabatan, BPJS TK/KS/JP, THR, kompensasi, management fee; <b>Dedicated/Sharing</b> (porsi 0,5 = dibagi 2 project).',
              '<b>Kenaikan upah</b> setiap Januari (default 5%), biaya/bln = total kontrak ÷ bulan kontrak.']),
          P('4 · Gudang, space & MHE', 'h2'),
          *L(['Pilih gudang dari database (pakai per m² atau sewa utuh).', 'Space: rak selective/double deep, block stack, staging, fasilitas → total m².', 'MHE: sewa atau beli, umur, % spare.']),
          P('5 · Interest cost', 'h2'),
          *L(['Bunga <b>tidak dihitung otomatis</b>. Pilih capex yang dibiayai pinjaman bank, atau tambah baris manual (mis. sewa gudang dibayar di muka).',
              'Isi bunga %/thn, metode (flat / menurun), pokok & tenor. Interest cost/bln = total bunga ÷ bulan kontrak.']),
          P('6 · IT  &  7 · Biaya lain', 'h2'),
          *L(['IT dari katalog: bulanan, tahunan ÷ 12, OTC didepresiasi/diamortisasi, atau ditagih terpisah.',
              'Biaya lain: office, HSE, consumable, asuransi, pest control, startup & implementation otomatis (% OPEX / % manpower).'])]

    # ---- 6
    s += [PageBreak(), P('BAB 6', 'eyebrow'), P('Membaca Hasil', 'h1'),
          P('Tab <b>Hasil</b> selalu dihitung ulang dari input terbaru saat dibuka. Bila hasil berbeda dengan versi tersimpan, muncul pesan <i>belum disimpan</i> — tekan '
            '<b>Simpan hasil sebagai versi baru</b> agar quotation & export memakai angka ini.'),
          tabel([['Bagian', 'Isi & cara pakai'],
                 ['KPI', 'Cost, selling (bersih PPh), profit, GP %, jumlah manpower, luas gudang'],
                 ['Red flag', 'Peringatan (kritis/peringatan/info). Bisa disembunyikan/ditampilkan. Red flag kritis harus diselesaikan sebelum quotation'],
                 ['Rate card & margin', 'Tarif per layanan; ubah GP manual, PPh/PPN, satuan tarif (palet, case, m², CBM, kg…)'],
                 ['Porsi biaya per kategori', 'Klik kategori → terbuka di tab baru; harga tiap baris bisa <b>direvisi</b> dan disimpan sebagai versi baru'],
                 ['Opex vs capex', 'Porsi biaya operasional, depresiasi/amortisasi investasi, dan interest cost'],
                 ['Kebutuhan manpower & MHE', 'Jumlah orang/unit & utilisasi (biayanya ada di rincian biaya)'],
                 ['Rincian biaya per bulan', 'Dikelompokkan per kategori, baris yang direvisi diberi label']], [44 * mm, 126 * mm])]

    # ---- 7
    s += [PageBreak(), P('BAB 7', 'eyebrow'), P('Quotation & approval', 'h1'),
          P('Nomor quotation otomatis', 'h2'),
          tabel([['Bagian', 'Sumber', 'Contoh'],
                 ['Tanggal', 'ddmmyy', '191026'], ['Perusahaan Anda', 'Profil → Perusahaan', 'PKL'], ['Customer', 'Isian Kepada', 'POI'],
                 ['Akun', 'Nama profil', 'MEP'], ['Pembuatan ke-', '001 = pertama, 002 = revisi 1', '001'], ['Urutan hari ini', 'Semua tender', '001']],
                [40 * mm, 80 * mm, 50 * mm]),
          P('Contoh lengkap: <b>191026/PKL/POI/MEP/001/001</b>'),
          P('Alur approval', 'h2'),
          tabel([['Status', 'Artinya', 'Yang bisa dilakukan'],
                 ['Draft', 'Baru dibuat', 'SD/BD: Ajukan approval · Manager/Super Admin: Approve sendiri / Revisi / Tolak'],
                 ['Menunggu approval', 'Diajukan SD/BD', 'Manager/Super Admin: Approve · Revisi (catatan wajib) · Tolak (catatan wajib)'],
                 ['Perlu revisi', 'Diminta perbaikan', 'Pembuat: Edit → Ajukan approval lagi'],
                 ['Ditolak', 'Tidak disetujui', 'Edit ulang atau hapus'],
                 ['Approved', 'Disetujui', 'Pratinjau → <b>Print / Unduh PDF</b> · Tandai terkirim · Buat revisi · <b>Batalkan approve</b>'],
                 ['Terkirim', 'Sudah dikirim ke customer', 'Buat revisi']], [30 * mm, 36 * mm, 104 * mm]),
          Spacer(1, 6), kotak('Print dan unduh PDF hanya ada di dalam <b>Pratinjau</b> dan hanya setelah <b>Approved</b>. Di bawah status tertulis siapa yang approve '
                              '(dan "approval sendiri" bila pembuatnya sendiri). <b>Batalkan approve</b> mengembalikan ke Menunggu approval.', 'Penting'),
          P('Manager / Super Admin melihat antrean di <b>Tender → Approval quotation</b>.', 'p')]

    # ---- 8
    s += [PageBreak(), P('BAB 8', 'eyebrow'), P('Export Excel ber-rumus', 'h1'),
          P('Tab <b>Export</b> (hanya Super Admin & Manager): tekan <b>Siapkan review</b> → periksa tiap sheet → centang sheet yang diperlukan → <b>Unduh</b>. '
            'Nama file: <b>Leca_Costmodel_191026_PKL_POI_MEP_001_001.xlsx</b>.'),
          tabel([['Sheet', 'Isi (semua angka hasil = rumus Excel)'],
                 ['0 Ringkasan', 'KPI, rate card, porsi biaya, opex vs capex — merujuk sheet perhitungan'],
                 ['1 Key Assumption', 'Kontrak, shift, kalender, jam tersedia MP/MHE, keuangan, margin, UMK'],
                 ['2 Volume', 'Rata-rata, peak, komitmen → volume desain per hari/shift'],
                 ['3 Process Design', 'Workload → RfR → man hour → FTE · Man Power & MHE Summary'],
                 ['4 Biaya Manpower', 'Gaji, BPJS, THR, kompensasi, fee, eskalasi'],
                 ['5 Space & MHE', 'Luas, sewa, racking, MHE, listrik'], ['6 Interest cost', 'Pokok × bunga × tenor ÷ kontrak'],
                 ['7 IT & Biaya lain', 'Bulanan, depresiasi, amortisasi, startup'], ['8 Rincian Biaya', 'Semua baris + alokasi ke layanan'],
                 ['9 Rate Card', 'Margin, PPh gross-up, pembulatan tarif, simulasi pendapatan'], ['Master Data · Data Mentah', 'Data master & seluruh isi untuk audit']],
                [40 * mm, 130 * mm]),
          P('Warna sel', 'h2'),
          tabel([['Warna', 'Arti'], ['Silver (header)', 'Header rumus / hasil'], ['Abu-abu muda (header)', 'Header input'],
                 ['Putih tulang', 'Sel input — boleh diubah untuk simulasi'], ['Abu-abu', 'Sel hasil rumus — jangan ditimpa']], [50 * mm, 120 * mm]),
          Spacer(1, 6), kotak('Headcount di sheet 3 adalah hasil pooling multi-skill dari web (input). Bila volume berubah besar, hitung ulang di web lalu export lagi.', 'Batasan')]

    # ---- 9
    s += [PageBreak(), P('BAB 9', 'eyebrow'), P('Price Inquiry & Productivity', 'h1'),
          *L(['<b>Price Inquiry</b>: tambah/ubah harga (MHE, racking, office, gudang, IT, utilities, gudang sewa, HR). Harga baru berstatus draft dan perlu di-approve '
              '(Solution Design / Manager / Super Admin). Harga kedaluwarsa muncul sebagai red flag di tender.',
              '<b>Productivity</b>: produktivitas per aktivitas & UoM yang dipakai Process Design.',
              'Siapa yang mengubah: lihat tabel hak akses di Bab 2.']),
          P('BAB 10', 'eyebrow'), P('Menu Super Admin & Manager', 'h1'),
          tabel([['Menu', 'Fungsi'],
                 ['Approval akun', 'ACC + pilih role, Tolak, Jadikan / Cabut Super Admin (akun pemilik tidak bisa dicabut)'],
                 ['Pengguna & role', 'Ubah role, Atur password (tampil sekali), Kirim link reset, Hapus akun (data kerjanya dialihkan, tidak hilang)'],
                 ['Approval quotation', 'Antrean quotation menunggu + riwayat keputusan'],
                 ['Master data', 'Kalender libur, parameter keuangan, margin per risiko, template T&C']], [40 * mm, 130 * mm])]

    # ---- 11
    s += [PageBreak(), P('BAB 11', 'eyebrow'), P('Tips & pertanyaan umum', 'h1'),
          tabel([['Pertanyaan', 'Jawaban'],
                 ['Angka di Hasil berbeda dengan quotation?', 'Simpan hasil sebagai versi baru, lalu buat quotation / revisi dari hasil tersimpan'],
                 ['Tombol Buat quotation tidak aktif', 'Lengkapi logo & TTD di Profil; selesaikan red flag kritis; simpan hasil dulu'],
                 ['Tidak bisa unduh / print PDF', 'Quotation harus Approved; unduh & print ada di dalam Pratinjau'],
                 ['Akun baru tidak bisa membuka menu', 'Menunggu ACC Admin — hubungi CP 088291919234 / Niuleca@gmail.com'],
                 ['Lupa password', 'Lupa password di halaman login, atau minta Super Admin Atur password'],
                 ['Perubahan tidak muncul setelah update aplikasi', 'Muat ulang (refresh) halaman'],
                 ['Excel menampilkan angka beda setelah saya ubah', 'Wajar bila Anda mengubah sel input — itu simulasi. Sel abu-abu jangan ditimpa'],
                 ['Bahasa', 'Pilih di pemilih bahasa (ikon bola dunia) di menu atas: ID / EN / KO / JA']], [64 * mm, 106 * mm]),
          Spacer(1, 10), kotak('CP 088291919234 · Email Niuleca@gmail.com', 'Butuh bantuan?', KUNING, KUNING_GARIS)]
    doc.build(s)

if __name__ == '__main__':
    bangun(sys.argv[1])
