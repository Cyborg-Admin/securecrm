import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SecureCRM",
  description: "Secure, accountable, automation-first CRM with RBAC and lead capture.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
