import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: {
    default: "SmartSpend",
    template: "%s · SmartSpend",
  },
  description:
    "Pencatat keuangan harian (IDR) yang berjalan sepenuhnya di perangkat Anda: dompet, transaksi, tabungan, dan budget.",
  applicationName: "SmartSpend",
  manifest: "/manifest.webmanifest",
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
