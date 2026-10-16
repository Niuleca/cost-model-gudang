'use client';
import { useState, type ReactNode } from 'react';
import TableEditor from '@/components/TableEditor';
import { useProfile } from '@/lib/useProfile';
import { TABS, type Tab } from '@/lib/masterTabs';

/** Halaman master data per departemen: sekumpulan tab TableEditor + tab khusus (opsional). */
export default function MasterTabs({ ids, eyebrow, judul, ekstra, tabsLangsung }: {
  ids: string[]; eyebrow: string; judul: string; tabsLangsung?: Tab[];
  ekstra?: { id: string; label: string; pemilik: string; isi: ReactNode }[];
}) {
  const { profile } = useProfile();
  const tabs = [...(ekstra ?? []).map(e => ({ id: e.id, label: e.label, pemilik: e.pemilik })), ...ids.map(id => TABS.find(t => t.id === id)).filter((t): t is Tab => !!t), ...(tabsLangsung ?? [])];
  const [tab, setTab] = useState(tabs[0].id);
  const e = ekstra?.find(x => x.id === tab);
  const t = [...TABS, ...(tabsLangsung ?? [])].find(x => x.id === tab);
  const pemilik = e?.pemilik ?? t?.pemilik;
  return (
    <>
      <div className="head">
        <div><div className="eyebrow">{eyebrow}</div><h1>{judul}</h1></div>
        <span className="small muted">Pemilik data: <b>{pemilik}</b>. Approve oleh Solution Design.</span>
      </div>
      {tabs.length > 1 && (
        <div className="tabs" role="tablist">
          {tabs.map(x => <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>{x.label}</button>)}
        </div>
      )}
      {e ? e.isi : t && (
        <TableEditor key={t.id} table={t.table} view={t.view} idKey={t.idKey} kolom={t.kolom} editorRoles={t.editorRoles}
          approval={t.approval} orderBy={t.orderBy} cari={t.cari} catatan={t.catatan} defaults={t.defaults} filter={t.filter} profile={profile} namaExport={t.label.replace(/[^\w]+/g, '_')} kelompok={t.kelompok} />
      )}
    </>
  );
}
