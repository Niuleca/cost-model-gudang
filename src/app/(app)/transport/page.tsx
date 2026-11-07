'use client';
import { useTabUrl } from '@/lib/useTabUrl';
import { DaftarTenderTr } from '@/components/transport/shared';
import MarketPrice from '@/components/transport/MarketPrice';
import { TRANSPORT_DEFAULT } from '@/lib/transport';

const TABS = ['Tender', 'Market Price'] as const;

/** Menu Transportation Tender: sheet Tender (daftar & tender baru) + sheet Market Price (harga beli vendor per rute darat). */
export default function TransportPage() {
  const [tab, setTab] = useTabUrl(TABS, 'Tender');
  return (
    <>
      <div className="head"><div><div className="eyebrow">Transport & Intermodal</div><h1>Transportation Tender</h1></div></div>
      <div className="tabs" role="tablist">{TABS.map(x => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{x}</button>)}</div>
      {tab === 'Tender' ? <DaftarTenderTr jenis="transportation" asumsiAwal={{ transport: TRANSPORT_DEFAULT }} basePath="/transport" />
        : <MarketPrice moda={['darat']} judul="Market Price — trucking (darat)" />}
    </>);
}
