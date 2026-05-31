import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { preprocessImageToTensor } from '@/lib/onnx/preprocess'
import { MODEL_INPUT_SIZE } from '@/config/constants'

// ---------------------------------------------------------------------------
// テスト観点表（等価分割・境界値）
// ---------------------------------------------------------------------------
// | # | 観点                               | 入力条件                                  | 期待結果                              |
// |---|------------------------------------|-------------------------------------------|---------------------------------------|
// | 1 | 正常系: HTMLImageElement           | 有効な Image 要素                          | tensor shape [1,3,128,128]            |
// | 2 | 正常系: HTMLCanvasElement          | 有効な Canvas 要素                         | tensor shape [1,3,128,128]            |
// | 3 | 正常系: HTMLVideoElement           | 有効な Video 要素                          | tensor shape [1,3,128,128]            |
// | 4 | 正常系: originalSize 返却          | 640x480 Image                              | originalWidth=640, originalHeight=480 |
// | 5 | 正常系: Video の originalSize      | videoWidth=1280, videoHeight=720           | 1280 / 720                            |
// | 6 | 境界値: inputSize=1               | inputSize=1                                | shape [1,3,1,1]                       |
// | 7 | 境界値: カスタム inputSize         | inputSize=64                               | shape [1,3,64,64]                     |
// | 8 | デフォルト inputSize               | 引数省略                                   | MODEL_INPUT_SIZE 使用                 |
// | 9 | 0-1 正規化確認                     | 白ピクセル (255,255,255) の Canvas         | 全値が 1.0 付近                       |
// |10 | 0-1 正規化確認                     | 黒ピクセル (0,0,0) の Canvas               | 全値が 0.0                            |
// |11 | CHW 変換確認                       | R=255,G=0,B=0 の Canvas                   | R 平面=1, G/B 平面=0                  |
// |12 | 異常系: getContext null            | Canvas.getContext が null を返す           | Error スロー                          |
// |13 | tensor 型が float32                | 通常入力                                   | tensor.type === 'float32'             |
// |14 | tensor dims が 4 次元              | 通常入力                                   | tensor.dims.length === 4              |
// ---------------------------------------------------------------------------

// jsdom は canvas getImageData が全て 0 を返すため、
// ImageData を制御して RGB 値を検証する mock を用意する。

function makeImageMock(width: number, height: number): HTMLImageElement {
  const img = document.createElement('img')
  Object.defineProperty(img, 'width', { value: width, configurable: true })
  Object.defineProperty(img, 'height', { value: height, configurable: true })
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true })
  return img
}

function makeCanvasMock(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'width', { value: width, configurable: true })
  Object.defineProperty(canvas, 'height', { value: height, configurable: true })
  return canvas
}

function makeVideoMock(
  videoWidth: number,
  videoHeight: number,
): HTMLVideoElement {
  const video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', {
    value: videoWidth,
    configurable: true,
  })
  Object.defineProperty(video, 'videoHeight', {
    value: videoHeight,
    configurable: true,
  })
  // video 要素は width/height プロパティも持つが videoWidth/Height を使う
  return video
}

/**
 * document.createElement('canvas') を差し替え、
 * getImageData が指定の RGBA データを返すように spy する。
 */
function mockCanvasContext(rgbaFn: (size: number) => Uint8ClampedArray) {
  const originalCreateElement = document.createElement.bind(document)

  vi.spyOn(document, 'createElement').mockImplementation(
    (tag: string, ...args: unknown[]) => {
      if (tag === 'canvas') {
        const mockCanvas = originalCreateElement('canvas')
        const mockCtx = {
          drawImage: vi.fn(),
          getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
            const size = w * h
            return { data: rgbaFn(size) } as unknown as ImageData
          }),
        }
        vi.spyOn(mockCanvas, 'getContext').mockReturnValue(
          mockCtx as unknown as CanvasRenderingContext2D,
        )
        return mockCanvas
      }
      return originalCreateElement(tag, ...(args as [ElementCreationOptions?]))
    },
  )
}

