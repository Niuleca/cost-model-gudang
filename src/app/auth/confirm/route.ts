import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';

// Tujuan link di email (template Supabase memakai token_hash) — berhasil walau email dibuka di perangkat lain.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/auth/terdaftar';
  if (tokenHash && type) {
    const { error } = await supabaseServer().auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}${next.startsWith('/auth/terdaftar') ? '/auth/terdaftar?status=gagal' : type === 'recovery' ? '/login?error=reset&mode=lupa' : '/login?error=link'}`);
}
