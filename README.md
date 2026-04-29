# deau (Phase 1)

Next.js (App Router) + Prisma + PostgreSQL (Supabase) starter for the blind matching app.

## 1. Prerequisites

- Node.js 20+ (npm included)
- PostgreSQL connection string (Supabase)

## 2. Supabase（PostgreSQL）連携

このアプリの永続層は **Supabase の PostgreSQL** を前提にします。Prisma が `DATABASE_URL` で接続します。

### 2.1 Supabase 側

1. [Supabase](https://supabase.com/) でプロジェクトを作成する。
2. **Project Settings → Database** を開く。
3. **Connection string** で **URI** を選び、表示された接続文字列をコピーする。
4. **マイグレーション（`prisma migrate`）** には、同画面の説明に沿って **Session mode または Direct**（通常はポート `5432`）の接続を使うのが無難です。Transaction pooler（`6543`）だけを使う場合は [Prisma × Supabase](https://www.prisma.io/docs/guides/database/supabase) の注意点（`pgbouncer` 等）を確認してください。

### 2.2 ローカルの `.env`

1. `.env.example` を `.env` にコピーする。
2. `DATABASE_URL` を、手順 2.1 でコピーした値に置き換える（パスワードは Supabase が提示するものを使用）。
3. `MATCH_BATCH_SECRET` に十分長いランダム文字列を設定する。
4. Vercel Cron を使うなら `CRON_SECRET` も設定する（`MATCH_BATCH_SECRET` と同じ値でも可）。

### 2.3 依存関係と DB 反映

1. Install dependencies:

```bash
npm install
```

2. Generate Prisma client and run migration:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

or run both in one command:

```bash
npm run db:setup
```

3. Start development server:

```bash
npm run dev
```

4. Seed sample data (stations/users/availabilities/tags):

```bash
npm run db:seed
```

### 2.4 API の認証（現状）

保護された API は **Supabase Auth のアクセストークン**（`Authorization: Bearer <token>`）を要求します。トークンの `sub`（Supabase User ID）は原則 `User.authUserId` と照合し、後方互換として `User.id` でも解決します。

日次マッチングバッチの起動 API である `POST /api/matches/run` は **`x-batch-secret` ヘッダー** を要求します。値は `.env` の `MATCH_BATCH_SECRET` と一致させてください。

`GET /api/matches/run` でも同じバッチを起動できます。こちらは Vercel Cron を想定しており、`Authorization: Bearer <CRON_SECRET>` または `x-batch-secret` を受け付けます。

## 3. Implemented API endpoints

- `POST /api/availabilities`
- `POST /api/auth/sync`
- `GET /api/profile/me`
- `PUT /api/profile/me`
- `POST /api/matches/run`
- `POST /api/matches/[id]/confirm`
- `POST /api/matches/[id]/checkin`
- `POST /api/matches/[id]/cancel`
- `GET /api/matches/[id]/messages`
- `POST /api/matches/[id]/messages`
- `GET /api/stations/search?q=...`

## 4. Notes

- Chat sending is allowed only from `meetupAt` to `meetupAt + 1 hour`.
- If a match is still `MATCHED` and check-in is incomplete after `meetupAt + 1 hour`, it is treated as `EXPIRED`.
- Cancelling within 24h increments `penaltyPoints`.
- `POST /api/matches/run` は日次バッチ実行用です。実運用では毎日22:00に cron などから叩く想定です。
- マッチング条件は、希望性別の双方一致・年齢差5歳以内・空き時間の重なり・推定移動時間120分以内です。
- 移動時間は現在、駅座標からの近似値で推定しています。30分単位のバケットで優先度を付け、同率時は待機日数が長いペアを優先します。
- 同じ相手との連続マッチは禁止し、過去30日以内に成立した同一ペアは除外します。

### 4.1 Idempotency and status guards

- `POST /api/matches/[id]/confirm`
  - already confirmed (`MATCHED`) => `409 ALREADY_CONFIRMED`
  - `COMPLETED` / `CANCELLED` / `EXPIRED` => `409 INVALID_STATUS`
- `POST /api/matches/[id]/checkin`
  - same user check-in twice => `409 ALREADY_CHECKED_IN`
  - `PENDING` => `409 INVALID_STATUS` (confirm first)
  - `CANCELLED` / `EXPIRED` => `409 INVALID_STATUS`
- `POST /api/matches/[id]/messages`
  - only allowed when status is `MATCHED` or `COMPLETED`
  - if chat window is closed => `403 CHAT_WINDOW_CLOSED`
- `POST /api/auth/sync`
  - validates `Authorization: Bearer <token>` via Supabase Auth
  - upserts app user by `authUserId`
  - returns `needsProfileSetup` when required profile fields are still missing
- `PUT /api/profile/me`
  - updates required profile fields (`nickname`, `birthDate`, `gender`, `preferenceGender`, `nearestStationId`)
  - turns `matchingEnabled` on after successful setup

## 5. 22時自動実行の設定

### Vercel Cron を使う場合

- `vercel.json` に毎日 `22:00 JST` 相当の `13:00 UTC` で `/api/matches/run` を叩く設定を追加済みです。
- Vercel の Environment Variables に `CRON_SECRET` を設定してください。
- Vercel Cron は `Authorization: Bearer <CRON_SECRET>` でリクエストしてくる前提です。

### GitHub Actions を使う場合

- `.github/workflows/daily-match-batch.yml` を追加済みです。
- GitHub の repository secrets に以下を設定してください。
  - `APP_BASE_URL` 例: `https://your-app.vercel.app`
  - `MATCH_BATCH_SECRET`
- 毎日 `22:00 JST` 相当の `13:00 UTC` に `POST /api/matches/run` を叩きます。

## 6. Vercel 連携チェックリスト

### 6.1 Project 作成

1. GitHub リポジトリを Vercel に Import する。
2. Framework Preset は `Next.js` のままでよい。
3. Build / Output 設定はデフォルトのままで開始する。

### 6.2 Environment Variables（Vercel）

最低限、以下を `Production`（必要なら `Preview` も）に設定:

- `DATABASE_URL`
- `MATCH_BATCH_SECRET`
- `CRON_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

推奨:

- `CRON_SECRET` は `MATCH_BATCH_SECRET` と同値にして運用を単純化。
- 値の更新後は再デプロイして反映を確認。

### 6.3 初回デプロイ後の確認

1. `GET /api/matches/run` を手動実行（`Authorization: Bearer <CRON_SECRET>` 付き）。
2. 200 応答と `ok: true` を確認。
3. Supabase 側で `Match` / `Availability` の更新を確認。

例:

```bash
curl -X GET "https://<your-app>.vercel.app/api/matches/run" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### 6.4 Cron の確認

- `vercel.json` の cron (`0 13 * * *`) は 22:00 JST 相当。
- Vercel Dashboard の Functions / Logs で `/api/matches/run` の日次実行ログを確認。

### 6.5 トラブル時の確認ポイント

- `401 UNAUTHORIZED`: `CRON_SECRET` / `MATCH_BATCH_SECRET` の不一致
- `500 BATCH_SECRET_NOT_CONFIGURED`: Vercel Environment Variables 未設定
- `P1001` など DB 接続エラー: `DATABASE_URL`（pooler/ssl/pgbouncer）の設定を再確認
