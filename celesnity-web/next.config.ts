import type { NextConfig } from 'next';

const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  output: 'standalone',
  // The release and handover pages answer at `/_internal/...`. A folder cannot
  // start with an underscore (the App Router reserves it for private folders),
  // so they live in `app/internal` and this rewrite keeps the public path.
  async rewrites() {
    return [{ source: '/_internal/:path*', destination: '/internal/:path*' }];
  },
  outputFileTracingRoot: projectRoot,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
