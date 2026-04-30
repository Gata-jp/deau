import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthSyncGate } from "./components/auth-sync-gate";
import { GlobalMenu } from "./components/global-menu";

export const metadata: Metadata = {
  title: "deau",
  description: "Blind matching app prototype",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AuthSyncGate />
        <GlobalMenu />
        {children}
      </body>
    </html>
  );
}
