import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { drawImageWithMosaic } from '@/lib/mosaic/mosaicCanvas'
import type { FaceBox } from '@/lib/onnx/postprocess'
import { MOSAIC_SCALE, BBOX_PADDING_RATIO } from '@/config/constants'

// -----------------------------------------------------------------------
// テスト用ヘルパー
// -----------------------------------------------------------------------

/** テスト用の HTMLImageElement モックを生成する */
function createMockImage(width = 640, height = 480): HTMLImageElement {
  const img = document.createElement('img')
  Object.defineProperty(img, 'width', { value: width, configurable: true })
  Object.defineProperty(img, 'height', { value: height, configurable: true })
  return img
}

/** テスト用の HTMLVideoElement モックを生成する */
function createMockVideo(videoWidth = 1280, videoHeight = 720): HTMLVideoElement {
  const video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', {
    value: videoWidth,
    configurable: true,
  })
  Object.defineProperty(video, 'videoHeight', {
    value: videoHeight,
    configurable: true,
  })
  return video
}

/**
 * テスト用 CanvasRenderingContext2D モックを生成する
 * (canvas 参照付き)
 */
function createMockCtx(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D & { drawImage: ReturnType<typeof vi.fn> } {
  const ctx = {
    canvas,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D & { drawImage: ReturnType<typeof vi.fn> }
  return ctx
}

/**
 * applyPixelMosaic 内部で生成される一時 canvas を差し替えるセットアップ。
 * document.createElement('canvas') を呼ぶたびに新しいモック canvas を返す。
 *
 * @param mainCanvas  drawImageWithMosaic に渡す描画先 canvas
 * @returns セットアップ済みの ctx と tempCtx の配列ファクトリ
 */
function setupCanvasMocks(mainCanvas: HTMLCanvasElement): {
  mainCtx: CanvasRenderingContext2D & { drawImage: ReturnType<typeof vi.fn> }
  getTempCtxCalls: () => Array<ReturnType<typeof vi.fn>>
  originalCreateElement: typeof document.createElement
} {
  const originalCreateElement = document.createElement.bind(document)

  // メイン canvas の ctx モック
  const mainCtx = createMockCtx(mainCanvas)
  vi.spyOn(mainCanvas, 'getContext').mockReturnValue(
    mainCtx as unknown as RenderingContext,
  )

  // 一時 canvas の drawImage 呼び出し記録
  const tempCtxDrawImageFns: Array<ReturnType<typeof vi.fn>> = []

  // document.createElement をモックして canvas 生成を横取りする
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      const tempCanvas = originalCreateElement('canvas')
      const tempDrawImage = vi.fn()
      const tempCtx = {
        canvas: tempCanvas,
        drawImage: tempDrawImage,
        imageSmoothingEnabled: true,
      }
      tempCtxDrawImageFns.push(tempDrawImage)
      vi.spyOn(tempCanvas, 'getContext').mockReturnValue(
        tempCtx as unknown as RenderingContext,
      )
      return tempCanvas
    }
    return originalCreateElement(tag)
  })

  return {
    mainCtx,
    getTempCtxCalls: () => tempCtxDrawImageFns,
    originalCreateElement,
  }
}

/** FaceBox を簡便に生成するヘルパー */
function makeFace(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  score = 0.95,
): FaceBox {
  return { x1, y1, x2, y2, score }
}

// -----------------------------------------------------------------------
// drawImageWithMosaic のテスト
// -----------------------------------------------------------------------

