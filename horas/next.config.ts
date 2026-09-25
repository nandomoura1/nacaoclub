import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // O repositório tem outros apps (raiz e athx/) com lockfiles próprios:
  // este app é autocontido na pasta horas/.
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  // Importação da planilha envia o .xlsx e a prévia (algumas centenas de aulas).
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
