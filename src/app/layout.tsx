import type { Metadata } from "next";
import { Google_Sans_Flex, Michroma } from "next/font/google";
import "./globals.css";

const googleSansFlex = Google_Sans_Flex({
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-google-sans",
  adjustFontFallback: false,
});

const michroma = Michroma({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  variable: "--font-michroma",
});

export const metadata: Metadata = {
  title: "KINETIC",
  description:
    "KINETIC — secure, accountable CRM with RBAC, automation, and lead capture.",
  icons: {
    icon: "/kinetic-emblem.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${googleSansFlex.variable} ${michroma.variable}`}>
      <body className={`${googleSansFlex.className} antialiased`}>{children}</body>
    </html>
  );
}
