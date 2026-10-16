'use client';
import { useParams } from 'next/navigation';
import MasterTabs from '@/components/MasterTabs';
import { PROD_PAGES, tabProduktivitas } from '@/lib/masterTabs';

/** Productivity per UoM (pcs, karton, ton, CBM, liter, bag, pail, pack, roll). */
export default function ProduktivitasUom() {
  const { uom } = useParams<{ uom: string }>();
  const pg = PROD_PAGES.find(p => p.slug === uom);
  if (!pg) return <p className="muted">Halaman tidak ditemukan.</p>;
  return <MasterTabs key={pg.slug} eyebrow="Productivity" judul={`Produktivitas per ${pg.label}`} ids={[]} tabsLangsung={[tabProduktivitas(pg.uom, pg.label)]} />;
}
