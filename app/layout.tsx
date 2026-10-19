import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export const metadata: Metadata = {
  title: { default: "FinMate AI — Clearer money decisions", template: "%s | FinMate AI" },
  description: "A calm, privacy-first personal finance workspace with transparent forecasts.",
  applicationName: "FinMate AI",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/finmate-icon.svg", type: "image/svg+xml" }, { url: "/icons/finmate-icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  }
};
export const viewport: Viewport = { themeColor: "#123b38", colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><ServiceWorkerRegister />{children}</body></html>;
}
