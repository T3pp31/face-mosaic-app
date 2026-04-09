import { useState, useCallback } from 'react'
import { getFaceSession, runFaceDetection } from '@/lib/onnx/session'
import { preprocessImageToTensor } from '@/lib/onnx/preprocess'
import { postprocessDetections, type FaceBox } from '@/lib/onnx/postprocess'

export type UseFaceDetectionResult = {
  detectFaces: (image: HTMLImageElement) => Promise<FaceBox[]>
  isModelLoading: boolean
  isProcessing: boolean
  error: string | null
}

/**
 * 顔検出カスタムフック
 *
 * - isModelLoading: モデルのロード中（初回セッション取得時）
 * - isProcessing: 推論処理中
 * - error: エラーメッセージ（エラーがなければ null）
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
        const prep = preprocessImageToTensor(image)
        const output = await runFaceDetection(session, prep.tensor)

        const selectedBoxes = output['selectedBoxes']
        if (!selectedBoxes) {
          throw new Error('モデルの出力に selectedBoxes が含まれていません')
        }

        const boxesData = selectedBoxes.data as Float32Array
        const faces = postprocessDetections(
          boxesData,
          prep.originalWidth,
          prep.originalHeight,
        )

        return faces
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
