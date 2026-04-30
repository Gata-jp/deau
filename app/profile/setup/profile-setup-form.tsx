"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Station = {
  id: string;
  name: string;
  lineName: string | null;
};

const genders = [
  { value: "MALE", label: "男性" },
  { value: "FEMALE", label: "女性" },
  { value: "NON_BINARY", label: "ノンバイナリー" },
  { value: "OTHER", label: "その他" },
] as const;

const preferenceGenders = [
  { value: "MALE", label: "男性" },
  { value: "FEMALE", label: "女性" },
  { value: "NON_BINARY", label: "ノンバイナリー" },
  { value: "ANY", label: "こだわらない" },
] as const;

export function ProfileSetupForm() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [city, setCity] = useState("");
  const [areaNote, setAreaNote] = useState("");
  const [gender, setGender] = useState<(typeof genders)[number]["value"]>("OTHER");
  const [preferenceGender, setPreferenceGender] = useState<(typeof preferenceGenders)[number]["value"]>("ANY");
  const [stationQuery, setStationQuery] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [nearestStationId, setNearestStationId] = useState("");
  const [stationLoading, setStationLoading] = useState(false);
  const [stationError, setStationError] = useState("");
  const [stationSearched, setStationSearched] = useState(false);
  const [selectedStationLabel, setSelectedStationLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === nearestStationId),
    [nearestStationId, stations]
  );
  const isFormComplete =
    nickname.trim().length > 0 &&
    birthDate.trim().length > 0 &&
    prefecture.trim().length > 0 &&
    city.trim().length > 0 &&
    gender.trim().length > 0 &&
    preferenceGender.trim().length > 0;

  async function searchStations(query: string) {
    const q = query.trim();
    setStationLoading(true);
    setStationError("");
    setStationSearched(true);
    try {
      const response = await fetch(`/api/stations/search?q=${encodeURIComponent(q)}`);
      const json = (await response.json()) as { ok?: boolean; data?: { stations?: Station[] } };
      if (!response.ok || !json.ok) {
        setStationError("駅検索に失敗しました。時間を置いて再試行してください。");
        setStations([]);
        return;
      }
      setStations(json.data?.stations ?? []);
    } catch {
      setStationError("駅検索に失敗しました。時間を置いて再試行してください。");
      setStations([]);
    } finally {
      setStationLoading(false);
    }
  }

  useEffect(() => {
    void searchStations("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchStations(stationQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [stationQuery]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("ログインセッションがありません。再ログインしてください。");
        return;
      }

      const response = await fetch("/api/profile/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nickname,
          birthDate,
          prefecture,
          city,
          areaNote: areaNote.trim() || undefined,
          gender,
          preferenceGender,
          nearestStationId: nearestStationId || undefined,
        }),
      });

      const result = (await response.json()) as { ok: boolean; error?: { message?: string } };
      if (!result.ok) {
        setError(result.error?.message ?? "プロフィールの保存に失敗しました。");
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-semibold text-gray-900">プロフィール設定</h1>
        <p className="mt-2 text-sm text-gray-600">あなたの内面を、少しだけ教えてください</p>
      </motion.div>

      <form onSubmit={onSubmit} className="space-y-5">
        <motion.label
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="block"
        >
          <span className="mb-1 block text-sm font-medium text-gray-700">ニックネーム</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
            maxLength={40}
            placeholder="本名である必要はありません"
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          />
        </motion.label>

        <motion.label
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="block"
        >
          <span className="mb-1 block text-sm font-medium text-gray-700">生年月日</span>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          />
        </motion.label>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">都道府県</span>
            <input
              value={prefecture}
              onChange={(e) => setPrefecture(e.target.value)}
              required
              placeholder="東京都"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">市区町村</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              placeholder="渋谷区"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
          </label>
        </motion.div>

        <motion.label
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 }}
          className="block"
        >
          <span className="mb-1 block text-sm font-medium text-gray-700">活動エリアメモ（任意）</span>
          <input
            value={areaNote}
            onChange={(e) => setAreaNote(e.target.value)}
            maxLength={200}
            placeholder="新宿・渋谷・池袋あたり"
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
          />
        </motion.label>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.11 }}
        >
          <p className="mb-2 text-sm font-medium text-gray-700">あなたの性別</p>
          <div className="flex flex-wrap gap-2">
            {genders.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setGender(item.value)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  gender === item.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.14 }}
        >
          <p className="mb-2 text-sm font-medium text-gray-700">マッチングで希望する性別</p>
          <div className="flex flex-wrap gap-2 rounded-xl bg-gray-50 p-3">
            {preferenceGenders.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setPreferenceGender(item.value)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  preferenceGender === item.value
                    ? "border-indigo-700 bg-indigo-700 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.17 }}
          className="space-y-2"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">最寄り駅検索（任意）</span>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <input
                value={stationQuery}
                onChange={(e) => {
                  setStationQuery(e.target.value);
                  setNearestStationId("");
                  setSelectedStationLabel("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchStations(stationQuery);
                  }
                }}
                placeholder="駅名 / 路線名 / かな で検索"
                className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </label>

          <button
            type="button"
            onClick={() => void searchStations(stationQuery)}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            {stationLoading ? "検索中..." : "駅を検索"}
          </button>

          <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
            {stations.length > 0 ? (
              <div className="space-y-1">
                {stations.map((station) => (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => {
                      setNearestStationId(station.id);
                      setSelectedStationLabel(
                        station.lineName ? `${station.name} (${station.lineName})` : station.name
                      );
                      setStationQuery(station.name);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      nearestStationId === station.id
                        ? "bg-slate-900 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {station.name}
                    {station.lineName ? ` (${station.lineName})` : ""}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-2 py-3 text-sm text-gray-500">検索すると候補がここに表示されます。</p>
            )}
          </div>
        </motion.div>

        {selectedStation ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">選択中: {selectedStation.name}</p>
        ) : selectedStationLabel ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            選択中: {selectedStationLabel}
          </p>
        ) : null}
        {stationError ? <p className="text-sm text-rose-700">{stationError}</p> : null}
        {stationSearched && !stationLoading && !stationError && stations.length === 0 ? (
          <p className="text-sm text-gray-600">該当する駅が見つかりませんでした。別のキーワードでお試しください。</p>
        ) : null}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}

        <motion.button
          type="submit"
          disabled={loading || !isFormComplete}
          whileTap={{ scale: loading || !isFormComplete ? 1 : 0.98 }}
          className={`w-full rounded-xl px-4 py-3 text-sm font-medium text-white transition-all duration-300 ${
            loading || !isFormComplete
              ? "cursor-not-allowed bg-gray-300"
              : "bg-slate-900 shadow-sm hover:bg-slate-800"
          }`}
        >
          {loading ? "保存中..." : "プロフィールを保存"}
        </motion.button>
      </form>
    </div>
  );
}
