'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from './supabase/client';
import type { AppRole } from './format';

export interface Profile { id: string; full_name: string; email: string | null; role: AppRole; jabatan?: string | null; perusahaan?: string | null; username?: string | null; telepon?: string | null;
  status?: 'pending' | 'aktif' | 'ditolak'; is_master?: boolean; is_pemilik?: boolean }

// Satu pengambilan profil dipakai bersama semua komponen (sebelumnya tiap komponen memanggil server login + tabel profil
// sendiri-sendiri → halaman lambat). Sesi dibaca lokal (getSession, tanpa jaringan); keamanan data tetap dijaga RLS di database
// dan pemeriksaan sesi penuh (getUser) di middleware setiap navigasi.
const TTL_MS = 5 * 60 * 1000;
let cache: { p: Promise<Profile | null>; t: number } | null = null;
let dengar = false;
const pendengar = new Set<() => void>();

function muat(): Promise<Profile | null> {
  if (cache && Date.now() - cache.t < TTL_MS) return cache.p;
  const sb = supabaseBrowser();
  if (!dengar) {
    dengar = true;
    sb.auth.onAuthStateChange((ev: string) => {
      if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') { cache = null; pendengar.forEach(f => f()); }
    });
  }
  const p = (async () => {
    const { data: { session } } = await sb.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return null;
    const { data } = await sb.from('profiles').select('*').eq('id', uid).single();
    return (data as Profile | null) ?? null;
  })().catch(() => { cache = null; return null; });
  cache = { p, t: Date.now() };
  return p;
}

/** Paksa ambil ulang profil (mis. setelah profil diubah di halaman Akun). */
export function muatUlangProfil() { cache = null; pendengar.forEach(f => f()); }

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let aktif = true;
    const ambil = () => { muat().then(p => { if (aktif) { setProfile(p); setLoading(false); } }); };
    ambil();
    pendengar.add(ambil);
    return () => { aktif = false; pendengar.delete(ambil); };
  }, []);
  return { profile, loading };
}
