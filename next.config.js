/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'a.espncdn.com',
        pathname: '/i/teamlogos/**',
      },
      {
        protocol: 'https',
        hostname: 'a1.espncdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'a2.espncdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'a3.espncdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'a4.espncdn.com',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
};

module.exports = nextConfig;
