import * as ort from 'onnxruntime-web'
import { MODEL_INPUT_SIZE } from '@/config/constants'

export type PreprocessResult = {
  tensor: ort.Tensor
  originalWidth: number
  originalHeight: number
}

/**
 * 画像をモデル入力テンソルに変換する
 *
 * - Canvas で inputSize × inputSize にリサイズ
 * - RGBA → RGB CHW 変換（R/G/B の順で平面化）
 * - 0-1 正規化（÷255）
 *
 * @param image      入力画像 / 動画 / Canvas 要素
 * @param inputSize  モデル入力サイズ（デフォルト: MODEL_INPUT_SIZE）
 * @returns          テンソルと元画像サイズ
 */
export function preprocessImageToTensor(
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  inputSize: number = MODEL_INPUT_SIZE,
): PreprocessResult {
  const originalWidth =
    image instanceof HTMLVideoElement ? image.videoWidth : image.width
  const originalHeight =
    image instanceof HTMLVideoElement ? image.videoHeight : image.height

  const canvas = document.createElement('canvas')
  canvas.width = inputSize
  canvas.height = inputSize

  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Failed to get 2D context from canvas')
  }

  ctx.drawImage(image, 0, 0, inputSize, inputSize)

  const imageData = ctx.getImageData(0, 0, inputSize, inputSize)
  const { data } = imageData // RGBA 配列 (length = inputSize * inputSize * 4)

  const pixelCount = inputSize * inputSize

  // CHW 形式: [R 平面, G 平面, B 平面]
  const float32Data = new Float32Array(3 * pixelCount)

  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 4
    float32Data[i] = data[srcIdx] / 255 // R チャンネル
    float32Data[pixelCount + i] = data[srcIdx + 1] / 255 // G チャンネル
    float32Data[2 * pixelCount + i] = data[srcIdx + 2] / 255 // B チャンネル
  }

  const tensor = new ort.Tensor('float32', float32Data, [1, 3, inputSize, inputSize])

  return { tensor, originalWidth, originalHeight }
}
