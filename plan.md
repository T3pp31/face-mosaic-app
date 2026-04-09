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
[顔領域だけモザイク]
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

各行の16値: `[y_center, x_center, h, w, kp1_y, kp1_x, ..., kp6_y, kp6_x]`
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
  - [y_center, x_center, h, w] → [x1, y1, x2, y2] (ピクセル座標)
  - MIN_FACE_SIZE 未満を除外
  ↓
drawImageWithMosaic()
  - 元画像を Canvas に描画
  - 各 FaceBox に BBOX_PADDING_RATIO 分だけ拡張
  - applyPixelMosaic(): 縮小 → 最近傍拡大でモザイク
```

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

### Phase 1 (実装済み)

* 画像1枚アップロード
* 顔検出 (BlazeFace)
* bbox にモザイク
* 結果を Canvas に表示

### Phase 2 (今後)

* 複数顔対応の精度改善
* bbox 拡張パラメータの UI 調整
* score/NMS パラメータのスライダー

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
| bbox の座標順が y,x | `[y_center, x_center, h, w]` の順で正しくパース |
| 顔の取りこぼし | `BBOX_PADDING_RATIO = 0.15` で 15% 拡張 |
| WASM ロード遅延 | CDN + ブラウザキャッシュで初回以降は高速 |
| GitHub Pages の base path | `vite.config.ts` の `base: '/face-mosaic-app/'` で対応 |
