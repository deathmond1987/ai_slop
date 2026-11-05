import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getLang, getT } from "@/lib/i18n";
import { getSteamSession } from "@/lib/session";
import { Header } from "@/components/Header";
import { ViewportMetrics } from "@/components/ViewportMetrics";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "cyrillic"] });

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
  const signedIn = Boolean(session?.steamId);
  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <ViewportMetrics />
        <Header lang={lang} signedIn={signedIn} displayName={session?.displayName} />
        <main className="app-shell flex-1 px-3 py-3">{children}</main>
        <footer className="text-center text-scale-10 opacity-60 py-2">
          Powered by Steam Web API · OpenID · RAWG fallback
        </footer>
      </body>
    </html>
  );
}
