'use client';
import { useParams } from 'next/navigation';
import MasterTabs from '@/components/MasterTabs';
import GudangManager from '../../procurement/GudangManager';
import { PRICE_PAGES } from '@/lib/masterTabs';

/** Price Inquiry: satu halaman per kelompok harga (gudang sewa, MHE, racking, …, HR). */
export default function PriceInquiryPage() {
  const { slug } = useParams<{ slug: string }>();
  const pg = PRICE_PAGES.find(p => p.slug === slug);
  if (!pg) return <p className="muted">Halaman tidak ditemukan.</p>;
  return <MasterTabs key={pg.slug} eyebrow="Price Inquiry" judul={pg.judul} ids={pg.ids}
    ekstra={pg.gudang ? [{ id: 'gudang', label: 'Gudang sewa', pemilik: 'Procurement', isi: <GudangManager /> }] : undefined} />;
}
