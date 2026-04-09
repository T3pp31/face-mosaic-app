import {
  BLAZEFACE_ANCHOR_COUNT,
  VALUES_PER_DETECTION,
  MIN_FACE_SIZE,
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
 * selectedBoxes は [1, 896, 16] の Float32Array（flatten 済み）
 * 各行の 16 値: [y_center, x_center, h, w, kp1_y, kp1_x, ..., kp6_y, kp6_x]
 * 正規化座標 (0-1) を originalWidth/Height でスケールする
 * NMS はモデル内蔵のため score は 1.0 固定
 *
 * @param selectedBoxes   推論出力 Float32Array（長さ = 896 × 16）
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

  for (let i = 0; i < BLAZEFACE_ANCHOR_COUNT; i++) {
    const offset = i * VALUES_PER_DETECTION

    const yCenter = selectedBoxes[offset]
    const xCenter = selectedBoxes[offset + 1]
    const h = selectedBoxes[offset + 2]
    const w = selectedBoxes[offset + 3]

    // 全て 0 の行は未使用スロット → スキップ
    if (yCenter === 0 && xCenter === 0 && h === 0 && w === 0) {
      continue
    }

    // 正規化座標 → ピクセル座標（center-format → corner-format）
    const x1 = (xCenter - w / 2) * originalWidth
    const y1 = (yCenter - h / 2) * originalHeight
    const x2 = (xCenter + w / 2) * originalWidth
    const y2 = (yCenter + h / 2) * originalHeight

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
