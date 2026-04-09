import type { RefObject } from 'react'

export type MosaicCanvasProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  hasResult: boolean
}

/**
 * モザイク処理済み画像を表示する Canvas ラッパーコンポーネント
 *
 * - hasResult が false のときは非表示
 * - max-width: 100% でレスポンシブ表示
 */
export function MosaicCanvas({ canvasRef, hasResult }: MosaicCanvasProps) {
  return (
    <div
      className="mosaic-canvas-wrapper"
      style={{ display: hasResult ? 'block' : 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="mosaic-canvas"
        aria-label="モザイク処理済み画像"
      />
    </div>
  )
}
