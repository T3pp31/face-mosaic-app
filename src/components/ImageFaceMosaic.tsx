import { useState, useRef } from 'react'
import { ImageUploader } from '@/components/ImageUploader'
import { MosaicCanvas } from '@/components/MosaicCanvas'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { drawImageWithMosaic } from '@/lib/mosaic/mosaicCanvas'

/**
 * 顔モザイクのメインコンポーネント
 *
 * 1. ファイル選択 → HTMLImageElement 生成
 * 2. detectFaces で顔検出
 * 3. drawImageWithMosaic で Canvas にモザイク描画
 */
export function ImageFaceMosaic() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasResult, setHasResult] = useState(false)

  const { detectFaces, isModelLoading, isProcessing, error } =
    useFaceDetection()

  const isLoading = isModelLoading || isProcessing

  async function handleFileSelect(file: File) {
    setHasResult(false)

    const objectUrl = URL.createObjectURL(file)

    try {
      const image = await loadImage(objectUrl)
      const faces = await detectFaces(image)

      if (canvasRef.current) {
        drawImageWithMosaic(canvasRef.current, image, faces)
        setHasResult(true)
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  return (
    <div className="image-face-mosaic">
      <ImageUploader onFileSelect={handleFileSelect} disabled={isLoading} />

      {isModelLoading && (
        <div className="loading" role="status" aria-live="polite">
          <span className="loading__spinner" aria-hidden="true" />
          <span>AIモデルを読み込んでいます...</span>
        </div>
      )}

      {isProcessing && !isModelLoading && (
        <div className="loading" role="status" aria-live="polite">
          <span className="loading__spinner" aria-hidden="true" />
          <span>顔を検出しています...</span>
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          <strong>エラー:</strong> {error}
        </div>
      )}

      <MosaicCanvas canvasRef={canvasRef} hasResult={hasResult} />
    </div>
  )
}

/**
 * URL から HTMLImageElement を生成して返す
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    img.src = src
  })
}
