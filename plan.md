# Face Mosaic App 設計書

## 全体方針

**モデルは「顔の場所を返すだけ」**
**モザイクはフロントでかける**
**すべてブラウザ内で完結。サーバー送信なし。**

公開URL: `https://T3pp31.github.io/face-mosaic-app/`

```text
[入力画像]
    ↓
[前処理: 128x128 resize, RGB CHW, 0-1 normalize]
    ↓
[ONNX Runtime Web (wasm) で顔検出]
    ↓
[後処理: 正規化座標 → ピクセル座標]
    ↓
[Canvas に描画]
    ↓
[検出した顔領域だけモザイク（0件なら未適用を警告・保存前に確認）]
```

---

## 技術スタック

| カテゴリ | 選定 |
|---------|------|
| フレームワーク | Vite + React + TypeScript |
| 推論エンジン | onnxruntime-web (wasm バックエンド) |
| 顔検出モデル | BlazeFace ONNX (garavv/blazeface-onnx, 524KB) |
| 描画 | Canvas API |
| テスト | Vitest + @testing-library/react |
| デプロイ | GitHub Actions → GitHub Pages |

---

## モデル仕様 (BlazeFace ONNX)

### 入力

| テンソル名 | 形状 | 型 | 説明 |
|-----------|------|-----|------|
| `image` | [1, 3, 128, 128] | float32 | RGB, 0-1正規化 |
| `conf_threshold` | [1] | float32 | 信頼度閾値 (デフォルト: 0.5) |
| `iou_threshold` | [1] | float32 | NMS IoU閾値 (デフォルト: 0.3) |
| `max_detections` | [1] | int64 | 最大検出数 (デフォルト: 25) |

### 出力

| テンソル名 | 形状 | 型 | 説明 |
|-----------|------|-----|------|
| `selectedBoxes` | [1, 896, 16] | float32 | NMS済み検出結果 |

各行の16値: `[y_min, x_min, y_max, x_max, kp1_y, kp1_x, ..., kp6_y, kp6_x]`
- 正規化座標 (0-1)
- NMSはモデル内蔵
- 未使用スロットは全0

---

## ディレクトリ構成

```text
face-mosaic-app/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Pages 自動デプロイ
├── public/
│   └── models/
│       └── blaze.onnx              # BlazeFace モデル (524KB)
├── src/
│   ├── config/
│   │   └── constants.ts            # 全設定値を集約
│   ├── lib/
│   │   ├── onnx/
│   │   │   ├── session.ts          # ONNX セッション管理 (シングルトン)
│   │   │   ├── preprocess.ts       # 画像 → テンソル変換
│   │   │   └── postprocess.ts      # 検出結果 → FaceBox 変換
│   │   └── mosaic/
│   │       └── mosaicCanvas.ts     # Canvas 描画 + モザイク処理
│   ├── hooks/
│   │   └── useFaceDetection.ts     # 顔検出カスタムフック
│   ├── components/
│   │   ├── ImageUploader.tsx        # ドラッグ&ドロップ対応ファイル入力
│   │   ├── MosaicCanvas.tsx         # 結果表示 Canvas ラッパー
│   │   └── ImageFaceMosaic.tsx      # 画像モザイク統合コンポーネント
│   ├── App.tsx                      # ルートコンポーネント
│   ├── App.css                      # アプリスタイル
│   ├── index.css                    # ベーススタイル
│   └── main.tsx                     # エントリポイント
├── tests/
│   ├── setup.ts                     # Vitest セットアップ
│   ├── lib/
│   │   ├── onnx/
│   │   │   ├── session.test.ts
│   │   │   ├── preprocess.test.ts
│   │   │   └── postprocess.test.ts
│   │   └── mosaic/
│   │       └── mosaicCanvas.test.ts
│   └── components/
│       ├── useFaceDetection.test.ts
│       ├── ImageUploader.test.tsx
│       ├── MosaicCanvas.test.tsx
│       └── ImageFaceMosaic.test.tsx
├── index.html
├── vite.config.ts                   # base: '/face-mosaic-app/'
├── vitest.config.ts
├── tsconfig.json
├── tsconfig.app.json
└── package.json
```

