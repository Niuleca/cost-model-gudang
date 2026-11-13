import type { MetadataRoute } from 'next';

// Halaman depan, gambar pratinjau & aset boleh dibaca mesin pencari / bot pratinjau link (LinkedIn, WhatsApp).
// Halaman aplikasi tetap butuh login, jadi tidak ada isinya yang terindeks.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/auth/', '/api/'] },
    sitemap: 'https://niuleca.com/sitemap.xml',
    host: 'https://niuleca.com',
  };
}
