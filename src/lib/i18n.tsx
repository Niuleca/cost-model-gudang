'use client';
// Pilihan bahasa Leca: Indonesia (sumber), English, 한국어, 日本語.
// Kunci kamus = teks Indonesia. Teks yang belum diterjemahkan tetap tampil dalam Bahasa Indonesia.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Bahasa = 'id' | 'en' | 'ko' | 'ja';
export const BAHASA: { v: Bahasa; l: string; short: string }[] = [
  { v: 'id', l: 'Bahasa Indonesia', short: 'ID' }, { v: 'en', l: 'English', short: 'EN' },
  { v: 'ko', l: '한국어', short: 'KO' }, { v: 'ja', l: '日本語', short: 'JA' },
];

type Kamus = Record<string, [en: string, ko: string, ja: string]>;
const K: Kamus = {
  // Navigasi
  'Dashboard': ['Dashboard', '대시보드', 'ダッシュボード'],
  'Ringkasan': ['Summary', '요약', 'サマリー'],
  'Status Project': ['Project Status', '프로젝트 현황', 'プロジェクト状況'],
  'Heatmap penyelesaian, backlog & waiting': ['Heatmap: completion, backlog & waiting', '히트맵: 완료·백로그·대기', 'ヒートマップ：完了・バックログ・待機'],
  'Tender': ['Tender', '입찰', '入札'],
  'New Tender': ['New Tender', '신규 입찰', '新規入札'],
  'Draft Tender': ['Draft Tenders', '입찰 초안', '入札ドラフト'],
  'Comparation Tender': ['Tender Comparison', '입찰 비교', '入札比較'],
  'Riwayat Tender': ['Tender History', '입찰 이력', '入札履歴'],
  'Implementation / Project Charter': ['Implementation / Project Charter', '구현 / 프로젝트 차터', '導入 / プロジェクト憲章'],
  'Price Inquiry': ['Price Inquiry', '단가 조회', '価格照会'],
  'Productivity': ['Productivity', '생산성', '生産性'],
  'Semua UoM': ['All UoM', '전체 단위', '全単位'],
  'Pengguna & role': ['Users & roles', '사용자 및 권한', 'ユーザーと権限'],
  'Master data (kalender, keuangan, margin, T&C)': ['Master data (calendar, finance, margin, T&C)', '마스터 데이터 (달력, 재무, 마진, 약관)', 'マスターデータ（カレンダー・財務・マージン・約款）'],
  'Profil & password': ['Profile & password', '프로필 및 비밀번호', 'プロフィールとパスワード'],
  'Keluar': ['Sign out', '로그아웃', 'ログアウト'],
  'Bahasa': ['Language', '언어', '言語'],
  'cost model, tender & quotation gudang': ['warehouse cost model, tender & quotation', '창고 원가 모델·입찰·견적', '倉庫コストモデル・入札・見積'],
  'Dibuat oleh': ['Built by', '제작', '制作'],
  // Tab tender
  'Key assumption': ['Key assumptions', '주요 가정', '主要前提'],
  'Volume': ['Volume', '물량', '物量'],
  'Aktivitas & manpower': ['Activities & manpower', '작업 및 인력', '作業と人員'],
  'Gudang, space & MHE': ['Warehouse, space & MHE', '창고·공간·하역장비', '倉庫・スペース・MHE'],
  'IT': ['IT', 'IT', 'IT'],
  'Biaya lain': ['Other costs', '기타 비용', 'その他費用'],
  'Hasil': ['Results', '결과', '結果'],
  'Quotation': ['Quotation', '견적서', '見積書'],
  'Export': ['Export', '내보내기', 'エクスポート'],
  // Tombol
  'Undo': ['Undo', '실행 취소', '元に戻す'],
  'Redo': ['Redo', '다시 실행', 'やり直し'],
  'Simpan input': ['Save input', '입력 저장', '入力を保存'],
  'Tersimpan': ['Saved', '저장됨', '保存済み'],
  'Hitung': ['Calculate', '계산', '計算'],
  'Hitung ulang': ['Recalculate', '재계산', '再計算'],
  'Export Excel': ['Export Excel', 'Excel 내보내기', 'Excelエクスポート'],
  'Simpan hasil sebagai versi baru': ['Save result as new version', '새 버전으로 결과 저장', '新しいバージョンとして保存'],
  'Hapus tender': ['Delete tender', '입찰 삭제', '入札を削除'],
  'Ubah status': ['Change status', '상태 변경', 'ステータス変更'],
  'Status project': ['Project status', '프로젝트 상태', 'プロジェクト状態'],
  'Hapus': ['Delete', '삭제', '削除'],
  'Salin': ['Copy', '복사', 'コピー'],
  'Tambah': ['Add', '추가', '追加'],
  // Key assumption
  'Customer': ['Customer', '고객사', '顧客'],
  'Industri (benchmark produktivitas)': ['Industry (productivity benchmark)', '산업 (생산성 기준)', '業種（生産性ベンチマーク）'],
  'PIC / account': ['PIC / account', '담당자', '担当者'],
  'Alamat / site': ['Address / site', '주소 / 현장', '住所 / サイト'],
  'Skema': ['Scheme', '형태', 'スキーム'],
  'Skenario aset': ['Asset scenario', '자산 시나리오', '資産シナリオ'],
  'Durasi kontrak': ['Contract duration', '계약 기간', '契約期間'],
  'Jumlah shift': ['Number of shifts', '교대 수', 'シフト数'],
  'Hari kerja per minggu': ['Working days per week', '주당 근무일', '週あたり稼働日'],
  'Jam kerja per shift': ['Working hours per shift', '교대당 근무시간', 'シフトあたり労働時間'],
  'Jam efektif per shift': ['Effective hours per shift', '교대당 유효시간', 'シフトあたり実働時間'],
  'Payment term': ['Payment term', '지급 조건', '支払条件'],
  'Cuti tahunan per orang': ['Annual leave per person', '1인당 연차', '1人あたり年休'],
  'Faktor produktivitas': ['Productivity factor', '생산성 계수', '生産性係数'],
  'Efisiensi kerja': ['Work efficiency', '작업 효율', '作業効率'],
  'Provinsi project': ['Project province', '프로젝트 지역(주)', 'プロジェクト州'],
  'Area / kab-kota (menentukan UMK)': ['Area / regency-city (sets minimum wage)', '지역 / 시·군 (최저임금 기준)', '地域 / 県・市（最低賃金の基準）'],
  'Go-live (menentukan tahun kalender & UMK)': ['Go-live (sets calendar year & minimum wage)', '운영 개시일 (연도·최저임금 기준)', '稼働開始日（暦年・最低賃金の基準）'],
  // Bagian
  'Man Power Summary': ['Manpower Summary', '인력 요약', '人員サマリー'],
  'MHE Summary': ['MHE Summary', '하역장비 요약', 'MHEサマリー'],
  'Rincian biaya manpower': ['Manpower cost breakdown', '인건비 내역', '人件費内訳'],
  'Rincian per task': ['Breakdown per task', '작업별 내역', 'タスク別内訳'],
  'Process Design & Resource Calculation': ['Process Design & Resource Calculation', '프로세스 설계 및 자원 산정', 'プロセス設計と資源算定'],
  'Profil order inbound & outbound (per hari)': ['Inbound & outbound order profile (per day)', '입고·출고 오더 프로필 (일별)', '入荷・出荷オーダープロファイル（日次）'],
  'Ringkasan order': ['Order summary', '오더 요약', 'オーダーサマリー'],
  'Skema biaya manpower selama kontrak': ['Manpower cost over the contract', '계약 기간 인건비 계획', '契約期間中の人件費'],
  'Matriks multi-skill (siapa boleh merangkap siapa)': ['Multi-skill matrix (who can cover whom)', '멀티스킬 매트릭스 (겸직 가능 여부)', 'マルチスキル表（兼務可否）'],
  'Aktivitas (VSM) & manpower': ['Activities (VSM) & manpower', '작업(VSM) 및 인력', '作業（VSM）と人員'],
  // Hasil KPI
  'Cost per bulan': ['Cost per month', '월 원가', '月間コスト'],
  'Selling per bulan': ['Selling per month', '월 매출', '月間売上'],
  'Cost per tahun': ['Cost per year', '연 원가', '年間コスト'],
  'Selling per tahun': ['Selling per year', '연 매출', '年間売上'],
  'Profit per bulan': ['Profit per month', '월 이익', '月間利益'],
  'Margin': ['Margin', '마진', 'マージン'],
  'Jumlah manpower': ['Total manpower', '총 인원', '総人員'],
  'Luas gudang': ['Warehouse area', '창고 면적', '倉庫面積'],
  'Jumlah gudang': ['Number of warehouses', '창고 수', '倉庫数'],
  'Margin (GP%)': ['Margin (GP%)', '마진 (GP%)', 'マージン（GP%）'],
  'Indirect & peran tetap': ['Indirect & fixed roles', '간접 인력 및 고정 직무', '間接・固定ポジション'],
  'Listrik': ['Electricity', '전기', '電気'],
  'Kalender & volume desain': ['Calendar & design volume', '달력 및 설계 물량', 'カレンダーと設計物量'],
  'Space': ['Space', '공간', 'スペース'],
  'Manpower': ['Manpower', '인력', '人員'],
  'MHE': ['MHE', '하역장비', 'MHE'],
  'Rincian biaya per bulan': ['Monthly cost breakdown', '월별 비용 내역', '月次コスト内訳'],
  'Stok untuk tarif storage alternatif': ['Stock for alternative storage rates', '대체 보관료용 재고', '代替保管料用の在庫'],
  'Working day': ['Working day', '근무일', '稼働日'],
  'Workload shift': ['Workload per shift', '교대별 작업량', 'シフト別作業量'],
  'Faktor': ['Factors', '계수', '係数'],
  '% gaji pokok per level jabatan': ['% base salary per job level', '직급별 기본급 비율', '職位別基本給（%）'],
  'Volume admin (order)': ['Admin volume (orders)', '관리 물량 (오더)', '事務作業量（オーダー）'],
  'Parameter muatan': ['Load parameters', '적재 기준', '積載パラメータ'],
  // Dashboard
  'Ringkasan tender': ['Tender summary', '입찰 요약', '入札サマリー'],
  'Pipeline aktif': ['Active pipeline', '진행 중 파이프라인', '進行中パイプライン'],
  'Nilai kontrak pipeline': ['Pipeline contract value', '파이프라인 계약가', 'パイプライン契約額'],
  'Rata-rata GP pipeline': ['Average pipeline GP', '파이프라인 평균 GP', 'パイプライン平均GP'],
  'Menang': ['Won', '수주', '受注'],
  'Win rate': ['Win rate', '수주율', '受注率'],
  'Pipeline berjalan': ['Running pipeline', '진행 중 입찰', '進行中の入札'],
  'Perlu tindakan': ['Needs action', '조치 필요', '要対応'],
  'Keputusan terakhir': ['Latest decisions', '최근 결정', '最近の決定'],
  'Semua tender': ['All tenders', '전체 입찰', '全入札'],
  'Tahun dibuat': ['Year created', '생성 연도', '作成年'],
  'Semua': ['All', '전체', 'すべて'],
};

