'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';

type Tim = { id: string; nama: string; pemilik: string };
type Anggota = { user_id: string; nama: string; username: string | null; pemilik: boolean };

/** Tim untuk berbagi project: buat tim, tambah anggota lewat email/username, pilih tim bawaan untuk project baru. */
export default function HalamanTim() {
  const { profile } = useProfile();
  const [tim, setTim] = useState<Tim[] | null>(null);
  const [anggota, setAnggota] = useState<Record<string, Anggota[]>>({});
  const [bawaan, setBawaan] = useState<string | null>(null);
  const [namaBaru, setNamaBaru] = useState('');
  const [tambah, setTambah] = useState<Record<string, string>>({});
  const [pesan, setPesan] = useState<{ jenis: 'ok' | 'error'; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    if (!profile) return;
    const sb = supabaseBrowser();
    const [t, p] = await Promise.all([
      sb.from('tim').select('id, nama, pemilik').order('created_at'),
      sb.from('profiles').select('tim_bawaan').eq('id', profile.id).maybeSingle(),
    ]);
    const daftar = (t.data ?? []) as Tim[];
    setTim(daftar);
    setBawaan((p.data as { tim_bawaan: string | null } | null)?.tim_bawaan ?? null);
    const isi = await Promise.all(daftar.map(x => sb.rpc('anggota_tim', { p_tim: x.id })));
    setAnggota(Object.fromEntries(daftar.map((x, i) => [x.id, (isi[i].data ?? []) as Anggota[]])));
  }, [profile]);
  useEffect(() => { muat(); }, [muat]);

  const lapor = (jenis: 'ok' | 'error', teks: string) => setPesan({ jenis, teks });

  async function buatTim(e: React.FormEvent) {
    e.preventDefault();
    const nama = namaBaru.trim(); if (!nama || !profile) return;
    setSibuk(true);
    const { data, error } = await supabaseBrowser().from('tim').insert({ nama, pemilik: profile.id }).select('id').single();
    setSibuk(false);
    if (error) { lapor('error', 'Gagal membuat tim.'); return; }
    setNamaBaru('');
    if (!bawaan && data) await supabaseBrowser().from('profiles').update({ tim_bawaan: data.id }).eq('id', profile.id);
    lapor('ok', `Tim "${nama}" dibuat. Tambahkan anggota lewat email atau username.`); muat();
  }

  async function tambahAnggota(t: Tim, e: React.FormEvent) {
    e.preventDefault();
    const k = (tambah[t.id] ?? '').trim();
    if (k.length < 3) { lapor('error', 'Isi email atau username lengkap.'); return; }
    const sb = supabaseBrowser();
    const { data } = await sb.rpc('cari_pengguna', { p_kunci: k });
    const org = (data ?? [])[0] as { id: string; nama: string } | undefined;
    if (!org) { lapor('error', 'Pengguna tidak ditemukan. Pastikan email/username persis sama dan akunnya sudah aktif.'); return; }
    if (org.id === t.pemilik) { lapor('error', `${org.nama} adalah pemilik tim ini.`); return; }
    const { error } = await sb.from('tim_anggota').insert({ tim_id: t.id, user_id: org.id });
    if (error) { lapor('error', error.code === '23505' ? `${org.nama} sudah menjadi anggota.` : 'Gagal menambah anggota. Hanya pemilik tim yang bisa menambah anggota.'); return; }
    setTambah(x => ({ ...x, [t.id]: '' })); lapor('ok', `${org.nama} ditambahkan ke ${t.nama}.`); muat();
  }

  async function keluarkan(t: Tim, a: Anggota) {
    const diriSendiri = a.user_id === profile?.id;
    const { error } = await supabaseBrowser().from('tim_anggota').delete().eq('tim_id', t.id).eq('user_id', a.user_id);
    if (error) { lapor('error', 'Gagal.'); return; }
    lapor('ok', diriSendiri ? `Anda keluar dari ${t.nama}.` : `${a.nama} dikeluarkan dari ${t.nama}.`); muat();
  }

  async function hapusTim(t: Tim) {
    if (!confirm(`Hapus tim "${t.nama}"? Project yang dibagikan ke tim ini tidak lagi terlihat oleh anggotanya.`)) return;
    const { error } = await supabaseBrowser().from('tim').delete().eq('id', t.id);
    if (error) { lapor('error', 'Gagal menghapus tim.'); return; }
    lapor('ok', `Tim "${t.nama}" dihapus.`); muat();
  }

  async function aturBawaan(id: string | null) {
    if (!profile) return;
    const { error } = await supabaseBrowser().from('profiles').update({ tim_bawaan: id }).eq('id', profile.id);
    if (error) { lapor('error', 'Gagal mengatur tim bawaan.'); return; }
    setBawaan(id); lapor('ok', id ? 'Project baru Anda otomatis dibagikan ke tim ini.' : 'Project baru Anda sekarang pribadi.');
  }

  return (
    <>
      <div className="head"><div><div className="eyebrow"><Link href="/akun">Akun</Link></div><h1>Tim &amp; berbagi project</h1></div></div>
      <div className="card">
        <p style={{ marginTop: 0 }}>Project yang Anda buat hanya terlihat oleh Anda, kecuali Anda membagikannya. Bagikan lewat tombol <b>Bagikan</b> di halaman project — ke orang tertentu (email atau username) atau ke tim.</p>
        <p className="small muted" style={{ marginBottom: 0 }}><b>Tim bawaan</b>: project baru otomatis dibagikan ke tim ini dengan hak <i>Boleh edit</i>. Draft milik orang lain tetap hanya bisa diubah pembuatnya, admin, dan manager.</p>
      </div>

      {pesan && <p className={pesan.jenis === 'ok' ? 'ok' : 'error'} role="status">{pesan.teks}</p>}

      <fieldset className="card">
        <legend>Tim bawaan untuk project baru</legend>
        <label className="row" style={{ margin: '4px 0' }}><input type="radio" name="bawaan" checked={!bawaan} onChange={() => aturBawaan(null)} style={{ width: 'auto' }} /> Tidak ada — project baru tetap pribadi</label>
        {(tim ?? []).map(t => (
          <label key={t.id} className="row" style={{ margin: '4px 0' }}><input type="radio" name="bawaan" checked={bawaan === t.id} onChange={() => aturBawaan(t.id)} style={{ width: 'auto' }} /> {t.nama}</label>
        ))}
      </fieldset>

      {tim === null && <p className="muted">Memuat…</p>}
      {tim?.length === 0 && <p className="muted">Anda belum ikut tim mana pun. Buat tim di bawah, lalu tambahkan rekan Anda.</p>}

      {(tim ?? []).map(t => {
        const milikSaya = t.pemilik === profile?.id || !!profile?.is_master;
        const daftar = anggota[t.id] ?? [];
        return (
          <section className="card" key={t.id}>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}>
              <h2 style={{ margin: 0 }}>{t.nama} <span className="small muted">· {daftar.length} orang</span></h2>
              {t.pemilik === profile?.id || profile?.is_master ? <button type="button" className="ghost" onClick={() => hapusTim(t)}>Hapus tim</button> : null}
            </div>
            <ul className="bagi-daftar" style={{ marginTop: 10 }}>
              {daftar.map(a => (
                <li key={a.user_id}>
                  <div><b>{a.nama}</b> {a.username && <span className="small muted">@{a.username}</span>} {a.pemilik && <span className="pill info">pemilik</span>}</div>
                  {!a.pemilik && (milikSaya || a.user_id === profile?.id) && (
                    <button type="button" className="ghost" onClick={() => keluarkan(t, a)}>{a.user_id === profile?.id ? 'Keluar dari tim' : 'Keluarkan'}</button>
                  )}
                </li>
              ))}
            </ul>
            {milikSaya && (
              <form className="bagi-form" style={{ marginTop: 10, gridTemplateColumns: '1fr auto' }} onSubmit={e => tambahAnggota(t, e)}>
                <label className="f" htmlFor={`tambah-${t.id}`}>Tambah anggota
                  <input id={`tambah-${t.id}`} value={tambah[t.id] ?? ''} onChange={e => setTambah(x => ({ ...x, [t.id]: e.target.value }))} placeholder="Email atau username" autoComplete="off" />
                </label>
                <button type="submit">Tambahkan</button>
              </form>
            )}
          </section>
        );
      })}

      <form className="card bagi-form" style={{ gridTemplateColumns: '1fr auto' }} onSubmit={buatTim}>
        <label className="f" htmlFor="nama-tim">Buat tim baru
          <input id="nama-tim" value={namaBaru} onChange={e => setNamaBaru(e.target.value)} placeholder="Misal: Tim Solution Jakarta" maxLength={80} />
        </label>
        <button type="submit" disabled={sibuk || !namaBaru.trim()}>Buat tim</button>
      </form>
    </>
  );
}
