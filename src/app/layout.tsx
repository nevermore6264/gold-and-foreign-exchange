import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_STORAGE_KEY } from "@/lib/theme-preference";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Giá vàng & Tỷ giá | Kitco, Vietcombank",
  description: "Xem giá vàng từ 2022 đến nay và tỷ giá Vietcombank.",
  icons: {
    icon: "/favicon.svg",
  },
};

const themeBootstrapScript = `
(function(){
  var k=${JSON.stringify(THEME_STORAGE_KEY)};
  try{
    try{ localStorage.removeItem(k); }catch(e){}
    var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark',dark);
  }catch(e){}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full min-h-0 antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
