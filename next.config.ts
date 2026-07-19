import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "pg"],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
