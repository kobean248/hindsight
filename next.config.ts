import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // transformers.js loads onnxruntime's native binding; keep it out of the bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
};

export default nextConfig;