describe('preprocessImageToTensor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // 正常系: 出力形状
  // -----------------------------------------------------------------------

  it('TC01: HTMLImageElement を受け取り tensor shape [1,3,128,128] を返す', () => {
    // Given
    mockCanvasContext((size) => new Uint8ClampedArray(size * 4))
    const img = makeImageMock(640, 480)

    // When
    const { tensor } = preprocessImageToTensor(img)

    // Then
    expect(tensor.dims).toEqual([1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
  })

  it('TC02: HTMLCanvasElement を受け取り tensor shape [1,3,128,128] を返す', () => {
    // Given
    mockCanvasContext((size) => new Uint8ClampedArray(size * 4))
    const canvas = makeCanvasMock(320, 240)

    // When
    const { tensor } = preprocessImageToTensor(canvas)

    // Then
    expect(tensor.dims).toEqual([1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
  })

  it('TC03: HTMLVideoElement を受け取り tensor shape [1,3,128,128] を返す', () => {
    // Given
    mockCanvasContext((size) => new Uint8ClampedArray(size * 4))
    const video = makeVideoMock(1280, 720)

    // When
    const { tensor } = preprocessImageToTensor(video)

    // Then
    expect(tensor.dims).toEqual([1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
  })

  it('TC13: tensor.type が float32 である', () => {
    // Given
    mockCanvasContext((size) => new Uint8ClampedArray(size * 4))
    const img = makeImageMock(100, 100)

    // When
    const { tensor } = preprocessImageToTensor(img)

    // Then
    expect(tensor.type).toBe('float32')
  })

  it('TC14: tensor.dims は 4 次元 [1, 3, H, W]', () => {
    // Given
    mockCanvasContext((size) => new Uint8ClampedArray(size * 4))
    const img = makeImageMock(100, 100)

    // When
    const { tensor } = preprocessImageToTensor(img)

    // Then
    expect(tensor.dims).toHaveLength(4)
    expect(tensor.dims[0]).toBe(1)
    expect(tensor.dims[1]).toBe(3)
  })

  // -----------------------------------------------------------------------
  // 正常系: originalSize 返却
  // -----------------------------------------------------------------------

  it('TC04: HTMLImageElement の元サイズを正しく返す', () => {
    // Given
    mockCanvasContext((size) => new Uint8ClampedArray(size * 4))
    const img = makeImageMock(640, 480)

    // When
    const { originalWidth, originalHeight } = preprocessImageToTensor(img)

    // Then
    expect(originalWidth).toBe(640)
    expect(originalHeight).toBe(480)
  })

  it('TC05: HTMLVideoElement の元サイズは videoWidth/videoHeight を使う', () => {
    // Given
    mockCanvasContext((size) => new Uint8ClampedArray(size * 4))
    const video = makeVideoMock(1280, 720)

    // When
    const { originalWidth, originalHeight } = preprocessImageToTensor(video)

    // Then
    expect(originalWidth).toBe(1280)
    expect(originalHeight).toBe(720)
  })

  // -----------------------------------------------------------------------
  // 境界値: inputSize
  // -----------------------------------------------------------------------

  it('TC06: inputSize=1 のとき shape [1,3,1,1] のテンソルを返す', () => {
    // Given
    mockCanvasContext((_size) => new Uint8ClampedArray(1 * 4))
    const img = makeImageMock(64, 64)

    // When
    const { tensor } = preprocessImageToTensor(img, 1)

    // Then
    expect(tensor.dims).toEqual([1, 3, 1, 1])
  })

  it('TC07: カスタム inputSize=64 のとき shape [1,3,64,64] のテンソルを返す', () => {
    // Given
    mockCanvasContext((size) => new Uint8ClampedArray(size * 4))
    const img = makeImageMock(128, 128)

    // When
    const { tensor } = preprocessImageToTensor(img, 64)

    // Then
    expect(tensor.dims).toEqual([1, 3, 64, 64])
  })

  it('TC08: inputSize 省略時は MODEL_INPUT_SIZE が使われる', () => {
    // Given
    mockCanvasContext((size) => new Uint8ClampedArray(size * 4))
    const img = makeImageMock(200, 150)

    // When
    const { tensor } = preprocessImageToTensor(img)

    // Then
    expect(tensor.dims[2]).toBe(MODEL_INPUT_SIZE)
    expect(tensor.dims[3]).toBe(MODEL_INPUT_SIZE)
  })

  // -----------------------------------------------------------------------
  // 0-1 正規化 & CHW 変換
  // -----------------------------------------------------------------------

  it('TC09: 白ピクセル(255,255,255)のとき全チャンネル値が 1.0', () => {
    // Given: 全ピクセルが白 (RGBA = 255,255,255,255)
    mockCanvasContext((size) => {
      const data = new Uint8ClampedArray(size * 4)
      data.fill(255)
      return data
    })
    const img = makeImageMock(64, 64)

    // When
    const { tensor } = preprocessImageToTensor(img)
    const data = tensor.data as Float32Array

    // Then
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBeCloseTo(1.0)
    }
  })

  it('TC10: 黒ピクセル(0,0,0)のとき全チャンネル値が 0.0', () => {
    // Given: 全ピクセルが黒 (RGBA = 0,0,0,255)
    mockCanvasContext((size) => {
      const data = new Uint8ClampedArray(size * 4)
      // R=G=B=0, A=255
      for (let i = 0; i < size; i++) {
        data[i * 4 + 3] = 255
      }
      return data
    })
    const img = makeImageMock(64, 64)

    // When
    const { tensor } = preprocessImageToTensor(img)
    const data = tensor.data as Float32Array

    // Then
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBeCloseTo(0.0)
    }
  })

  it('TC11: R=255,G=0,B=0 ピクセルのとき R 平面=1.0, G/B 平面=0.0', () => {
    // Given: 全ピクセルが赤 (RGBA = 255,0,0,255)
    const inputSize = 4
    mockCanvasContext((size) => {
      const data = new Uint8ClampedArray(size * 4)
      for (let i = 0; i < size; i++) {
        data[i * 4] = 255 // R
        data[i * 4 + 1] = 0 // G
        data[i * 4 + 2] = 0 // B
        data[i * 4 + 3] = 255 // A
      }
      return data
    })
    const img = makeImageMock(64, 64)

    // When
    const { tensor } = preprocessImageToTensor(img, inputSize)
    const data = tensor.data as Float32Array
    const pixelCount = inputSize * inputSize

    // Then: R 平面 (index 0..pixelCount-1) = 1.0
    for (let i = 0; i < pixelCount; i++) {
      expect(data[i]).toBeCloseTo(1.0)
    }
    // G 平面 (index pixelCount..2*pixelCount-1) = 0.0
    for (let i = pixelCount; i < 2 * pixelCount; i++) {
      expect(data[i]).toBeCloseTo(0.0)
    }
    // B 平面 (index 2*pixelCount..3*pixelCount-1) = 0.0
    for (let i = 2 * pixelCount; i < 3 * pixelCount; i++) {
      expect(data[i]).toBeCloseTo(0.0)
    }
  })

  // -----------------------------------------------------------------------
  // 異常系
  // -----------------------------------------------------------------------

  it('TC12: getContext が null を返すとき Error をスローする', () => {
    // Given: getContext が null を返す canvas
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string, ...args: unknown[]) => {
        if (tag === 'canvas') {
          const mockCanvas = originalCreateElement('canvas')
          vi.spyOn(mockCanvas, 'getContext').mockReturnValue(null)
          return mockCanvas
        }
        return originalCreateElement(tag, ...(args as [ElementCreationOptions?]))
      },
    )

    const img = makeImageMock(64, 64)

    // When / Then
    expect(() => preprocessImageToTensor(img)).toThrow(
      'Failed to get 2D context from canvas',
    )
  })
})
