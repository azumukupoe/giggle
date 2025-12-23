# Giggle 🎸

Spotifyでフォローしているアーティストの来日公演やライブ情報を一括で検索できるアグリゲーターサービス（Bandsintown, Songkick, ぴあ, イープラス等に対応）。

[English README (README.md)](README.md)

---

## 🌟 主な機能

*   **Spotify同期**: Spotifyでログインし、フォローしているアーティストを自動追跡。
*   **統合フィード**: 検索・ページネーション可能な一つの画面で、複数のソース（Songkick, ぴあ, イープラス）のイベントを確認。
*   **多言語対応**: 英語と日本語をシームレスに切り替え可能。
*   **ダークモード**: 洗練されたダーク/ライトテーマに対応。
*   **高度なフィルタリング**: イープラスのAPI V3やキーワード除外ロジックを活用し、音楽コンサートのみを正確に抽出。
*   **コスト0円**: 全て無料枠（Vercel, GitHub Actions, Supabase）で動作。

## 🏗 アーキテクチャ

*   **フロントエンド**: Next.js 14, Tailwind CSS, Framer Motion, `next-themes` (Vercelでホスト)。
*   **データベース**: Supabase (PostgreSQL)。
*   **インジェクション**: 毎日GitHub Actionsで実行されるPythonスクリプト (`uv`を使用)。

## 🚀 セットアップ

### 1. データベース (Supabase)
1.  [Supabase](https://supabase.com/)で無料プロジェクトを作成。
2.  **SQL Editor**で`supabase_schema.sql`の内容を実行。
3.  `SUPABASE_URL`と`SUPABASE_KEY`（anon key）を控える。
4.  Pythonスクリプト用に**Database Connection String**を取得。

### 2. 環境変数

#### フロントエンド (.env.local)
`frontend/.env.example`を参照してください。
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXTAUTH_SECRET=generate_a_random_string
NEXTAUTH_URL=http://localhost:3000
```

#### バックエンド (GitHub Secrets)
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_service_role_key
```

### 3. ローカル開発

**フロントエンド:**
```bash
cd frontend
npm install
npm run dev
```

**バックエンド (インジェクション):**
```bash
cd ingestion
# 依存関係管理に 'uv' を使用
uv sync
uv run main.py
```

## 📦 デプロイ

### フロントエンド (Vercel)
GitHubリポジトリをVercelに接続し、上記の環境変数を追加します。

### バックエンド (GitHub Actions)
`SUPABASE_URL`と`SUPABASE_KEY`を**Settings > Secrets and variables > Actions**に追加します。ワークフロー（`.github/workflows/ingest.yml`）は毎日UTC午前8時に実行されるよう設定されています。

## 🛡️ 注意点
このプロジェクトは学習目的で軽量なウェブスクレイピングとAPI連携を使用しています。
