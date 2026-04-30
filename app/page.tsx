"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";

type ProfileResponse = {
  ok: boolean;
  data?: {
    needsProfileSetup?: boolean;
  };
};

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolveState() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) {
          setIsLoggedIn(false);
          setNeedsProfileSetup(false);
          setIsLoading(false);
        }
        return;
      }

      const response = await fetch("/api/profile/me", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!cancelled) {
        setIsLoggedIn(true);
        if (response.ok) {
          const result = (await response.json()) as ProfileResponse;
          const profileMissing = Boolean(result.data?.needsProfileSetup);
          setNeedsProfileSetup(profileMissing);
          if (profileMissing) {
            router.replace("/profile/setup");
            return;
          }
        }
        setIsLoading(false);
      }
    }
    void resolveState();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const cta = useMemo(() => {
    if (isLoggedIn) {
      return { label: "空き日程を登録する", href: "/availability" };
    }
    return {
      label: "今すぐ始める（Google/Emailログイン）",
      href: "/login",
    };
  }, [isLoggedIn]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20 text-center">
      <section className="space-y-8">
        <p className="text-sm tracking-[0.22em] text-slate-500">BLIND MATCHING APP</p>
        <h1 className="text-balance text-5xl font-semibold leading-tight text-slate-900 sm:text-6xl">
          まずは出会おう！
        </h1>
        <p className="mx-auto max-w-2xl text-pretty text-lg leading-relaxed text-slate-600 sm:text-xl">
          写真なし。一期一会。直感的な出会いを
        </p>
        <div className="pt-4">
          <Link
            href={cta.href}
            className="inline-flex min-w-72 items-center justify-center rounded-full bg-slate-900 px-8 py-4 text-base font-medium text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          >
            {isLoading ? "読み込み中..." : cta.label}
          </Link>
        </div>
        {needsProfileSetup ? (
          <p className="text-sm text-amber-700">プロフィール未設定のため、設定画面へ移動します。</p>
        ) : null}
      </section>
    </main>
  );
}
