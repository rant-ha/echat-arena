import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Empathy Arena",
  description: "Empathy Arena (Next.js 14)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body>{children}</body>
    </html>
  );
}
