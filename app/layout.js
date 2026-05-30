import { Geist, Geist_Mono } from "next/font/google";
import { getRuntimeEnvSnapshot } from "@/lib/publicEnv";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Atlas",
  description: "Atlas Emergency Operations Center",
};

export default function RootLayout({ children }) {
  const runtimeEnv = getRuntimeEnvSnapshot();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ATLAS_ENV__=${JSON.stringify(runtimeEnv)}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
