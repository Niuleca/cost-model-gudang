import AppShell from '@/components/AppShell';
import { BahasaProvider } from '@/lib/i18n';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <BahasaProvider><AppShell>{children}</AppShell></BahasaProvider>;
}
