"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [gender, setGender] = useState<(typeof genders)[number]["value"]>("OTHER");
  const [preferenceGender, setPreferenceGender] = useState<(typeof preferenceGenders)[number]["value"]>("ANY");
  const [stationQuery, setStationQuery] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [nearestStationId, setNearestStationId] = useState("");
  const [stationLoading, setStationLoading] = useState(false);
  const [stationError, setStationError] = useState("");
  const [stationSearched, setStationSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === nearestStationId),
    [nearestStationId, stations]
  );

  async function searchStations() {
    const q = stationQuery.trim();
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
    void searchStations();
    // initial fetch only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          gender,
          preferenceGender,
          nearestStationId,
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
    <form onSubmit={onSubmit}>
      <h1>プロフィール設定</h1>
      <p>マッチング希望性別を含む必須項目を入力してください。</p>

      <label>
        ニックネーム
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={40} />
      </label>

      <label>
        生年月日
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
      </label>

      <label>
        性別
        <select value={gender} onChange={(e) => setGender(e.target.value as (typeof genders)[number]["value"])}>
          {genders.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        マッチング希望性別
        <select
          value={preferenceGender}
          onChange={(e) =>
            setPreferenceGender(e.target.value as (typeof preferenceGenders)[number]["value"])
          }
        >
          {preferenceGenders.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        最寄り駅検索
        <input
          value={stationQuery}
          onChange={(e) => setStationQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void searchStations();
            }
          }}
        />
      </label>
      <button type="button" onClick={() => void searchStations()}>
        {stationLoading ? "検索中..." : "駅を検索"}
      </button>
      <label>
        最寄り駅
        <select value={nearestStationId} onChange={(e) => setNearestStationId(e.target.value)} required>
          <option value="">選択してください</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
              {station.lineName ? ` (${station.lineName})` : ""}
            </option>
          ))}
        </select>
      </label>

      {selectedStation ? <p>選択中: {selectedStation.name}</p> : null}
      {stationError ? <p>{stationError}</p> : null}
      {stationSearched && !stationLoading && !stationError && stations.length === 0 ? (
        <p>該当する駅が見つかりませんでした。別のキーワードでお試しください。</p>
      ) : null}
      {error ? <p>{error}</p> : null}

      <button type="submit" disabled={loading}>
        {loading ? "保存中..." : "プロフィールを保存"}
      </button>
    </form>
  );
}
