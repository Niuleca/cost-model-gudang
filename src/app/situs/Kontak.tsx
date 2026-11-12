'use client';
import { useState } from 'react';

// Form kontak: menyusun pesan lalu membuka WhatsApp atau aplikasi email pengunjung (tanpa menyimpan data di server).
export default function Kontak() {
  const [f, setF] = useState({ nama: '', perusahaan: '', pesan: '' });
  const [salah, setSalah] = useState<string | null>(null);
  const teks = () => `Halo Leca (niuleca.com),\n\nNama: ${f.nama}\nPerusahaan: ${f.perusahaan || '-'}\n\n${f.pesan}`;
  const cek = () => { if (!f.nama.trim() || !f.pesan.trim()) { setSalah('Isi nama dan pesan dulu.'); return false; } setSalah(null); return true; };
  const wa = () => { if (cek()) window.open(`https://wa.me/6288291919234?text=${encodeURIComponent(teks())}`, '_blank', 'noopener'); };
  const email = () => { if (cek()) window.location.href = `mailto:Niuleca@gmail.com?subject=${encodeURIComponent(`Pertanyaan Leca — ${f.perusahaan || f.nama}`)}&body=${encodeURIComponent(teks())}`; };
  return (
    <form className="ld-form" onSubmit={e => { e.preventDefault(); wa(); }}>
      <label>Nama<input value={f.nama} onChange={e => setF({ ...f, nama: e.target.value })} autoComplete="name" required /></label>
      <label>Perusahaan<input value={f.perusahaan} onChange={e => setF({ ...f, perusahaan: e.target.value })} autoComplete="organization" /></label>
      <label>Pesan<textarea rows={4} value={f.pesan} onChange={e => setF({ ...f, pesan: e.target.value })} placeholder="Mis. tender gudang 5.000 m² di Cikarang, butuh cost model & layout" required /></label>
      {salah && <p className="ld-salah" role="alert">{salah}</p>}
      <div className="ld-form-tombol">
        <button type="submit" className="ld-tombol utama">Kirim via WhatsApp</button>
        <button type="button" className="ld-tombol garis gelap" onClick={email}>Kirim via email</button>
      </div>
      <p className="ld-catatan">Pesan dibuka di WhatsApp atau aplikasi email Anda, tidak disimpan di situs ini.</p>
    </form>
  );
}