describe('drawImageWithMosaic', () => {
  let originalCreateElement: typeof document.createElement

  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.createElement = originalCreateElement
  })

  // =====================================================================
  // 正常系
  // =====================================================================

  describe('正常系', () => {
    it('TC-01: 顔1件 — canvas のサイズが元画像と同じになり clearRect と drawImage が呼ばれる', () => {
      // Given: 640×480 の画像と顔 bbox 1件
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(100, 80, 200, 180)]

      // When: drawImageWithMosaic を呼ぶ
      drawImageWithMosaic(canvas, image, faces)

      // Then: canvas サイズが画像と一致する
      expect(canvas.width).toBe(640)
      expect(canvas.height).toBe(480)
      // Then: clearRect が呼ばれている
      expect(mainCtx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480)
      // Then: 元画像の drawImage が呼ばれている（1回目の呼び出し）
      expect(mainCtx.drawImage).toHaveBeenCalledWith(image, 0, 0, 640, 480)
    })

    it('TC-02: 顔3件 — 各顔に対して一時 canvas への縮小描画が3回行われる', () => {
      // Given: 640×480 の画像と顔 bbox 3件
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx, getTempCtxCalls } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [
        makeFace(50, 50, 150, 150),
        makeFace(200, 50, 300, 150),
        makeFace(400, 50, 500, 150),
      ]

      // When: drawImageWithMosaic を呼ぶ
      drawImageWithMosaic(canvas, image, faces)

      // Then: 元画像 drawImage 1回
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1 + 3) // 元画像1回 + 拡大描画3回

      // Then: 一時 canvas への縮小描画が3回（各顔1つの一時 canvas）
      const tempCtxCalls = getTempCtxCalls()
      expect(tempCtxCalls.length).toBe(3)
      tempCtxCalls.forEach((fn) => {
        expect(fn).toHaveBeenCalledTimes(1)
      })
    })

    it('TC-03: 顔なし — 元画像のみ描画され drawImage は1回のみ', () => {
      // Given: 640×480 の画像と空の顔配列
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = []

      // When: drawImageWithMosaic を呼ぶ
      drawImageWithMosaic(canvas, image, faces)

      // Then: drawImage は元画像の1回のみ
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1)
      expect(mainCtx.drawImage).toHaveBeenCalledWith(image, 0, 0, 640, 480)
    })

    it('TC-04: デフォルト引数 — MOSAIC_SCALE と BBOX_PADDING_RATIO が使われる', () => {
      // Given: 640×480 の画像と顔 bbox 1件
      // bbox: x1=100, y1=100, x2=200, y2=200 → bboxW=100, bboxH=100
      // paddingRatio=BBOX_PADDING_RATIO（既定値）を使って領域を拡張
      // expandSize = 100 + 100 * BBOX_PADDING_RATIO * 2
      // smallW = max(1, floor(expandSize * MOSAIC_SCALE))
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(100, 100, 200, 200)]

      // When: mosaicScale/paddingRatio を指定しない（デフォルト使用）
      drawImageWithMosaic(canvas, image, faces)

      // Then: 一時 canvas のサイズが期待通り (document.createElement のモックで設定された)
      // 検証は mainCtx.drawImage の第4引数 (smallW) と第5引数 (smallH) で確認
      const expandedSize = 100 + 100 * BBOX_PADDING_RATIO * 2
      const expectedSmallW = Math.max(1, Math.floor(expandedSize * MOSAIC_SCALE))
      const expectedSmallH = Math.max(1, Math.floor(expandedSize * MOSAIC_SCALE))
      // ctx.drawImage(temp, 0, 0, smallW, smallH, x, y, w, h) の smallW/smallH を確認
      const drawImageCalls = (canvas.getContext('2d') as unknown as { drawImage: ReturnType<typeof vi.fn> })
        ?.drawImage?.mock.calls ?? []
      // 拡大呼び出し (第2引数=0, 第3引数=0) を特定
      const enlargeCalls = drawImageCalls.filter(
        (call: unknown[]) => call[1] === 0 && call[2] === 0 && call[0] !== image,
      )
      expect(enlargeCalls.length).toBe(1)
      expect(enlargeCalls[0][3]).toBe(expectedSmallW) // smallW
      expect(enlargeCalls[0][4]).toBe(expectedSmallH) // smallH
    })

    it('TC-05: HTMLVideoElement 入力 — videoWidth/videoHeight で canvas サイズを設定する', () => {
      // Given: videoWidth=1280, videoHeight=720 の video 要素
      const video = createMockVideo(1280, 720)
      const canvas = document.createElement('canvas')
      setupCanvasMocks(canvas)
      const faces: FaceBox[] = []

      // When
      drawImageWithMosaic(canvas, video, faces)

      // Then: canvas サイズが videoWidth/videoHeight と一致する
      expect(canvas.width).toBe(1280)
      expect(canvas.height).toBe(720)
    })
  })

  // =====================================================================
  // 境界値
  // =====================================================================

  describe('境界値', () => {
    it('TC-06: x1 < padX — x 座標が 0 にクリップされる', () => {
      // Given: x1=2, bboxW=100, paddingRatio=0.5 → padX=50
      // x = max(0, floor(2-50)) = max(0, -48) = 0
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(2, 100, 102, 200)]

      // When
      drawImageWithMosaic(canvas, image, faces, MOSAIC_SCALE, 0.5)

      // Then: モザイク拡大適用 drawImage の x = 0
      // ctx.drawImage(temp, 0, 0, smallW, smallH, x, y, w, h)
      const enlargeCalls = mainCtx.drawImage.mock.calls.filter(
        (call: unknown[]) => call[0] !== image,
      )
      expect(enlargeCalls.length).toBeGreaterThan(0)
      expect(enlargeCalls[0][5]).toBe(0) // x = 0
    })

    it('TC-07: x2 > width — 幅が canvas 幅にクリップされる', () => {
      // Given: x1=538, x2=638, bboxW=100, paddingRatio=0.5 → padX=50
      // x = max(0, floor(538-50)) = 488
      // x2Clipped = min(640, ceil(638+50)) = min(640, 688) = 640
      // w = 640 - 488 = 152
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(538, 100, 638, 200)]

      // When
      drawImageWithMosaic(canvas, image, faces, MOSAIC_SCALE, 0.5)

      // Then: モザイク拡大適用 drawImage の w = 152
      const enlargeCalls = mainCtx.drawImage.mock.calls.filter(
        (call: unknown[]) => call[0] !== image,
      )
      expect(enlargeCalls.length).toBeGreaterThan(0)
      expect(enlargeCalls[0][7]).toBe(152) // w = 152
    })

    it('TC-08: y1 < padY — y 座標が 0 にクリップされる', () => {
      // Given: y1=2, bboxH=100, paddingRatio=0.5 → padY=50
      // y = max(0, floor(2-50)) = 0
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(100, 2, 200, 102)]

      // When
      drawImageWithMosaic(canvas, image, faces, MOSAIC_SCALE, 0.5)

      // Then: モザイク拡大適用 drawImage の y = 0
      const enlargeCalls = mainCtx.drawImage.mock.calls.filter(
        (call: unknown[]) => call[0] !== image,
      )
      expect(enlargeCalls[0][6]).toBe(0) // y = 0
    })

    it('TC-09: y2 > height — 高さが canvas 高さにクリップされる', () => {
      // Given: y1=378, y2=478, bboxH=100, paddingRatio=0.5 → padY=50
      // y = max(0, floor(378-50)) = 328
      // y2Clipped = min(480, ceil(478+50)) = 480
      // h = 480 - 328 = 152
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(100, 378, 200, 478)]

      // When
      drawImageWithMosaic(canvas, image, faces, MOSAIC_SCALE, 0.5)

      // Then: モザイク拡大適用 drawImage の h = 152
      const enlargeCalls = mainCtx.drawImage.mock.calls.filter(
        (call: unknown[]) => call[0] !== image,
      )
      expect(enlargeCalls[0][8]).toBe(152) // h = 152
    })

    it('TC-10: w = 0 になる bbox — applyPixelMosaic がスキップされる', () => {
      // Given: x1 = x2 かつ paddingRatio = 0 → w = 0
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(100, 100, 100, 200)]

      // When
      drawImageWithMosaic(canvas, image, faces, MOSAIC_SCALE, 0)

      // Then: モザイク drawImage が呼ばれない（元画像の1回のみ）
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1)
    })

    it('TC-11: h = 0 になる bbox — applyPixelMosaic がスキップされる', () => {
      // Given: y1 = y2 かつ paddingRatio = 0 → h = 0
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(100, 100, 200, 100)]

      // When
      drawImageWithMosaic(canvas, image, faces, MOSAIC_SCALE, 0)

      // Then: モザイク drawImage が呼ばれない（元画像の1回のみ）
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1)
    })

    it('TC-12: mosaicScale = 1.0 — クラッシュせず正常に完了する', () => {
      // Given: mosaicScale = 1.0 (縮小なし)
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(100, 100, 200, 200)]

      // When / Then: エラーが発生しない
      expect(() => drawImageWithMosaic(canvas, image, faces, 1.0, 0)).not.toThrow()
    })

    it('TC-13: mosaicScale 極小 (0.001) — smallW/H が最低 1 になる', () => {
      // Given: mosaicScale = 0.001 → floor(100 * 0.001) = 0 → Math.max(1, 0) = 1
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(100, 100, 200, 200)]

      // When
      drawImageWithMosaic(canvas, image, faces, 0.001, 0)

      // Then: 拡大 drawImage の smallW >= 1, smallH >= 1
      const enlargeCalls = mainCtx.drawImage.mock.calls.filter(
        (call: unknown[]) => call[0] !== image,
      )
      expect(enlargeCalls.length).toBeGreaterThan(0)
      expect(enlargeCalls[0][3]).toBeGreaterThanOrEqual(1) // smallW >= 1
      expect(enlargeCalls[0][4]).toBeGreaterThanOrEqual(1) // smallH >= 1
    })

    it('TC-14: paddingRatio = 0 — bbox そのままのサイズでモザイク適用', () => {
      // Given: paddingRatio = 0 → padX = padY = 0
      // bbox: x1=100, y1=100, x2=200, y2=200 → x=100, y=100, w=100, h=100
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(100, 100, 200, 200)]

      // When
      drawImageWithMosaic(canvas, image, faces, MOSAIC_SCALE, 0)

      // Then: モザイク drawImage の x=100, y=100, w=100, h=100
      const enlargeCalls = mainCtx.drawImage.mock.calls.filter(
        (call: unknown[]) => call[0] !== image,
      )
      expect(enlargeCalls[0][5]).toBe(100) // x
      expect(enlargeCalls[0][6]).toBe(100) // y
      expect(enlargeCalls[0][7]).toBe(100) // w
      expect(enlargeCalls[0][8]).toBe(100) // h
    })
  })

  // =====================================================================
  // 異常系
  // =====================================================================

  describe('異常系', () => {
    it('TC-15: canvas の getContext が null を返す — Error をスロー', () => {
      // Given: canvas.getContext が null を返す
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      vi.spyOn(canvas, 'getContext').mockReturnValue(null)
      const faces: FaceBox[] = [makeFace(100, 100, 200, 200)]

      // When / Then: Error がスローされる
      expect(() => drawImageWithMosaic(canvas, image, faces)).toThrow(
        'Failed to get 2D context from canvas',
      )
    })

    it('TC-16: 一時 canvas の getContext が null を返す — Error をスロー', () => {
      // Given: 一時 canvas の getContext が null を返す
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const mainCtx = createMockCtx(canvas)
      vi.spyOn(canvas, 'getContext').mockReturnValue(mainCtx as unknown as RenderingContext)
      const faces: FaceBox[] = [makeFace(100, 100, 200, 200)]

      // 一時 canvas は getContext が null を返す
      const tempCanvas = document.createElement('canvas')
      vi.spyOn(tempCanvas, 'getContext').mockReturnValue(null)

      const originalCreateElement2 = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') return tempCanvas
        return originalCreateElement2(tag)
      })

      // When / Then: Error がスローされる
      expect(() => drawImageWithMosaic(canvas, image, faces)).toThrow(
        'Failed to get 2D context from temporary canvas',
      )
    })

    it('TC-17: canvas 外の顔 (x1 > width) — w <= 0 でスキップしてエラーなし', () => {
      // Given: 顔の bbox x1=700 が canvas 幅 640 を超えている
      // x = max(0, floor(700)) = 700
      // x2Clipped = min(640, ceil(800)) = 640
      // w = 640 - 700 = -60 <= 0 → スキップ
      const image = createMockImage(640, 480)
      const canvas = document.createElement('canvas')
      const { mainCtx } = setupCanvasMocks(canvas)
      const faces: FaceBox[] = [makeFace(700, 100, 800, 200)]

      // When / Then: エラーなし、モザイクなし
      expect(() =>
        drawImageWithMosaic(canvas, image, faces, MOSAIC_SCALE, 0),
      ).not.toThrow()
      // drawImage は元画像の1回のみ
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1)
    })
  })
})
