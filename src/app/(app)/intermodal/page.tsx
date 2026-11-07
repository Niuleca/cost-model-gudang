'use client';
import { useTabUrl } from '@/lib/useTabUrl';
import { DaftarTenderTr } from '@/components/transport/shared';
import MarketPrice from '@/components/transport/MarketPrice';
import { INTERMODAL_DEFAULT } from '@/lib/transport';

const TABS = ['Tender', 'Market Price'] as const;

/** Menu Intermodal Tender: sheet Tender + sheet Market Price (semua moda: darat untuk pickup/delivery, laut/udara/kereta untuk main leg). */
export default function IntermodalPage() {
  const [tab, setTab] = useTabUrl(TABS, 'Tender');
  return (
    <>
      <div className="head"><div><div className="eyebrow">Transport & Intermodal</div><h1>Intermodal Tender</h1></div></div>
      <div className="tabs" role="tablist">{TABS.map(x => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{x}</button>)}</div>
      {tab === 'Tender' ? <DaftarTenderTr jenis="intermodal" asumsiAwal={{ intermodal: INTERMODAL_DEFAULT }} basePath="/intermodal" />
        : <MarketPrice judul="Market Price — semua moda (trucking, laut, udara, kereta)" />}
    </>);
}
