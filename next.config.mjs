/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  experimental: {
    // Enables src/instrumentation.ts (resumes running broadcasts after a restart)
    instrumentationHook: true,
  },
};

export default nextConfig;
