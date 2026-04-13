import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PWARegister } from "../components/PWARegister";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RepairDeskz — Digital Repair Ticket Management",
  description:
    "Manage repair tickets, track inventory, and grow your repair shop with RepairDeskz — a mobile-first PWA for repair professionals.",
  keywords: ["repair shop", "ticket management", "inventory", "invoices", "PWA"],
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RepairDeskz",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,       // allow user zoom (accessibility)
  userScalable: true,
  viewportFit: "cover",  // safe-area support for notched phones
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Apple touch icons */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />

        {/* Splash / startup images (iOS) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RepairDesk" />

        {/* MS tile */}
        <meta name="msapplication-TileColor" content="#10b981" />
        <meta name="msapplication-TileImage" content="/icons/icon-192.png" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased" suppressHydrationWarning>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
