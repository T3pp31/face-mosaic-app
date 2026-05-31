import { useState, useCallback } from 'react'
import {
  getFaceSession,
  runFaceDetection,
  type FaceDetectionRuntimeOptions,
} from '@/lib/onnx/session'
import {
  preprocessImageRegionToTensor,
  preprocessImageToTensor,
  type CropRegion,
} from '@/lib/onnx/preprocess'
import { SMALL_FACE_TILE_THRESHOLD } from '@/config/constants'
import {
  deduplicateFaceBoxes,
  postprocessDetections,
  type FaceBox,
} from '@/lib/onnx/postprocess'

export type UseFaceDetectionResult = {
  detectFaces: (
    image: HTMLImageElement,
    options?: FaceDetectionRuntimeOptions,
  ) => Promise<FaceBox[]>
  isModelLoading: boolean
  isProcessing: boolean
  error: string | null
}

const TILE_GRID_SIZES = [2, 3]

function createTileRegions(
  imageWidth: number,
  imageHeight: number,
  gridSizes: number[] = TILE_GRID_SIZES,
): CropRegion[] {
  const regions: CropRegion[] = []

  for (const gridSize of gridSizes) {
    const tileWidth = imageWidth / gridSize
    const tileHeight = imageHeight / gridSize

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const x = Math.round(col * tileWidth)
        const y = Math.round(row * tileHeight)
        const nextX = Math.round((col + 1) * tileWidth)
        const nextY = Math.round((row + 1) * tileHeight)

        regions.push({
          x,
          y,
          width: nextX - x,
          height: nextY - y,
        })
      }
    }
  }

  return regions
}

function translateBoxesToOriginal(
  boxes: FaceBox[],
  region: CropRegion,
): FaceBox[] {
  return boxes.map((box) => ({
    x1: box.x1 + region.x,
    y1: box.y1 + region.y,
    x2: box.x2 + region.x,
    y2: box.y2 + region.y,
    score: box.score,
  }))
}

/**
 * 顔検出カスタムフック
 */
export function useFaceDetection(): UseFaceDetectionResult {
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detectFaces = useCallback(
    async (
      image: HTMLImageElement,
      options?: FaceDetectionRuntimeOptions,
    ): Promise<FaceBox[]> => {
      setError(null)
      setIsModelLoading(true)

      let session
      try {
        session = await getFaceSession()
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'モデルの読み込みに失敗しました'
        setError(message)
        setIsModelLoading(false)
        return []
      }

      setIsModelLoading(false)
      setIsProcessing(true)

      try {
        const fullImagePrep = preprocessImageToTensor(image)
        const allFaces: FaceBox[] = []

        const fullOutput = await runFaceDetection(
          session,
          fullImagePrep.tensor,
          options,
        )
        const fullSelectedBoxes = fullOutput['selectedBoxes']
        if (!fullSelectedBoxes) {
          throw new Error('モデルの出力に selectedBoxes が含まれていません')
        }

        const fullLocalFaces = postprocessDetections(
          fullSelectedBoxes.data as Float32Array,
          fullImagePrep.cropRegion.width,
          fullImagePrep.cropRegion.height,
        )
        allFaces.push(
          ...translateBoxesToOriginal(fullLocalFaces, fullImagePrep.cropRegion),
        )

        const shouldUseTiles =
          allFaces.length === 0 ||
          allFaces.every(
            (face) =>
              face.x2 - face.x1 < SMALL_FACE_TILE_THRESHOLD &&
              face.y2 - face.y1 < SMALL_FACE_TILE_THRESHOLD,
          )

        if (shouldUseTiles) {
          const tileRegions = createTileRegions(
            fullImagePrep.originalWidth,
            fullImagePrep.originalHeight,
          )

          for (const region of tileRegions) {
            const prep = preprocessImageRegionToTensor(image, region)
            const output = await runFaceDetection(session, prep.tensor, options)
            const selectedBoxes = output['selectedBoxes']
            if (!selectedBoxes) {
              throw new Error('モデルの出力に selectedBoxes が含まれていません')
            }

            const localFaces = postprocessDetections(
              selectedBoxes.data as Float32Array,
              prep.cropRegion.width,
              prep.cropRegion.height,
            )
            const translated = translateBoxesToOriginal(
              localFaces,
              prep.cropRegion,
            )

            allFaces.push(...translated)
          }
        }

        const normalizedFaces = postprocessDetections(
          allFaces,
          fullImagePrep.originalWidth,
          fullImagePrep.originalHeight,
        )

        const deduped = deduplicateFaceBoxes(
          normalizedFaces,
          options?.iouThreshold,
        )

        return deduped
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '顔検出の処理に失敗しました'
        setError(message)
        return []
      } finally {
        setIsProcessing(false)
      }
    },
    [],
  )

  return { detectFaces, isModelLoading, isProcessing, error }
}
