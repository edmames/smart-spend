import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Toaster } from "@/components/ui/toaster";
import { SWRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: {
    default: "SmartSpend",
    template: "%s · SmartSpend",
  },
  description:
    "Pencatat keuangan harian (IDR) yang berjalan sepenuhnya di perangkat Anda: dompet, transaksi, tabungan, dan budget.",
  applicationName: "SmartSpend",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SmartSpend",
  },
  icons: {
    icon: [
      { rel: "icon", url: "/favicon.ico" },
      { rel: "icon", url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ rel: "apple-touch-icon", url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e151b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body className="min-h-full">
        <div className="app-shell">
          <SWRegister />
          <AppProviders>
            <main className="app-content">{children}</main>
          </AppProviders>
          <BottomNav />
        </div>
        <Toaster />
      </body>
    </html>
  );
}
