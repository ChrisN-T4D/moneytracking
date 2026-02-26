import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Neu Money Tracking",
  description: "Household money tracker — bills, paychecks, and leftovers",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const APP_VERSION = "1.0";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <AuthProvider>
          <ThemeProvider>
            {children}
            <footer className="fixed bottom-0 left-0 px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500 pointer-events-none z-10">
              v{APP_VERSION}
            </footer>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
