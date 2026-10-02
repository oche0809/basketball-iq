# Basketball IQ 教材サイト（MVP：STEP 1〜9）

中学生が「プレーを覚える選手」ではなく「状況を見て、自分で判断し、相手の反応に合わせて判断を変えられる選手」になるための教材サイト。

## 公開先

https://oche0809.github.io/basketball-iq/

## 主な機能

- **PLAY**：問題を「見る → 判断 → なぜ →（次の判断）→ 解説」の順に解く。同じ場面で DF や時計だけが違う問題セットもある
- **MAP**：76 の学習項目を、カテゴリー・難易度・学年・キーワードで探す
- **MY IQ**：これまでの回答の記録（見る・判断・理由を分けて回数で表示。点数や順位はつけない）
- **COACH**（先生用・PC の上部ナビ、または `#/coach`）：問題かセットを選んで課題URLを作る
- 学習記録はブラウザの localStorage にだけ保存し、どこにも送信しない（ログイン・サーバーなし）

## 技術構成

React・Vite・TypeScript・Tailwind CSS。ハッシュルーティング（`#/play` など）の静的サイトで、GitHub Actions から GitHub Pages に公開する。テストは Vitest（ユニット）と Playwright（ブラウザ）。

## 起動

```bash
./setup.sh   # 最初に1回（パッケージを入れる）
./run.sh     # 起動してブラウザで開く（終了は Ctrl+C）
```

| コマンド | 内容 |
|---|---|
| `npm run check` | 教材データ（data/）のチェック |
| `npm test` | ユニットテスト（Vitest） |
| `npm run test:e2e` | ブラウザの自動テスト（Playwright。ビルドとテスト用サーバーの起動も自動） |
| `npm run build` | データチェック → 公開用ビルド（dist/） |

- 教材の原本は `data/`（v2）。画面のコードには教材の本文を書かず、起動・ビルド時に `public/data/` へコピーして読み込む。
- 教材データに問題があると、ビルドは止まり、画面にも「教材を表示できません」と理由が出る。

## 設計文書

| ファイル | 内容 |
|---|---|
| `docs/01_repository_analysis.md` | 既存リポジトリ（練習メニュー倉庫・作戦盤）の分析と技術選定 |
| `docs/02_design.md` | 設計 v2（IQ の定義・循環プロセス・見る／判断／理由の分離・問題セット・根拠・JBA ルール） |
| `docs/03_curriculum.md` | カリキュラム v2（105 項目をレビューし 76 項目。全項目に見る問い・判断の問い） |
| `docs/04_mvp_roadmap.md` | MVP の最終仕様・ロードマップ・実装計画・実装開始条件 |
| `docs/CHANGELOG.md` | v1 → v2 の変更点 |
| `data/curriculum.json` | カリキュラム（76 項目・問題セット計画 17・外した項目 29） |
| `data/sample_questions.json` | サンプル教材 15 問・問題セット 4（見る→判断→なぜ→相手の反応） |
| `data/cues.json` | 手がかり（何を見るか）35 件 |
| `data/rules.json` | JBA ルール（条文番号つき・制約だけ）20 件 |
| `data/sources.json` | 出典の登録簿 17 件（確認できた内容／未確認の点） |
| `data/links_drills.json` | 練習メニュー倉庫の ID → 題名（68 件） |

## 実装前に決めてほしいこと

`docs/04_mvp_roadmap.md` 4章の末尾を参照（決まっていなくても STEP 1〜7 は進められる）。
