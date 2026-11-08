'use client';
import MarketPrice from '@/components/transport/MarketPrice';

/** Menu Market Price tersendiri: satu sheet harga beli vendor untuk semua moda (trucking, laut, udara, kereta).
 *  Dipakai sebagai drop list vendor & harga di Transportation Tender dan Intermodal Tender. */
export default function MarketPricePage() {
  return (
    <>
      <div className="head"><div><div className="eyebrow">Transport & Intermodal</div><h1>Market Price</h1></div></div>
      <MarketPrice judul="Market Price — trucking, laut, udara & kereta (satu sheet)" />
    </>);
}
