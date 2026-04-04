import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RepairDesk — Digital Repair Ticket Management",
  description:
    "Manage repair tickets, track inventory, and grow your repair shop with RepairDesk — a mobile-first PWA for repair professionals.",
  keywords: ["repair shop", "ticket management", "inventory", "invoices"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RepairDesk",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
