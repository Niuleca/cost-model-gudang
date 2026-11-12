'use client';
import { useState } from 'react';

// Sorotan 3D: simulasi operasi gudang & mode jelajah (gambar asli dari aplikasi Leca).
const TAB = [
  {
    k: 'sim', label: 'Simulasi operasi 3D', gambar: 'simulasi-3d',
    alt: 'Simulasi operasi 3D di Leca: truk di dock inbound & outbound, rak terisi palet, pelacakan order dan status dock',
    judul: 'Gudang berjalan sebelum dibangun',
    isi: 'Layout yang Anda gambar langsung hidup: truk datang ke dock, palet dibongkar ke staging, disimpan ke rak, lalu dipick dan dimuat lagi, jam demi jam.',
    poin: ['Pelacakan order dari order masuk sampai terkirim', 'Status dock, MHE & truk secara langsung', 'Percepat 1× sampai 1 jam/detik, lompat ke shift berikutnya', 'Red flag operasi: antrean dock, MHE sibuk, staging penuh'],
  },
  {
    k: 'jelajah', label: 'Mode jelajah', gambar: 'mode-jelajah',
    alt: 'Mode jelajah Leca: berjalan di lorong rak sebagai operator, dengan panel motion study dan time study',
    judul: 'Masuk dan berjalan di lorong gudang',
    isi: 'Jalankan karakter operator di antara rak untuk merasakan lebar lorong, tinggi rak, dan jarak tempuh, atau naik forklift dan reach truck.',
    poin: ['Jalan, lari & lompat (keyboard atau tombol layar sentuh)', 'Pilih peran: picker, checker, forklift, reach truck, admin', 'Motion study & time study: siklus, output per jam, utilisasi', 'Bisa dibuka dari laptop maupun HP'],
  },
] as const;

export default function Pamer3D() {
  const [aktif, setAktif] = useState<(typeof TAB)[number]['k']>('sim');
  const t = TAB.find(x => x.k === aktif)!;
  return (
    <div className="ld-pamer">
      <div className="ld-pamer-tab" role="tablist" aria-label="Sorotan 3D">
        {TAB.map(x => (
          <button key={x.k} role="tab" type="button" aria-selected={x.k === aktif} className={x.k === aktif ? 'on' : ''} onClick={() => setAktif(x.k)}>{x.label}</button>
        ))}
      </div>
      <div className="ld-pamer-isi">
        <figure className="ld-pamer-gambar">
          {TAB.map(x => (
            <picture key={x.k} className={x.k === aktif ? 'on' : ''} aria-hidden={x.k !== aktif}>
              <source media="(max-width: 700px)" srcSet={`/situs/${x.gambar}-800.webp`} />
              <img src={`/situs/${x.gambar}.webp`} alt={x.alt} width={1374} height={860} loading="lazy" decoding="async" />
            </picture>
          ))}
        </figure>
        <div className="ld-pamer-teks" role="tabpanel">
          <h3>{t.judul}</h3>
          <p>{t.isi}</p>
          <ul className="ld-cek terang">{t.poin.map(p => <li key={p}>{p}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
