import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Menyegarkan sesi login dan mengarahkan user yang belum login ke /login.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user }, error: galatSesi } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith('/login') || path.startsWith('/auth') || path.startsWith('/situs') || path === '/panduan-leca.pdf' || path === '/panduan-leca.docx'
    || path === '/robots.txt' || path === '/sitemap.xml';
  // Sesi lama/kedaluwarsa (refresh token sudah tidak ada): hapus cookie login supaya browser tidak mengirimnya terus
  const sesiBasi = !!galatSesi && 'code' in galatSesi && (galatSesi.code === 'refresh_token_not_found' || galatSesi.code === 'refresh_token_already_used');
  const bersihkan = (res: NextResponse) => {
    if (sesiBasi) for (const c of request.cookies.getAll()) if (c.name.startsWith('sb-')) res.cookies.delete(c.name);
    return res;
  };

  // link email lama yang mendarat di halaman awal dengan ?code= → teruskan ke callback konfirmasi
  if (path === '/' && request.nextUrl.searchParams.get('code')) {
    const url = request.nextUrl.clone(); url.pathname = '/auth/callback';
    if (!url.searchParams.get('next')) url.searchParams.set('next', '/auth/terdaftar');
    return bersihkan(NextResponse.redirect(url));
  }
  // pengunjung belum login: halaman awal niuleca.com = landing page (bukan langsung login)
  if (!user && path === '/') {
    const url = request.nextUrl.clone(); url.pathname = '/situs';
    return bersihkan(NextResponse.rewrite(url));
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return bersihkan(NextResponse.redirect(url));
  }
  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return bersihkan(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
