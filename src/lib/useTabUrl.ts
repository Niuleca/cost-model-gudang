'use client';
import { useCallback, useEffect, useState } from 'react';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Tab aktif disimpan di URL (?tab=...) supaya refresh / link yang dibagikan tetap membuka tab yang sama. */
export function useTabUrl<T extends string>(pilihan: readonly T[], awal: T, key = 'tab') {
  const [tab, setTabState] = useState<T>(awal);
  const [dariUrl, setDariUrl] = useState(false);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get(key);
    const cocok = v ? pilihan.find(p => slug(p) === v) : undefined;
    if (cocok) { setTabState(cocok); setDariUrl(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setTab = useCallback((t: T) => {
    setTabState(t);
    const u = new URL(window.location.href);
    u.searchParams.set(key, slug(t));
    window.history.replaceState(window.history.state, '', u.toString());
  }, [key]);
  return [tab, setTab, dariUrl] as const;
}
