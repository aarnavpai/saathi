import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // The workspace and OCR seed are read with dynamic paths, so file tracing
  // can't see them; ship them with every API route.
  outputFileTracingIncludes: {
    "/api/**": ["./workspace/**/*", "./seed/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
