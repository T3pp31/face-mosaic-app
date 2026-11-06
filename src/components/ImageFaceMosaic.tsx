import { useState, useRef, useEffect, useCallback } from 'react'
import { ImageUploader } from '@/components/ImageUploader'
import { MosaicCanvas } from '@/components/MosaicCanvas'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { drawImageWithMosaic } from '@/lib/mosaic/mosaicCanvas'
import { loadImageFromFile } from '@/lib/image/loadImageFromFile'
import type { FaceBox } from '@/lib/onnx/postprocess'
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

type ProcessedImage = {
  image: HTMLImageElement
  faces: FaceBox[]
}

/**
 * 顔モザイクのメインコンポーネント
 *
 * 1. ファイル選択 → HTMLImageElement 生成
 * 2. detectFaces で顔検出
 * 3. drawImageWithMosaic で Canvas にモザイク描画
 */
export function ImageFaceMosaic() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const processedRef = useRef<ProcessedImage | null>(null)
  const downloadButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [hasResult, setHasResult] = useState(false)
  const [paddingRatio, setPaddingRatio] = useState(BBOX_PADDING_RATIO)
  const [mosaicScale, setMosaicScale] = useState(MOSAIC_SCALE)
  const [confThreshold, setConfThreshold] = useState(CONF_THRESHOLD)
  const [iouThreshold, setIouThreshold] = useState(IOU_THRESHOLD)
  const [maxDetections, setMaxDetections] = useState(MAX_DETECTIONS)
  const [noFaceDetected, setNoFaceDetected] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const { detectFaces, isModelLoading, isProcessing, error } =
    useFaceDetection()

  const isLoading = isModelLoading || isProcessing

  const applyMosaic = useCallback(
    (
      image: HTMLImageElement,
      faces: FaceBox[],
      nextMosaicScale: number,
      nextPaddingRatio: number,
    ) => {
      if (canvasRef.current === null) {
        return
      }

      drawImageWithMosaic(
        canvasRef.current,
        image,
        faces,
        nextMosaicScale,
        nextPaddingRatio,
      )
      setHasResult(true)
    },
    [],
  )

  useEffect(() => {
    const processed = processedRef.current
    if (processed === null || isLoading) {
      return
    }

    applyMosaic(processed.image, processed.faces, mosaicScale, paddingRatio)
  }, [applyMosaic, isLoading, mosaicScale, paddingRatio])

  async function handleFileSelect(file: File) {
    setHasResult(false)
    setNoFaceDetected(false)
    setIsConfirmOpen(false)
    processedRef.current = null

    try {
      const image = await loadImageFromFile(file)
      const faces = await detectFaces(image, {
        confThreshold,
        iouThreshold,
        maxDetections,
      })

      processedRef.current = { image, faces }
      applyMosaic(image, faces, mosaicScale, paddingRatio)
      // 検出0件のときはモザイク未適用であることを明示する
      setNoFaceDetected(faces.length === 0)
    } catch {
      processedRef.current = null
      setHasResult(false)
      setNoFaceDetected(false)
    }
  }

  function downloadMosaic() {
    const canvas = canvasRef.current
    if (canvas === null) {
      return
    }
    // toDataURL は同期でメインスレッドをブロックするため、非同期の toBlob を使い、
    // ObjectURL を一時アンカー経由でダウンロードした後に解放する。
    canvas.toBlob((blob) => {
      if (blob === null) {
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'mosaic.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function handleDownloadClick() {
    // 検出0件（モザイク未適用）の場合は確認ダイアログを挟む
    if (noFaceDetected) {
      setIsConfirmOpen(true)
      return
    }
    downloadMosaic()
  }

  function handleConfirmDownload() {
    setIsConfirmOpen(false)
    downloadMosaic()
  }

  function handleCancelDownload() {
    setIsConfirmOpen(false)
  }

  // 確認ダイアログのフォース管理：開いたら確認ボタンにフォース、閉じたら元のダウンロードボタンにフォースを戻す
  useEffect(() => {
    if (isConfirmOpen) {
      confirmButtonRef.current?.focus()
    } else if (hasResult) {
      downloadButtonRef.current?.focus()
    }
  }, [isConfirmOpen, hasResult])

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancelDownload()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    // フォーストラップ：ダイアログ内のフォース可能要素間で循環させる
    const dialog = dialogRef.current
    if (dialog === null) {
      return
    }
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled'))
    if (focusable.length === 0) {
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    } else if (active === last || !dialog.contains(active)) {
      event.preventDefault()
      first.focus()
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

      {!error && noFaceDetected && (
        <div className="no-face-warning" role="alert">
          <strong>顔が検出されませんでした。</strong>
          この画像にはモザイクが適用されていません。
          「検出信頼度しきい値」を現在のしきい値（{confThreshold.toFixed(2)}）よりさらに下げて再アップロードすると、
          顔が検出される場合があります。
        </div>
      )}

      <MosaicCanvas canvasRef={canvasRef} hasResult={hasResult} />

      {hasResult && (
        <button
          ref={downloadButtonRef}
          type="button"
          className="download-button"
          onClick={handleDownloadClick}
        >
          画像をダウンロード
        </button>
      )}

      {isConfirmOpen && (
        <div
          ref={dialogRef}
          className="confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-message"
          onKeyDown={handleDialogKeyDown}
        >
          <h2 id="confirm-dialog-title" className="confirm-dialog__title">
            顔が検出されていません
          </h2>
          <p id="confirm-dialog-message" className="confirm-dialog__message">
            この画像はモザイク処理が適用されていません。このままダウンロードしますか？
          </p>
          <div className="confirm-dialog__actions">
            <button ref={confirmButtonRef} type="button" onClick={handleConfirmDownload}>
              ダウンロードする
            </button>
            <button type="button" onClick={handleCancelDownload}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
