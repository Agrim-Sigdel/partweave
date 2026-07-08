/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship as TypeScript source, so Next transpiles them.
  // (Harmless if a package isn't present in this project.)
  transpilePackages: ["@app/shared", "@app/api-client"],
};

export default nextConfig;
