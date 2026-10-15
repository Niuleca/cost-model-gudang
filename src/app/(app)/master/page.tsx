'use client';
import MasterTabs from '@/components/MasterTabs';

export default function MasterPage() {
  return <MasterTabs eyebrow="Master data umum" judul="Kalender, listrik, keuangan & T&C"
    ids={['kalender', 'listrik', 'keuangan', 'margin', 'tc', 'harga']} />;
}
