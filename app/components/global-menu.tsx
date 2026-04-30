"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, UserCog, Settings, X } from "lucide-react";
import { supabase } from "../lib/supabase";

export function GlobalMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        setIsLoggedIn(Boolean(session?.access_token));
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="fixed left-4 top-4 z-50">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-10 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-sm backdrop-blur transition hover:bg-gray-50"
        aria-label="メニューを開く"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {open ? (
        <div className="mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg">
          <Link
            href="/profile/setup"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
          >
            <UserCog className="size-4 text-gray-500" />
            プロフィールを修正
          </Link>
          <button
            type="button"
            disabled
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-400"
          >
            <Settings className="size-4" />
            設定（準備中）
          </button>
        </div>
      ) : null}
    </div>
  );
}
