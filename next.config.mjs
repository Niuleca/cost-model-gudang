/** @type {import('next').NextConfig} */
const headerKeamanan = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },                       // situs tidak bisa dibungkus iframe situs lain (anti clickjacking)
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: '/:path*', headers: headerKeamanan }];
  },
};

export default nextConfig;
