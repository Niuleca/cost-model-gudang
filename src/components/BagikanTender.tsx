'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Akses = { id: number; user_id: string | null; tim_id: string | null; hak: 'lihat' | 'edit'; nama: string; keterangan: string };
type Tim = { id: string; nama: string };

const LABEL_HAK = { lihat: 'Lihat saja', edit: 'Boleh edit' } as const;

/** Tombol + dialog berbagi project: ke orang tertentu (email/username), ke tim, atau contoh publik (admin). */
export default function BagikanTender({ tenderId, bolehKelola, bolehContoh, contohPublik, onContoh }: {
  tenderId: string; bolehKelola: boolean; bolehContoh: boolean; contohPublik: boolean; onContoh: (v: boolean) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [akses, setAkses] = useState<Akses[] | null>(null);
  const [timSaya, setTimSaya] = useState<Tim[]>([]);
  const [kunci, setKunci] = useState('');
  const [hakBaru, setHakBaru] = useState<'lihat' | 'edit'>('lihat');
  const [timPilih, setTimPilih] = useState('');
  const [hakTim, setHakTim] = useState<'lihat' | 'edit'>('edit');
  const [pesan, setPesan] = useState<{ jenis: 'ok' | 'error'; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    const sb = supabaseBrowser();
    const [a, t] = await Promise.all([
      sb.rpc('daftar_akses_tender', { p_tender: tenderId }),
      sb.from('tim').select('id, nama').order('nama'),
    ]);
    setAkses(a.error ? [] : (a.data ?? []) as Akses[]);
    setTimSaya((t.data ?? []) as Tim[]);
  }, [tenderId]);
  useEffect(() => { muat(); }, [muat]);

  useEffect(() => {
    if (!buka) return;
    const tutup = (e: KeyboardEvent) => { if (e.key === 'Escape') setBuka(false); };
    window.addEventListener('keydown', tutup);
    return () => window.removeEventListener('keydown', tutup);
  }, [buka]);

  const jumlah = akses?.length ?? 0;
  const ringkas = contohPublik ? 'Contoh publik' : jumlah ? `Dibagikan · ${jumlah}` : 'Pribadi';

  async function tambahOrang(e: React.FormEvent) {
    e.preventDefault(); setPesan(null);
    const k = kunci.trim();
    if (k.length < 3) { setPesan({ jenis: 'error', teks: 'Isi email atau username lengkap.' }); return; }
    setSibuk(true);
    const sb = supabaseBrowser();
    const { data, error } = await sb.rpc('cari_pengguna', { p_kunci: k });
    const org = (data ?? [])[0] as { id: string; nama: string } | undefined;
    if (error || !org) { setSibuk(false); setPesan({ jenis: 'error', teks: 'Pengguna tidak ditemukan. Pastikan email/username persis sama dan akunnya sudah aktif.' }); return; }
    const { error: e2 } = await sb.from('tender_akses').insert({ tender_id: tenderId, user_id: org.id, hak: hakBaru });
    setSibuk(false);
    if (e2) { setPesan({ jenis: 'error', teks: e2.code === '23505' ? `${org.nama} sudah punya akses. Ubah haknya di daftar.` : 'Gagal membagikan. Hanya pembuat project yang bisa mengatur berbagi.' }); return; }
    setKunci(''); setPesan({ jenis: 'ok', teks: `Dibagikan ke ${org.nama} (${LABEL_HAK[hakBaru].toLowerCase()}).` }); muat();
  }

  async function tambahTim() {
    if (!timPilih) return;
    setPesan(null); setSibuk(true);
    const { error } = await supabaseBrowser().from('tender_akses').insert({ tender_id: tenderId, tim_id: timPilih, hak: hakTim });
    setSibuk(false);
    if (error) { setPesan({ jenis: 'error', teks: error.code === '23505' ? 'Tim ini sudah punya akses.' : 'Gagal membagikan ke tim.' }); return; }
    setTimPilih(''); setPesan({ jenis: 'ok', teks: 'Dibagikan ke tim.' }); muat();
  }

  async function ubahHak(a: Akses, hak: 'lihat' | 'edit') {
    const { error } = await supabaseBrowser().from('tender_akses').update({ hak }).eq('id', a.id);
    if (error) setPesan({ jenis: 'error', teks: 'Gagal mengubah hak.' }); else muat();
  }
  async function cabut(a: Akses) {
    const { error } = await supabaseBrowser().from('tender_akses').delete().eq('id', a.id);
    if (error) setPesan({ jenis: 'error', teks: 'Gagal mencabut akses.' }); else { setPesan({ jenis: 'ok', teks: `Akses ${a.nama} dicabut.` }); muat(); }
  }
  async function aturContoh(v: boolean) {
    const { error } = await supabaseBrowser().from('tenders').update({ contoh_publik: v }).eq('id', tenderId);
    if (error) setPesan({ jenis: 'error', teks: 'Hanya admin yang bisa mengatur contoh publik.' }); else onContoh(v);
  }

  const timBelum = timSaya.filter(t => !akses?.some(a => a.tim_id === t.id));

  return (
    <>
      <button type="button" className="ghost" onClick={() => { setBuka(true); setPesan(null); muat(); }} aria-haspopup="dialog">
        Bagikan <span className="small muted">({ringkas})</span>
      </button>
      {buka && (
        <div className="pv-latar" role="dialog" aria-modal="true" aria-labelledby="judul-bagikan" onClick={e => { if (e.target === e.currentTarget) setBuka(false); }}>
          <div className="pv-kotak bagi-kotak">
            <div className="pv-bar"><b id="judul-bagikan">Bagikan project</b><span style={{ flex: 1 }} /><button type="button" onClick={() => setBuka(false)}>Tutup</button></div>
            <div className="bagi-isi">
              <p className="small muted" style={{ margin: 0 }}>
                {jumlah || contohPublik ? 'Selain Anda, project ini bisa dibuka oleh:' : 'Project ini pribadi — hanya Anda yang bisa membukanya.'}
              </p>

              {akses && akses.length > 0 && (
                <ul className="bagi-daftar">
                  {akses.map(a => (
                    <li key={a.id}>
                      <div><b>{a.nama}</b> <span className="small muted">{a.tim_id ? `Tim · ${a.keterangan}` : a.keterangan ? `@${a.keterangan}` : ''}</span></div>
                      {bolehKelola ? (
                        <div className="row" style={{ margin: 0, gap: 6 }}>
                          <select aria-label={`Hak ${a.nama}`} value={a.hak} onChange={e => ubahHak(a, e.target.value as 'lihat' | 'edit')} style={{ width: 'auto' }}>
                            <option value="lihat">{LABEL_HAK.lihat}</option><option value="edit">{LABEL_HAK.edit}</option>
                          </select>
                          <button type="button" className="ghost" onClick={() => cabut(a)}>Cabut</button>
                        </div>
                      ) : <span className="pill info">{LABEL_HAK[a.hak]}</span>}
                    </li>
                  ))}
                </ul>
              )}

              {bolehKelola ? (
                <>
                  <form className="bagi-form" onSubmit={tambahOrang}>
                    <label className="f" htmlFor="bagi-kunci">Bagikan ke orang
                      <input id="bagi-kunci" value={kunci} onChange={e => setKunci(e.target.value)} placeholder="Email atau username" autoComplete="off" />
                    </label>
                    <select aria-label="Hak untuk orang ini" value={hakBaru} onChange={e => setHakBaru(e.target.value as 'lihat' | 'edit')}>
                      <option value="lihat">{LABEL_HAK.lihat}</option><option value="edit">{LABEL_HAK.edit}</option>
                    </select>
                    <button type="submit" disabled={sibuk}>Tambahkan</button>
                  </form>

                  <div className="bagi-form">
                    <label className="f" htmlFor="bagi-tim">Bagikan ke tim
                      <select id="bagi-tim" value={timPilih} onChange={e => setTimPilih(e.target.value)} disabled={!timBelum.length}>
                        <option value="">{timSaya.length ? (timBelum.length ? '— pilih tim —' : 'Semua tim Anda sudah ditambahkan') : 'Anda belum punya tim'}</option>
                        {timBelum.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                      </select>
                    </label>
                    <select aria-label="Hak untuk tim" value={hakTim} onChange={e => setHakTim(e.target.value as 'lihat' | 'edit')}>
                      <option value="lihat">{LABEL_HAK.lihat}</option><option value="edit">{LABEL_HAK.edit}</option>
                    </select>
                    <button type="button" onClick={tambahTim} disabled={sibuk || !timPilih}>Tambahkan</button>
                  </div>
                  <p className="small muted" style={{ margin: 0 }}><Link href="/akun/tim">Atur tim Anda</Link> — anggota tim otomatis ikut melihat project yang dibagikan ke tim.</p>
                </>
              ) : <p className="small muted" style={{ margin: 0 }}>Hanya pembuat project yang bisa mengubah pengaturan berbagi.</p>}

              {bolehContoh && (
                <label className="bagi-contoh">
                  <input type="checkbox" checked={contohPublik} onChange={e => aturContoh(e.target.checked)} />
                  <span><b>Contoh publik</b> — semua pengguna, termasuk penguji, bisa melihat (tanpa mengubah). Pakai hanya untuk data contoh, bukan data customer asli.</span>
                </label>
              )}

              {pesan && <p className={pesan.jenis === 'ok' ? 'ok small' : 'error small'} role="status" style={{ margin: 0 }}>{pesan.teks}</p>}
              <p className="small muted" style={{ margin: 0 }}>Super Admin aplikasi tetap bisa membuka semua project.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
