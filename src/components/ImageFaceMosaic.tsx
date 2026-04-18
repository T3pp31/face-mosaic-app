import { useState, useRef } from 'react'
import { ImageUploader } from '@/components/ImageUploader'
import { MosaicCanvas } from '@/components/MosaicCanvas'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { drawImageWithMosaic } from '@/lib/mosaic/mosaicCanvas'
import {
  BBOX_PADDING_RATIO,
  MOSAIC_SCALE,
  CONF_THRESHOLD,
  IOU_THRESHOLD,
  MAX_DETECTIONS,
  CONF_THRESHOLD_MIN,
  CONF_THRESHOLD_MAX,
  CONF_THRESHOLD_STEP,
  IOU_THRESHOLD_MIN,
  IOU_THRESHOLD_MAX,
  IOU_THRESHOLD_STEP,
  MAX_DETECTIONS_MIN,
  MAX_DETECTIONS_MAX,
  MAX_DETECTIONS_STEP,
} from '@/config/constants'

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
  const [paddingRatio, setPaddingRatio] = useState(BBOX_PADDING_RATIO)
  const [mosaicScale, setMosaicScale] = useState(MOSAIC_SCALE)
  const [confThreshold, setConfThreshold] = useState(CONF_THRESHOLD)
  const [iouThreshold, setIouThreshold] = useState(IOU_THRESHOLD)
  const [maxDetections, setMaxDetections] = useState(MAX_DETECTIONS)

  const { detectFaces, isModelLoading, isProcessing, error } =
    useFaceDetection()

  const isLoading = isModelLoading || isProcessing

  async function handleFileSelect(file: File) {
    setHasResult(false)

    const objectUrl = URL.createObjectURL(file)

    try {
      const image = await loadImage(objectUrl)
      const faces = await detectFaces(image, {
        confThreshold,
        iouThreshold,
        maxDetections,
      })

      if (canvasRef.current) {
        drawImageWithMosaic(
          canvasRef.current,
          image,
          faces,
          mosaicScale,
          paddingRatio,
        )
        setHasResult(true)
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  return (
    <div className="image-face-mosaic">
      <ImageUploader onFileSelect={handleFileSelect} disabled={isLoading} />

      <div className="mosaic-controls" aria-label="モザイク調整">
        <label className="mosaic-controls__item" htmlFor="conf-threshold">
          <span>検出信頼度しきい値: {confThreshold.toFixed(2)}</span>
          <input
            id="conf-threshold"
            type="range"
            min={CONF_THRESHOLD_MIN}
            max={CONF_THRESHOLD_MAX}
            step={CONF_THRESHOLD_STEP}
            value={confThreshold}
            onChange={(event) => setConfThreshold(Number(event.target.value))}
          />
        </label>

        <label className="mosaic-controls__item" htmlFor="iou-threshold">
          <span>重複除去しきい値 (IoU): {iouThreshold.toFixed(2)}</span>
          <input
            id="iou-threshold"
            type="range"
            min={IOU_THRESHOLD_MIN}
            max={IOU_THRESHOLD_MAX}
            step={IOU_THRESHOLD_STEP}
            value={iouThreshold}
            onChange={(event) => setIouThreshold(Number(event.target.value))}
          />
        </label>

        <label className="mosaic-controls__item" htmlFor="max-detections">
          <span>最大検出数: {maxDetections}</span>
          <input
            id="max-detections"
            type="range"
            min={MAX_DETECTIONS_MIN}
            max={MAX_DETECTIONS_MAX}
            step={MAX_DETECTIONS_STEP}
            value={maxDetections}
            onChange={(event) => setMaxDetections(Number(event.target.value))}
          />
        </label>

        <p className="mosaic-controls__hint">
          検出が少ない場合は「検出信頼度しきい値」を初期値
          {CONF_THRESHOLD.toFixed(2)} より下げると、検出数が増える場合があります。
        </p>

        <label className="mosaic-controls__item" htmlFor="padding-ratio">
          <span>顔枠を少し広げる量: {paddingRatio.toFixed(2)}</span>
          <input
            id="padding-ratio"
            type="range"
            min={0}
            max={0.2}
            step={0.01}
            value={paddingRatio}
            onChange={(event) => setPaddingRatio(Number(event.target.value))}
          />
        </label>

        <label className="mosaic-controls__item" htmlFor="mosaic-scale">
          <span>モザイクの粗さ: {mosaicScale.toFixed(2)}</span>
          <input
            id="mosaic-scale"
            type="range"
            min={0.01}
            max={0.2}
            step={0.01}
            value={mosaicScale}
            onChange={(event) => setMosaicScale(Number(event.target.value))}
          />
        </label>
      </div>

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
