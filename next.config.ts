import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer"],
  allowedDevOrigins: ["192.168.1.127", "192.168.1.*", "*.local"],
};

export default nextConfig;
