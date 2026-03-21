import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";
import { SystemThemeBootstrap } from "@/components/layout/SystemThemeBootstrap";
import { DEFAULT_APP_NAME } from "@/lib/branding";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: DEFAULT_APP_NAME,
  description: "Business groupware and CRM platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <Providers>
          <SystemThemeBootstrap />
          {children}
        </Providers>
      </body>
    </html>
  );
}
