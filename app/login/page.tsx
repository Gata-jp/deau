"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (active && session) {
        router.replace("/");
      }
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  async function signInWithGoogle() {
    setSubmitting(true);
    setError("");
    setMessage("");
    const redirectTo = `${window.location.origin}/`;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (authError) {
      setError(authError.message);
      setSubmitting(false);
    }
  }

  async function signInWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    const redirectTo = `${window.location.origin}/`;
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    setMessage("確認メールを送信しました。メール内リンクからログインしてください。");
    setSubmitting(false);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">ログイン</h1>
        <p className="mt-2 text-sm text-slate-600">
          Google またはメールリンクでログインできます。
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={submitting}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          Googleでログイン
        </button>

        <div className="my-6 h-px bg-slate-200" />

        <form onSubmit={signInWithEmail} className="space-y-3">
          <label className="block text-sm text-slate-700">
            メールアドレス
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2"
              placeholder="you@example.com"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            メールリンクを送る
          </button>
        </form>

        {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      </div>
    </main>
  );
}
