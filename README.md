# Giggle 🎸

A free, hybrid-architecture web application (Google for Gigs) that aggregates concert dates for your favorite Spotify artists from Bandsintown, Songkick, Ticket Pia (ぴあ), and Eplus (イープラス).

[日本語のREADMEは下にあります]

---

## 🌟 Features / 主な機能

*   **Smart Sync / Spotify同期**: Log in with Spotify to automatically track your followed artists. / Spotifyでログインし、フォローしているアーティストを自動追跡。
*   **Unified Feed / 統合フィード**: See events from multiple sources (Songkick, Pia, Eplus) in one clean interface with search and pagination. / 検索・ページネーション可能な一つのクリーンな画面で、複数のソース（Songkick, ぴあ, イープラス）のイベントを確認。
*   **Bilingual Support / 多言語対応**: Seamlessly switch between English and Japanese. / 英語と日本語をシームレスに切り替え可能。
*   **Dark Mode / ダークモード**: Beautiful dark and light theme support. / 洗練されたダーク/ライトテーマに対応。
*   **Advanced Filtering / 高度なフィルタリング**: Uses Eplus API V3 and strict keyword exclusion to ensure only music concerts (no museum/zoo tickets) are ingested. / Eplus API V3やキーワード除外ロジックを活用し、音楽コンサートのみを正確に抽出。
*   **0% Cost / コスト0円**: Designed to run entirely on free tiers (Vercel, GitHub Actions, Supabase). / 全て無料枠（Vercel, GitHub Actions, Supabase）で動作。

## 🏗 Architecture / アーキテクチャ

*   **Frontend**: Next.js 14, Tailwind CSS, Framer Motion, `next-themes`, `i18next`-style context (Hosted on Vercel).
*   **Database**: Supabase (PostgreSQL).
*   **Ingestion**: Python scripts using `uv` scheduled via GitHub Actions (Runs daily).

## 🚀 Setup Instructions / セットアップ

### 1. Database (Supabase) / データベース
1.  Create a free project on [Supabase](https://supabase.com/).
2.  Use the **SQL Editor** to run the contents of `supabase_schema.sql`.
3.  Note your `SUPABASE_URL` and `SUPABASE_KEY` (anon public key).
4.  Get your **Database Connection String** for the Python ingestion scripts.

### 2. Environment Variables / 環境変数

#### Frontend / フロントエンド (.env.local)
See `frontend/.env.example`.
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
NEXTAUTH_SECRET=generate_a_random_string
NEXTAUTH_URL=http://localhost:3000
```

#### Backend / バックエンド (GitHub Secrets)
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_service_role_key
```

### 3. Local Development / ローカル開発

**Frontend / フロントエンド:**
```bash
cd frontend
npm install
npm run dev
```

**Backend (Ingestion) / バックエンド:**
```bash
cd ingestion
# Uses 'uv' for high-speed dependency management
uv sync
uv run main.py
```

## 📦 Deployment / デプロイ

### Frontend (Vercel)
Connect your repo to Vercel and add the environment variables listed above.

### Backend (GitHub Actions)
Add `SUPABASE_URL` and `SUPABASE_KEY` to **Settings > Secrets and variables > Actions**. The workflow (`.github/workflows/ingest.yml`) is scheduled to run daily at 8:00 AM UTC.

## 🛡️ Note / 注意点
This project uses lightweight scraping and API integrations for educational purposes. / このプロジェクトは学習目的で軽量なウェブスクレイピングとAPI連携を使用しています。

---

# Giggle (日本語)

## 概要
Spotifyでフォローしているアーティストの来日公演やライブ情報を一括で検索できるアグリゲーターサービスです。

## 🛠 技術スタック
- **Frontend**: Next.js (TypeScript), Tailwind CSS
- **Backend**: Python (Ingestion logic)
- **Database**: Supabase
- **CI/CD**: GitHub Actions (Daily ingestion)

## 🌈 特徴
- **正確なデータ**: イープラスのAPI V3などを活用し、単なる「イベント」ではなく「音楽ライブ」に絞った高精度なデータ取得。
- **使いやすさ**: 英語と日本語のバイリンガル対応、検索・フィルタリング機能。
- **メンテナンスフリー**: 自動バッチ処理により、常に最新の公演情報が反映されます。