---

## データフロー

### 画像入力時

```text
File input / Drag & Drop
  - 新規アップロード開始時に前回の結果・顔未検出警告・確認ダイアログをリセット
    (hasResult = false, noFaceDetected = false, isConfirmOpen = false)
  ↓
HTMLImageElement 生成 (URL.createObjectURL → img.decode())
  ↓
preprocessImageToTensor()
  - Canvas で 128x128 にリサイズ
  - RGBA → RGB CHW 変換
  - 0-1 正規化
  - ort.Tensor [1, 3, 128, 128] 作成
  ↓
runFaceDetection()
  - session.run({ image, conf_threshold, iou_threshold, max_detections })
  - selectedBoxes [1, 896, 16] 取得
  ↓
postprocessDetections()
  - 全0行をスキップ
  - [y_min, x_min, y_max, x_max] → [x1, y1, x2, y2] (ピクセル座標)
  - MIN_FACE_SIZE 未満を除外
  ↓
drawImageWithMosaic()
  - 元画像を Canvas に描画
  - 各 FaceBox に BBOX_PADDING_RATIO 分だけ拡張
  - applyPixelMosaic(): 縮小 → 最近傍拡大でモザイク
  - FaceBox が0件なら元画像の描画のみ（モザイクは適用されない）
  ↓
ImageFaceMosaic: faces.length === 0 ?
  ├─ No（1件以上）: noFaceDetected = false
  │   - 顔未検出の警告を表示しない
  │   - 「画像をダウンロード」から確認なしで PNG 保存
  └─ Yes（0件）: noFaceDetected = true
      - role="alert" で「顔が検出されませんでした」
        「この画像にはモザイクが適用されていません」と明示
      - 現在の「検出信頼度しきい値」を下げて再アップロードするよう案内
      - Canvas には未処理画像を表示するが、ダウンロード前に確認ダイアログ
          ├─ 「キャンセル」: 保存せずダイアログを閉じる
          └─ 「ダウンロードする」: 未処理を了承のうえ PNG 保存
```

- **再試行**: 信頼度しきい値のスライダー変更だけでは顔検出を再実行しない。しきい値を下げた後、画像を再アップロードする（自動再試行はしない）。
- **状態管理**: 新しいファイル選択時に以前の警告・確認状態をクリアし、再検出で顔が1件以上見つかれば警告を表示しない。検出処理の例外は「検出0件」とは区別し、結果と顔未検出警告をクリアして既存のエラー表示を使用する。
- **保存**: PNG ダウンロードはブラウザ内の `Canvas.toBlob()` を使用する。検出0件でもユーザーが明示的に確認すれば未処理画像を保存できるため、警告はモザイク適用を保証するものではない。

※ 顔未検出時の警告・確認処理は Issue #70 に対応する **PR #75（Draft）** の実装に基づく追加仕様であり、PR #75 のマージ前は `main` には未反映。手動モザイク範囲の指定は PR #75 の対象外。

---

## 設定値一覧

`src/config/constants.ts` に全設定値を集約:

| 定数名 | 値 | 説明 |
|--------|-----|------|
| `MODEL_PATH` | `${BASE_URL}models/blaze.onnx` | モデルファイルパス |
| `MODEL_INPUT_NAME` | `'image'` | 入力テンソル名 |
| `MODEL_INPUT_SIZE` | `128` | モデル入力サイズ |
| `CONF_THRESHOLD` | `0.5` | 信頼度閾値 |
| `IOU_THRESHOLD` | `0.3` | NMS IoU閾値 |
| `MAX_DETECTIONS` | `25` | 最大検出数 |
| `MOSAIC_SCALE` | `0.08` | モザイクの粗さ |
| `BBOX_PADDING_RATIO` | `0.15` | bbox拡張率 |
| `MIN_FACE_SIZE` | `5` | 最小顔サイズ (px) |
| `BLAZEFACE_ANCHOR_COUNT` | `896` | アンカー数 |
| `VALUES_PER_DETECTION` | `16` | 検出あたりの値数 |

---

