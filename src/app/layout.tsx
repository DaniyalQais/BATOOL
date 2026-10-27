import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ToastContainer } from "@/components/ui/toast";
import "./globals.css";
const sans = localFont({
  src: [
    { path: "./fonts/dm-sans/dm-sans-latin-normal.woff2", weight: "400 600", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});
const serif = localFont({
  src: [
    { path: "./fonts/cormorant-garamond/cormorant-garamond-latin-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/cormorant-garamond/cormorant-garamond-latin-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-serif",
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});
export const metadata: Metadata = {
  metadataBase: new URL("https://batool-atelier.foamyelk1024.chatgpt.site"),
  title: {
    default: "BATOOL | Everyday, beautifully.",
    template: "%s | BATOOL",
  },
  description:
    "Discover BATOOL — stitched 3-piece Pakistani ready-to-wear in S, M, L and XL, for everyday moments and special occasions.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        {children}
        <Footer />
        <ToastContainer />
      </body>
    </html>
  );
}
