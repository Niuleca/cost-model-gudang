'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DaftarTenderTr } from '@/components/transport/shared';
import { TRANSPORT_DEFAULT } from '@/lib/transport';

/** Menu Transportation Tender: daftar & tender baru. Harga beli vendor ada di menu Market Price (satu sheet semua moda). */
export default function TransportPage() {
  const router = useRouter();
  // tautan lama ?tab=market-price → menu Market Price
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'market-price') router.replace('/market-price'); }, [router]);
  return (
    <>
      <div className="head"><div><div className="eyebrow">Transport & Intermodal</div><h1>Transportation Tender</h1></div>
        <Link className="btn ghost" href="/market-price">Market Price</Link></div>
      <DaftarTenderTr jenis="transportation" asumsiAwal={{ transport: TRANSPORT_DEFAULT }} basePath="/transport" />
    </>);
}
