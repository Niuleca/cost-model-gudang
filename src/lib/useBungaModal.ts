'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from './supabase/client';

/** Bunga modal per tahun dari master Finance (default 10%). */
export function useBungaModal() {
  const [bunga, setBunga] = useState(0.1);
  useEffect(() => {
    supabaseBrowser().from('finance_params').select('key, nilai').eq('key', 'bunga_modal_tahun').maybeSingle()
      .then(({ data }: { data: { nilai: number } | null }) => { if (data?.nilai != null) setBunga(Number(data.nilai)); });
  }, []);
  return bunga;
}