## WASM 配信戦略

onnxruntime-web の WASM バイナリは jsDelivr CDN から読み込む:

```ts
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'
ort.env.wasm.numThreads = 1  // シングルスレッドで安定動作
```

---

## モザイク処理

「縮小 → 最近傍補間で拡大」方式:

1. 顔領域を `w * MOSAIC_SCALE` × `h * MOSAIC_SCALE` の一時 Canvas に縮小描画
2. `imageSmoothingEnabled = false` で最近傍補間を有効化
3. 一時 Canvas を元サイズに拡大して上書き
4. ピクセレート（モザイク）効果を得る

---

## デプロイ

### GitHub Actions (`.github/workflows/deploy.yml`)

1. `main` ブランチへ push
2. Node.js 22 セットアップ
3. `npm ci` → `npm test` → `npm run build`
4. `dist/` を GitHub Pages artifact としてアップロード
5. GitHub Pages へデプロイ

### 事前設定

GitHub リポジトリの Settings → Pages → Source を **「GitHub Actions」** に変更すること。

---

## セキュリティとプライバシー

この構成の強みは **サーバー送信なしで完結できる** こと:

* 入力画像はブラウザ内のみ
* 推論もブラウザ内
* モザイク結果もブラウザ内

プライバシー要件が強い案件に向いている。

---

## Phase ロードマップ

### Phase 1 (基本機能は実装済み / 検出0件の安全導線は PR #75 でレビュー中)

* 画像1枚アップロード（ファイル選択 / ドラッグ＆ドロップ）
* 顔検出 (BlazeFace)
* bbox にモザイク
* 結果を Canvas に表示
* 検出信頼度しきい値（デフォルト `0.50`）等のスライダー調整
* **顔検出0件時の警告（PR #75）**: 未処理の画像が Canvas に表示されることを `role="alert"` の警告で明示し、しきい値を下げて再アップロードするよう案内する（自動再検出はしない）
* **保存前の確認（PR #75）**: 結果画像のダウンロード機能を提供し、検出0件時のみ未処理であることを確認するダイアログを表示する。「キャンセル」で中止、「ダウンロードする」で PNG 保存する。顔検出1件以上なら確認なしで保存する
* **状態リセット（PR #75）**: 新規画像アップロード時に前の結果・警告・確認ダイアログをリセットし、次の検出で顔が1件以上見つかれば警告を解除する。エラー時は顔未検出警告ではなく既存のエラー表示を使用する

上記の **PR #75 関連項目は Draft PR に実装された追加仕様**。現行 `main` に反映されるのは PR #75 マージ後であり、手動のモザイク範囲指定は含まれない。

### Phase 2 (今後)

* 複数顔対応の精度改善
* bbox 拡張パラメータの UI 改善
* 検出パラメータ調整 UI の操作性改善

### Phase 3 (今後)

* Webcam 対応
* 推論間引き (3-5フレームに1回)
* bbox 平滑化 (EMA)

### Phase 4 (今後)

* 顔セグメンテーション
* 楕円マスク
* 追跡導入

---

## 性能目安

| 環境 | 期待 |
|------|------|
| 画像 | ほぼ問題なし |
| PC Webcam | 128x128 軽量モデルならリアルタイム寄り |
| スマホ | 機種差大。入力解像度を下げ推論頻度を落とす |

---

## 落とし穴と対策

| 落とし穴 | 対策 |
|---------|------|
| BlazeFace の座標が正規化値 | postprocess で originalWidth/Height を掛ける |
| bbox の座標順が y,x | `[y_min, x_min, y_max, x_max]` corner format でパース |
| 顔の取りこぼし | `BBOX_PADDING_RATIO = 0.15` で 15% 拡張 |
| 検出0件でも元画像が結果として表示・保存される | 未処理と明示する `role="alert"` 警告、しきい値を下げて再アップロードする案内、ダウンロード前の確認を行う（PR #75） |
| WASM ロード遅延 | CDN + ブラウザキャッシュで初回以降は高速 |
| GitHub Pages の base path | `vite.config.ts` の `base: '/face-mosaic-app/'` で対応 |
