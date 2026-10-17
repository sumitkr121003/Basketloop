import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "BasketLoop | Non-Custodial Recurring Crypto Baskets",
  description: "Automate multi-asset recurring crypto portfolio investments with zero idle deposits on Robinhood Chain Orbit L2.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-canvas text-text-primary antialiased flex flex-col selection:bg-white/10 selection:text-white relative">
        <div className="ambient-glow" />
        <Providers>
          <Navbar />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
            {children}
          </main>

          {/* Streamlined Footer */}
          <footer className="border-t border-border-subtle bg-surface/40 backdrop-blur-sm py-6 relative z-10 mt-12 text-xs text-text-secondary">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-mint-500 animate-pulse" />
                <span className="font-medium text-text-primary">BasketLoop Protocol</span>
                <span className="text-text-muted hidden md:inline">&bull; Continuous Recurring Investment Engine</span>
              </div>

              <div className="flex items-center gap-4 text-text-muted">
                <a
                  href="https://explorer.testnet.chain.robinhood.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-text-primary inline-flex items-center gap-1 transition-colors"
                >
                  Robinhood Chain Testnet (46630)
                  <ExternalLink className="h-3 w-3" />
                </a>
                <span>&bull;</span>
                <a
                  href="https://sepolia.arbiscan.io"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-text-primary inline-flex items-center gap-1 transition-colors"
                >
                  Arbitrum Sepolia (421614)
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="text-text-muted">&copy; {new Date().getFullYear()} BasketLoop. All rights reserved.</div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
