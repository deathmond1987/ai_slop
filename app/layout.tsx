import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getLang, getT } from "@/lib/i18n";
import { getSteamSession } from "@/lib/session";
import { getWishlistTotalForSession } from "@/lib/wishlist-total-cache";
import { getThemePreference, themeClass } from "@/lib/theme-mode";
import { Header } from "@/components/Header";
import { ViewportMetrics } from "@/components/ViewportMetrics";
import { DesktopExternalLinks } from "@/components/DesktopExternalLinks";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "cyrillic"] });

const themeScript = `(function(){try{var d=document.documentElement,cookie=document.cookie.match(/(?:^|; )ui_theme=([^;]*)/),v=cookie?decodeURIComponent(cookie[1]):"";d.classList.remove("light","dark","theme-system");if(v==="dark")d.classList.add("dark");else if(v==="light")d.classList.add("light");else{d.classList.add("theme-system");if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)d.classList.add("dark")}}catch(e){}})()`;

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSteamSession();
  const t = await getT(session?.steamId);
  return {
    title: t("app.title"),
    description: t("app.tagline"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSteamSession();
  const lang = await getLang(session?.steamId);
  const theme = await getThemePreference();
  const signedIn = Boolean(session?.steamId);
  const wishlistTotal = signedIn
    ? await getWishlistTotalForSession(session, { refresh: false })
    : undefined;
  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${themeClass(theme)}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ViewportMetrics />
        <DesktopExternalLinks />
        <Header
          lang={lang}
          theme={theme}
          signedIn={signedIn}
          displayName={session?.displayName}
          avatar={session?.avatar}
          storeCc={session?.storeCc}
          initialTotal={wishlistTotal}
        />
        <main className="app-shell flex-1 px-3 py-3">{children}</main>
      </body>
    </html>
  );
}
