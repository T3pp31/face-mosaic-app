import { useState, useCallback } from 'react'
import { getFaceSession, runFaceDetection } from '@/lib/onnx/session'
import {
  preprocessImageRegionToTensor,
  preprocessImageToTensor,
  type CropRegion,
} from '@/lib/onnx/preprocess'
import {
  deduplicateFaceBoxes,
  postprocessDetections,
  type FaceBox,
} from '@/lib/onnx/postprocess'

export type UseFaceDetectionResult = {
  detectFaces: (image: HTMLImageElement) => Promise<FaceBox[]>
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
    async (image: HTMLImageElement): Promise<FaceBox[]> => {
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
        const regions = [
          fullImagePrep.cropRegion,
          ...createTileRegions(fullImagePrep.originalWidth, fullImagePrep.originalHeight),
        ]

        const allFaces: FaceBox[] = []

        for (const region of regions) {
          const prep =
            region === fullImagePrep.cropRegion
              ? fullImagePrep
              : preprocessImageRegionToTensor(image, region)

          const output = await runFaceDetection(session, prep.tensor)
          const selectedBoxes = output['selectedBoxes']
          if (!selectedBoxes) {
            throw new Error('モデルの出力に selectedBoxes が含まれていません')
          }

          const localFaces = postprocessDetections(
            selectedBoxes.data as Float32Array,
            prep.cropRegion.width,
            prep.cropRegion.height,
          )
          const translated = translateBoxesToOriginal(localFaces, prep.cropRegion)
          allFaces.push(...translated)
        }

        const normalizedFaces = postprocessDetections(
          allFaces,
          fullImagePrep.originalWidth,
          fullImagePrep.originalHeight,
        )

        return deduplicateFaceBoxes(normalizedFaces)
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
