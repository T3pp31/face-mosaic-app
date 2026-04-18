import * as ort from 'onnxruntime-web'
import { MODEL_INPUT_SIZE } from '@/config/constants'

export type CropRegion = {
  x: number
  y: number
  width: number
  height: number
}

export type PreprocessResult = {
  tensor: ort.Tensor
  originalWidth: number
  originalHeight: number
  cropRegion: CropRegion
}

function getImageDimensions(
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
): { width: number; height: number } {
  return {
    width: image instanceof HTMLVideoElement ? image.videoWidth : image.width,
    height: image instanceof HTMLVideoElement ? image.videoHeight : image.height,
  }
}

function createTensorFromImageData(
  imageData: ImageData,
  inputSize: number,
): ort.Tensor {
  const { data } = imageData
  const pixelCount = inputSize * inputSize
  const float32Data = new Float32Array(3 * pixelCount)

  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 4
    float32Data[i] = data[srcIdx] / 255
    float32Data[pixelCount + i] = data[srcIdx + 1] / 255
    float32Data[2 * pixelCount + i] = data[srcIdx + 2] / 255
  }

  return new ort.Tensor('float32', float32Data, [1, 3, inputSize, inputSize])
}

function clampCropRegion(
  region: CropRegion,
  originalWidth: number,
  originalHeight: number,
): CropRegion {
  const x = Math.min(Math.max(region.x, 0), originalWidth)
  const y = Math.min(Math.max(region.y, 0), originalHeight)
  const maxWidth = Math.max(originalWidth - x, 0)
  const maxHeight = Math.max(originalHeight - y, 0)
  const width = Math.min(Math.max(region.width, 0), maxWidth)
  const height = Math.min(Math.max(region.height, 0), maxHeight)

  if (width === 0 || height === 0) {
    throw new Error('Crop region must have positive width and height')
  }

  return { x, y, width, height }
}

/**
 * 任意クロップ領域をモデル入力テンソルへ変換する
 */
export function preprocessImageRegionToTensor(
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  cropRegion: CropRegion,
  inputSize: number = MODEL_INPUT_SIZE,
): PreprocessResult {
  const { width: originalWidth, height: originalHeight } = getImageDimensions(image)
  const normalizedRegion = clampCropRegion(cropRegion, originalWidth, originalHeight)

  const canvas = document.createElement('canvas')
  canvas.width = inputSize
  canvas.height = inputSize

  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Failed to get 2D context from canvas')
  }

  ctx.drawImage(
    image,
    normalizedRegion.x,
    normalizedRegion.y,
    normalizedRegion.width,
    normalizedRegion.height,
    0,
    0,
    inputSize,
    inputSize,
  )

  const imageData = ctx.getImageData(0, 0, inputSize, inputSize)
  const tensor = createTensorFromImageData(imageData, inputSize)

  return {
    tensor,
    originalWidth,
    originalHeight,
    cropRegion: normalizedRegion,
  }
}

/**
 * 画像全体をモデル入力テンソルに変換する
 */
export function preprocessImageToTensor(
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  inputSize: number = MODEL_INPUT_SIZE,
): PreprocessResult {
  const { width, height } = getImageDimensions(image)

  return preprocessImageRegionToTensor(
    image,
    { x: 0, y: 0, width, height },
    inputSize,
  )
}
