'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from './supabase/client';
import type { AppRole } from './format';

export interface Profile { id: string; full_name: string; email: string | null; role: AppRole; jabatan?: string | null; perusahaan?: string | null; username?: string | null; telepon?: string | null }

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const sb = supabaseBrowser();
    let aktif = true;
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { if (aktif) setLoading(false); return; }
      const { data } = await sb.from('profiles').select('id, full_name, email, role, jabatan, perusahaan, username, telepon').eq('id', user.id).single();
      if (aktif) { setProfile(data as Profile | null); setLoading(false); }
    })();
    return () => { aktif = false; };
  }, []);
  return { profile, loading };
}
