'use client';
import { useParams } from 'next/navigation';
import MasterTabs from '@/components/MasterTabs';
import { PROD_PAGES, tabProduktivitas } from '@/lib/masterTabs';
import ReferensiUom from './ReferensiUom';

/** Productivity per UoM (tautan lama) dan halaman referensi UoM & kelas berat. */
export default function ProduktivitasUom() {
  const { uom } = useParams<{ uom: string }>();
  if (uom === 'referensi-uom') return <ReferensiUom />;
  if (uom === 'kalender') return <MasterTabs eyebrow="Productivity" judul="Kalender libur nasional & cuti bersama" ids={['kalender']} />;
  if (uom === 'semua') return <MasterTabs eyebrow="Productivity" judul="Semua data produktivitas" ids={['produktivitas']} />;
  const pg = PROD_PAGES.find(p => p.slug === uom);
  if (!pg) return <p className="muted">Halaman tidak ditemukan.</p>;
  return <MasterTabs key={pg.slug} eyebrow="Productivity" judul={`Produktivitas per ${pg.label}`} ids={[]} tabsLangsung={[tabProduktivitas(pg.uom, pg.label)]} />;
}
