'use client';
// Alamat lama: Layout editor 2D ⇄ 3D sekarang digabung ke /simulasi (Desain gudang 2D ⇄ 3D).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AlihLayout() {
  const r = useRouter();
  useEffect(() => { r.replace(`/simulasi${window.location.search}`); }, [r]);
  return <p className="small muted">Mengalihkan ke Desain gudang 2D ⇄ 3D…</p>;
}
