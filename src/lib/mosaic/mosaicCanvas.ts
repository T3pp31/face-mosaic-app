import type { FaceBox } from '@/lib/onnx/postprocess'
import { MOSAIC_SCALE, BBOX_PADDING_RATIO } from '@/config/constants'

/**
 * 画像のピクセル幅を返す
 * HTMLVideoElement の場合は videoWidth を使用する
 */
function getSourceWidth(image: HTMLImageElement | HTMLVideoElement): number {
  return image instanceof HTMLVideoElement ? image.videoWidth : image.width
}

/**
 * 画像のピクセル高さを返す
 * HTMLVideoElement の場合は videoHeight を使用する
 */
function getSourceHeight(image: HTMLImageElement | HTMLVideoElement): number {
  return image instanceof HTMLVideoElement ? image.videoHeight : image.height
}

/**
 * 縮小→拡大による最近傍補間でピクセレートモザイクを適用する（内部関数）
 *
 * @param ctx         描画先 CanvasRenderingContext2D
 * @param x           モザイク領域の左上 X 座標（px）
 * @param y           モザイク領域の左上 Y 座標（px）
 * @param w           モザイク領域の幅（px）
 * @param h           モザイク領域の高さ（px）
 * @param mosaicScale 縮小率（0 < mosaicScale <= 1）
 */
function applyPixelMosaic(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  mosaicScale: number,
): void {
  const smallW = Math.max(1, Math.floor(w * mosaicScale))
  const smallH = Math.max(1, Math.floor(h * mosaicScale))

  const temp = document.createElement('canvas')
  temp.width = smallW
  temp.height = smallH

  const tctx = temp.getContext('2d')
  if (tctx === null) {
    throw new Error('Failed to get 2D context from temporary canvas')
  }

  // 顔領域を smallW × smallH に縮小描画
  tctx.imageSmoothingEnabled = false
  tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, smallW, smallH)

  // 縮小画像を元サイズに拡大して上書き（最近傍補間でピクセレート）
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(temp, 0, 0, smallW, smallH, x, y, w, h)
}

/**
 * 元画像を canvas に描画し、検出された顔領域にモザイクをかける
 *
 * @param canvas        描画先 HTMLCanvasElement
 * @param image         元画像（HTMLImageElement または HTMLVideoElement）
 * @param faces         検出された顔のバウンディングボックス配列
 * @param mosaicScale   モザイクの粗さ（デフォルト: MOSAIC_SCALE = 0.03）
 * @param paddingRatio  bbox 拡張率（デフォルト: BBOX_PADDING_RATIO = 0.10）
 */
export function drawImageWithMosaic(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | HTMLVideoElement,
  faces: FaceBox[],
  mosaicScale: number = MOSAIC_SCALE,
  paddingRatio: number = BBOX_PADDING_RATIO,
): void {
  const width = getSourceWidth(image)
  const height = getSourceHeight(image)

  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Failed to get 2D context from canvas')
  }

  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)

  for (const face of faces) {
    const bboxW = face.x2 - face.x1
    const bboxH = face.y2 - face.y1

    const padX = bboxW * paddingRatio
    const padY = bboxH * paddingRatio

    // padding 拡張後の左上座標（canvas 境界でクリップ）
    const x = Math.max(0, Math.floor(face.x1 - padX))
    const y = Math.max(0, Math.floor(face.y1 - padY))

    // padding 拡張後の右下座標（canvas 境界でクリップ）
    const x2Clipped = Math.min(width, Math.ceil(face.x2 + padX))
    const y2Clipped = Math.min(height, Math.ceil(face.y2 + padY))

    const w = x2Clipped - x
    const h = y2Clipped - y

    // 幅または高さが 0 以下の場合はスキップ
    if (w <= 0 || h <= 0) {
      continue
    }

    applyPixelMosaic(ctx, x, y, w, h, mosaicScale)
  }
}
