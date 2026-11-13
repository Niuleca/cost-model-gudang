import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

// Tujuan link konfirmasi email / reset password dari Supabase (alur kode / PKCE).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/beranda';
  const daftar = next.startsWith('/auth/terdaftar');
  // link kedaluwarsa / sudah dipakai: Supabase mengirim parameter error
  if (searchParams.get('error') || searchParams.get('error_code')) return NextResponse.redirect(`${origin}${daftar ? '/auth/terdaftar?status=gagal' : next.startsWith('/auth/password-baru') ? '/login?error=reset&mode=lupa' : '/login?error=link'}`);
  if (code) {
    const { error } = await supabaseServer().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  // Konfirmasi pendaftaran: email sudah diverifikasi Supabase sebelum diarahkan ke sini, walau sesi tidak bisa dibuat
  // (mis. email dibuka di HP padahal daftar di laptop) — tetap tampilkan "terdaftar".
  if (daftar) return NextResponse.redirect(`${origin}/auth/terdaftar`);
  return NextResponse.redirect(`${origin}/login?error=${next.startsWith('/auth/password-baru') ? 'reset&mode=lupa' : 'link'}`);
}
