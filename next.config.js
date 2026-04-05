/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  // Windows: avoid locked `.next/trace` during dev via NEXT_DIST_DIR=.next-build (npm run dev).
  // Default build/start use `.next` (Vercel/CI). Optional: build:next-prod / start:next-prod → .next-prod.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

module.exports = nextConfig;