const Ctx = createContext<{ bahasa: Bahasa; setBahasa: (b: Bahasa) => void; t: (s: string) => string }>({ bahasa: 'id', setBahasa: () => {}, t: s => s });
const KUNCI = 'leca.bahasa';

export function BahasaProvider({ children }: { children: React.ReactNode }) {
  const [bahasa, setB] = useState<Bahasa>('id');
  useEffect(() => { try { const b = localStorage.getItem(KUNCI) as Bahasa | null; if (b && BAHASA.some(x => x.v === b)) setB(b); } catch { /* abaikan */ } }, []);
  useEffect(() => { document.documentElement.lang = bahasa; }, [bahasa]);
  const setBahasa = useCallback((b: Bahasa) => { setB(b); try { localStorage.setItem(KUNCI, b); } catch { /* abaikan */ } }, []);
  const t = useCallback((s: string) => {
    if (bahasa === 'id') return s;
    const e = K[s]; if (!e) return s;
    return e[bahasa === 'en' ? 0 : bahasa === 'ko' ? 1 : 2] || s;
  }, [bahasa]);
  return <Ctx.Provider value={{ bahasa, setBahasa, t }}>{children}</Ctx.Provider>;
}
export const useBahasa = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
/** Komponen teks terjemahan: <T>Hitung</T> */
export function T({ children }: { children: string }) { return <>{useT()(children)}</>; }
