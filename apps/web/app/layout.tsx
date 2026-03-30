import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
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
        {/* ── Theme initializer: runs before paint to avoid flash ── */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var isDark=t!=='light';document.documentElement.classList.toggle('dark',isDark);document.documentElement.style.colorScheme=isDark?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased" suppressHydrationWarning>
        {children}
        {/* Service Worker registration */}
        <Script id="sw-registration" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.warn('SW registration failed:', err);
              });
            });
          }
        `}</Script>
        {/* Theme BroadcastChannel relay — keeps auth pages in sync when toggled from AppShell */}
        <Script id="theme-relay" strategy="afterInteractive">{`
          try {
            var bc = new BroadcastChannel('theme');
            bc.onmessage = function(e) {
              var isDark = e.data === 'dark';
              document.documentElement.classList.toggle('dark', isDark);
              document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
            };
          } catch(e) {}
        `}</Script>
      </body>
    </html>
  );
}
