"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export function AuthSyncGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    async function syncUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;

      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok || cancelled) return;

      const result = (await response.json()) as { data?: { needsProfileSetup?: boolean } };
      if (result.data?.needsProfileSetup && pathname !== "/profile/setup") {
        router.replace("/profile/setup");
      }
    }

    void syncUser();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
