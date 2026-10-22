import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
import { AuthProvider } from "@/context/auth-context";
import { LocaleProvider } from "@/context/locale-context";
import ThemeSync from "@/components/ThemeSync";
import PwaRegister from "@/components/pwa-register";
import AppFooter from "@/components/AppFooter";
import "./globals.css";
import { BRAND } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: "Household bill tracking made simple",
};

export const viewport: Viewport = {
  themeColor: "#2f9e5f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full`}
    >
      <head>
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme'),c=document.documentElement.classList;if(t==='dark'||t==='vesperfall')c.add('dark');if(t==='vesperfall')c.add('theme-vesperfall');})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col pb-9 bg-[#F6FAF8] dark:bg-slate-900 antialiased">
        <ThemeSync />
        <PwaRegister />
        <AuthProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </AuthProvider>
        <AppFooter />
      </body>
    </html>
  );
}
