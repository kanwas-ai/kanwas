import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    loader: 'custom',
    loaderFile: './imageLoader.ts',
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1536, 1920, 2560, 2880, 3840],
  },
  transpilePackages: ['kanwas-art'],
  experimental: {
    inlineCss: true,
  },
}

export default nextConfig
