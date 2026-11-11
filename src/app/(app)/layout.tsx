import AppShell from '@/components/AppShell';
import { BahasaProvider } from '@/lib/i18n';
import { SatuanProvider } from '@/lib/satuanPanjang';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <BahasaProvider><SatuanProvider><AppShell>{children}</AppShell></SatuanProvider></BahasaProvider>;
}
