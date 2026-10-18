import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // transformers.js loads onnxruntime's native binding; keep it out of the bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "freestyle", "playwright", "playwright-core"],
  // playwright-core loads browsers.json through a computed path, so the file tracer omits it.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/playwright-core/browsers.json"],
  },
};

export default nextConfig;
