'use client';
import MasterTabs from '@/components/MasterTabs';
import GudangManager from './GudangManager';

export default function ProcurementPage() {
  return <MasterTabs eyebrow="Menu 1 · Procurement" judul="Gudang, MHE & kebutuhan operasional"
    ekstra={[{ id: 'gudang', label: 'Gudang', pemilik: 'Procurement', isi: <GudangManager /> }]}
    ids={['mhe', 'kebutuhan']} />;
}
