import {
  VALUES_PER_DETECTION,
  MIN_FACE_SIZE,
  MODEL_INPUT_SIZE,
  IOU_THRESHOLD,
} from '@/config/constants'

export type FaceBox = {
  x1: number
  y1: number
  x2: number
  y2: number
  score: number
}

function normalizeAndFilterFaceBoxes(
  boxes: FaceBox[],
  maxWidth: number,
  maxHeight: number,
): FaceBox[] {
  const results: FaceBox[] = []

  for (const box of boxes) {
    const x1 = Math.min(Math.max(box.x1, 0), maxWidth)
    const y1 = Math.min(Math.max(box.y1, 0), maxHeight)
    const x2 = Math.min(Math.max(box.x2, 0), maxWidth)
    const y2 = Math.min(Math.max(box.y2, 0), maxHeight)

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
      score: box.score,
    })
  }

  return results
}

function expandFaceBoxWithLandmarks(
  box: FaceBox,
  selectedBoxes: Float32Array,
  offset: number,
  coordScale: number,
  originalWidth: number,
  originalHeight: number,
): FaceBox {
  let x1 = box.x1
  let y1 = box.y1
  let x2 = box.x2
  let y2 = box.y2

  for (let j = 0; j < 6; j++) {
    const lmX = selectedBoxes[offset + 4 + j * 2]
    const lmY = selectedBoxes[offset + 4 + j * 2 + 1]
    if (lmX === 0 && lmY === 0) {
      continue
    }

    const px = (lmX / coordScale) * originalWidth
    const py = (lmY / coordScale) * originalHeight
    x1 = Math.min(x1, px)
    y1 = Math.min(y1, py)
    x2 = Math.max(x2, px)
    y2 = Math.max(y2, py)
  }

  return { x1, y1, x2, y2, score: box.score }
}

function decodeSelectedBoxes(
  selectedBoxes: Float32Array,
  originalWidth: number,
  originalHeight: number,
): FaceBox[] {
  const decoded: FaceBox[] = []
  const numDetections = selectedBoxes.length / VALUES_PER_DETECTION

  for (let i = 0; i < numDetections; i++) {
    const offset = i * VALUES_PER_DETECTION
    const yMin = selectedBoxes[offset]
    const xMin = selectedBoxes[offset + 1]
    const yMax = selectedBoxes[offset + 2]
    const xMax = selectedBoxes[offset + 3]

    if (yMin === 0 && xMin === 0 && yMax === 0 && xMax === 0) {
      continue
    }

    const usesModelInputScale = xMax > 1.0 || yMax > 1.0
    const coordScale = usesModelInputScale ? MODEL_INPUT_SIZE : 1

    const faceBox = expandFaceBoxWithLandmarks(
      {
        x1: (xMin / coordScale) * originalWidth,
        y1: (yMin / coordScale) * originalHeight,
        x2: (xMax / coordScale) * originalWidth,
        y2: (yMax / coordScale) * originalHeight,
        score: 1.0,
      },
      selectedBoxes,
      offset,
      coordScale,
      originalWidth,
      originalHeight,
    )

    decoded.push(faceBox)
  }

  return decoded
}

/**
 * selectedBoxes もしくは座標変換済み FaceBox 配列を正規化し返す
 */
export function postprocessDetections(
  detections: Float32Array | FaceBox[],
  originalWidth: number,
  originalHeight: number,
): FaceBox[] {
  const boxes =
    detections instanceof Float32Array
      ? decodeSelectedBoxes(detections, originalWidth, originalHeight)
      : detections

  return normalizeAndFilterFaceBoxes(boxes, originalWidth, originalHeight)
}

function calculateIoU(a: FaceBox, b: FaceBox): number {
  const overlapX1 = Math.max(a.x1, b.x1)
  const overlapY1 = Math.max(a.y1, b.y1)
  const overlapX2 = Math.min(a.x2, b.x2)
  const overlapY2 = Math.min(a.y2, b.y2)

  const overlapW = Math.max(0, overlapX2 - overlapX1)
  const overlapH = Math.max(0, overlapY2 - overlapY1)
  const intersection = overlapW * overlapH

  if (intersection === 0) {
    return 0
  }

  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
  return intersection / (areaA + areaB - intersection)
}

function mergeFaceBoxes(a: FaceBox, b: FaceBox): FaceBox {
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2),
    score: Math.max(a.score, b.score),
  }
}

/**
 * タイル推論後の重複 FaceBox を IoU ベースで統合する
 */
export function deduplicateFaceBoxes(
  boxes: FaceBox[],
  iouThreshold: number = IOU_THRESHOLD,
): FaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score)
  const selected: FaceBox[] = []

  for (const candidate of sorted) {
    const overlapIndex = selected.findIndex(
      (existing) => calculateIoU(existing, candidate) > iouThreshold,
    )

    if (overlapIndex >= 0) {
      selected[overlapIndex] = mergeFaceBoxes(selected[overlapIndex], candidate)
    } else {
      selected.push(candidate)
    }
  }

  return selected
}
