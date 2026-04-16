import {
  VALUES_PER_DETECTION,
  MIN_FACE_SIZE,
  MODEL_INPUT_SIZE,
} from '@/config/constants'

export type FaceBox = {
  x1: number
  y1: number
  x2: number
  y2: number
  score: number
}

/**
 * モデル出力の selectedBoxes を FaceBox 配列に変換する
 *
 * selectedBoxes は flatten 済み Float32Array（長さ = N × 16）
 * 各行の 16 値: [y_min, x_min, y_max, x_max, kp1_y, kp1_x, ..., kp6_y, kp6_x]
 * 検出ごとに座標系を判定してピクセル座標へ変換する:
 * - xMax または yMax が 1.0 を超える場合: モデル入力サイズ基準 (0-MODEL_INPUT_SIZE)
 * - それ以外: 正規化座標 (0-1)
 * 同一バッチ内に両座標系が混在していても、各検出を独立に処理する。
 * NMS はモデル内蔵のため score は 1.0 固定
 *
 * @param selectedBoxes   推論出力 Float32Array（長さ = N × 16）
 * @param originalWidth   元画像の幅（px）
 * @param originalHeight  元画像の高さ（px）
 * @returns               有効な FaceBox の配列
 */
export function postprocessDetections(
  selectedBoxes: Float32Array,
  originalWidth: number,
  originalHeight: number,
): FaceBox[] {
  const results: FaceBox[] = []
  const numDetections = selectedBoxes.length / VALUES_PER_DETECTION

  for (let i = 0; i < numDetections; i++) {
    const offset = i * VALUES_PER_DETECTION

    const yMin = selectedBoxes[offset]
    const xMin = selectedBoxes[offset + 1]
    const yMax = selectedBoxes[offset + 2]
    const xMax = selectedBoxes[offset + 3]

    // 全て 0 の行は未使用スロット → スキップ
    if (yMin === 0 && xMin === 0 && yMax === 0 && xMax === 0) {
      continue
    }

    const usesModelInputScale = xMax > 1.0 || yMax > 1.0
    const coordScale = usesModelInputScale ? MODEL_INPUT_SIZE : 1

    // 座標系（正規化 or モデル入力サイズ基準）→ ピクセル座標（corner-format: y_min,x_min,y_max,x_max）
    const scaledX1 = (xMin / coordScale) * originalWidth
    const scaledY1 = (yMin / coordScale) * originalHeight
    const scaledX2 = (xMax / coordScale) * originalWidth
    const scaledY2 = (yMax / coordScale) * originalHeight

    // 最終座標を画像境界へ clamp
    const x1 = Math.min(Math.max(scaledX1, 0), originalWidth)
    const y1 = Math.min(Math.max(scaledY1, 0), originalHeight)
    const x2 = Math.min(Math.max(scaledX2, 0), originalWidth)
    const y2 = Math.min(Math.max(scaledY2, 0), originalHeight)

    // 小さすぎる検出を除外
    const boxWidth = x2 - x1
    const boxHeight = y2 - y1
    if (boxWidth < MIN_FACE_SIZE || boxHeight < MIN_FACE_SIZE) {
      continue
    }

    results.push({
      x1,
      y1,
      x2,
      y2,
      score: 1.0,
    })
  }

  return results
}
