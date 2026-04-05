/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  // Windows: avoid locked `.next/trace` by using alternate dirs from npm scripts:
  // dev → .next-build, build/start → .next-prod. Override: NEXT_DIST_DIR=.next (see build:dotnext / dev:dotnext).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

module.exports = nextConfig;
