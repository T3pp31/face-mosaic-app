/**
 * ImageFaceMosaic コンポーネント テスト
 *
 * テスト観点表（等価分割・境界値）
 *
 * | #  | 区分   | 入力/状態                              | 期待する結果                                  |
 * |----|--------|----------------------------------------|-----------------------------------------------|
 * |  1 | 正常系 | 初期表示                               | DropZone が表示、canvas は非表示              |
 * |  2 | 正常系 | ファイル選択 → 成功                    | 顔検出・モザイク描画が呼ばれる               |
 * |  3 | 正常系 | ファイル選択 → 顔なし                  | drawImageWithMosaic が空配列で呼ばれ、警告が表示される |
 * |  4 | 正常系 | モデルロード中                         | ローディングテキストが表示される              |
 * |  5 | 正常系 | 推論処理中                             | 別のローディングテキストが表示される          |
 * |  6 | 異常系 | detectFaces がエラー                   | エラーメッセージが表示される                  |
 * |  7 | 境界値 | ローディング中に disabled が適用       | ImageUploader の disabled が true になる      |
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { ImageFaceMosaic } from '@/components/ImageFaceMosaic'

// -----------------------------------------------------------------------
// モジュールモック
// -----------------------------------------------------------------------

vi.mock('@/hooks/useFaceDetection', () => ({
  useFaceDetection: vi.fn(),
}))

vi.mock('@/lib/mosaic/mosaicCanvas', () => ({
  drawImageWithMosaic: vi.fn(),
}))

vi.mock('@/lib/image/loadImageFromFile', () => ({
  loadImageFromFile: vi.fn(),
}))

import { useFaceDetection } from '@/hooks/useFaceDetection'
import { drawImageWithMosaic } from '@/lib/mosaic/mosaicCanvas'
import { loadImageFromFile } from '@/lib/image/loadImageFromFile'
import type { FaceBox } from '@/lib/onnx/postprocess'
import { BBOX_PADDING_RATIO, MOSAIC_SCALE } from '@/config/constants'

// -----------------------------------------------------------------------
// ヘルパー
// -----------------------------------------------------------------------

function setupUseFaceDetectionMock(overrides: Partial<ReturnType<typeof useFaceDetection>> = {}) {
  const defaults: ReturnType<typeof useFaceDetection> = {
    detectFaces: vi.fn().mockResolvedValue([]),
    isModelLoading: false,
    isProcessing: false,
    error: null,
  }
  vi.mocked(useFaceDetection).mockReturnValue({ ...defaults, ...overrides })
  return defaults
}

function createMockImage(): HTMLImageElement {
  const img = document.createElement('img')
  Object.defineProperty(img, 'width', { value: 100, configurable: true })
  Object.defineProperty(img, 'height', { value: 100, configurable: true })
  Object.defineProperty(img, 'naturalWidth', { value: 100, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: 100, configurable: true })
  return img
}

function uploadFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', {
    value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
    configurable: true,
  })
  fireEvent.change(input)
}

// -----------------------------------------------------------------------
// テスト
// -----------------------------------------------------------------------

describe('ImageFaceMosaic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadImageFromFile).mockResolvedValue(createMockImage())
  })

  // =====================================================================
  // 正常系
  // =====================================================================

  describe('正常系', () => {
    it('TC-01: 初期表示でドロップゾーンが表示される', () => {
      // Given / When
      setupUseFaceDetectionMock()
      render(<ImageFaceMosaic />)

      // Then
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('TC-02: ファイル選択後に detectFaces と drawImageWithMosaic が呼ばれる', async () => {
      // Given
      const faces: FaceBox[] = [{ x1: 10, y1: 20, x2: 100, y2: 120, score: 1.0 }]
      const detectFaces = vi.fn().mockResolvedValue(faces)
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      // When: fireEvent.change で change イベントを発火
      await act(async () => {
        uploadFile(input, file)
      })

      // Then
      await waitFor(() => {
        expect(detectFaces).toHaveBeenCalledTimes(1)
        expect(drawImageWithMosaic).toHaveBeenCalledTimes(1)
      })
    })

    it('TC-03: 顔なし検出でも drawImageWithMosaic が空配列で呼ばれる', async () => {
      // Given
      const detectFaces = vi.fn().mockResolvedValue([])
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      // When
      await act(async () => {
        uploadFile(input, file)
      })

      // Then
      await waitFor(() => {
        expect(drawImageWithMosaic).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Object),
          [],
          MOSAIC_SCALE,
          BBOX_PADDING_RATIO,
        )
      })
    })

    it('TC-03d: 顔なし検出で警告アラートが表示される', async () => {
      // Given
      const detectFaces = vi.fn().mockResolvedValue([])
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      // When
      await act(async () => {
        uploadFile(input, file)
      })

      // Then
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          '顔が検出されませんでした',
        )
        expect(screen.getByRole('alert')).toHaveTextContent(
          'モザイクが適用されていません',
        )
      })
    })

    it('TC-03e: 警告に現在の信頼度しきい値を下げる案内が含まれる', async () => {
      // Given
      const detectFaces = vi.fn().mockResolvedValue([])
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      // When
      await act(async () => {
        uploadFile(input, file)
      })

      // Then
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('検出信頼度しきい値')
        expect(screen.getByRole('alert')).toHaveTextContent('0.50')
      })
    })

    it('TC-03f: 顔が検出された場合は警告アラートが表示されない', async () => {
      // Given
      const faces: FaceBox[] = [{ x1: 10, y1: 20, x2: 100, y2: 120, score: 1.0 }]
      const detectFaces = vi.fn().mockResolvedValue(faces)
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      // When
      await act(async () => {
        uploadFile(input, file)
      })

      // Then
      await waitFor(() => {
        expect(drawImageWithMosaic).toHaveBeenCalledTimes(1)
      })
      expect(screen.queryByText('顔が検出されませんでした。')).not.toBeInTheDocument()
    })

    it('TC-03g: 新しいファイルのアップロードで警告がクリアされる', async () => {
      // Given
      const detectFaces = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ x1: 10, y1: 20, x2: 100, y2: 120, score: 1.0 }])
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      await act(async () => {
        uploadFile(input, file)
      })
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      // When
      await act(async () => {
        uploadFile(input, file)
      })

      // Then
      await waitFor(() => {
        expect(detectFaces).toHaveBeenCalledTimes(2)
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })
    })

    it('TC-03h: 顔なしのときダウンロードで確認ダイアログが開き、キャンセルで閉じる', async () => {
      // Given
      const detectFaces = vi.fn().mockResolvedValue([])
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      await act(async () => {
        uploadFile(input, file)
      })

      // When
      fireEvent.click(screen.getByRole('button', { name: '画像をダウンロード' }))

      // Then
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // When: キャンセル
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

      // Then
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('TC-03h2: 確認ダイアログで「ダウンロードする」押下で toBlob とアンカークリックが実行され、ダイアログが閉じる', async () => {
      // Given
      const detectFaces = vi.fn().mockResolvedValue([])
      setupUseFaceDetectionMock({ detectFaces })
      const toBlobSpy = vi
        .spyOn(HTMLCanvasElement.prototype, 'toBlob')
        .mockImplementation(function (cb: BlobCallback) {
          cb(new Blob(['x'], { type: 'image/png' }))
        })
      const createObjectURLSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:mock-url')
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => {})
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {})
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      await act(async () => {
        uploadFile(input, file)
      })

      // When
      fireEvent.click(screen.getByRole('button', { name: '画像をダウンロード' }))
      fireEvent.click(screen.getByRole('button', { name: 'ダウンロードする' }))

      // Then
      expect(toBlobSpy).toHaveBeenCalledTimes(1)
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      toBlobSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
      clickSpy.mockRestore()
    })

    it('TC-03i: 顔が検出された場合はダウンロードで確認ダイアログが出ず、ダウンロードが実行される', async () => {
      // Given
      const faces: FaceBox[] = [{ x1: 10, y1: 20, x2: 100, y2: 120, score: 1.0 }]
      const detectFaces = vi.fn().mockResolvedValue(faces)
      setupUseFaceDetectionMock({ detectFaces })
      const toBlobSpy = vi
        .spyOn(HTMLCanvasElement.prototype, 'toBlob')
        .mockImplementation(function (cb: BlobCallback) {
          cb(new Blob(['x'], { type: 'image/png' }))
        })
      const createObjectURLSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:mock-url')
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => {})
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {})
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      await act(async () => {
        uploadFile(input, file)
      })
      await waitFor(() => {
        expect(drawImageWithMosaic).toHaveBeenCalledTimes(1)
      })

      // When
      fireEvent.click(screen.getByRole('button', { name: '画像をダウンロード' }))

      // Then
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(toBlobSpy).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)

      toBlobSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
      clickSpy.mockRestore()
    })

    it('TC-03b: padding のスライダー操作で drawImageWithMosaic の引数が変わる', async () => {
      // Given
      const detectFaces = vi.fn().mockResolvedValue([])
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })
      const paddingSlider = screen.getByLabelText(/顔枠を少し広げる量:/) as HTMLInputElement

      // When
      fireEvent.change(paddingSlider, { target: { value: '0.12' } })

      await act(async () => {
        uploadFile(input, file)
      })

      // Then
      await waitFor(() => {
        expect(drawImageWithMosaic).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Object),
          [],
          MOSAIC_SCALE,
          0.12,
        )
      })
    })

    it('TC-03c: アップロード後の padding 変更で drawImageWithMosaic が再実行される', async () => {
      // Given
      const faces: FaceBox[] = [{ x1: 10, y1: 20, x2: 100, y2: 120, score: 1.0 }]
      const detectFaces = vi.fn().mockResolvedValue(faces)
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })
      const paddingSlider = screen.getByLabelText(/顔枠を少し広げる量:/) as HTMLInputElement

      await act(async () => {
        uploadFile(input, file)
      })

      await waitFor(() => {
        expect(drawImageWithMosaic).toHaveBeenCalledTimes(1)
      })

      // When
      await act(async () => {
        fireEvent.change(paddingSlider, { target: { value: '0.18' } })
      })

      // Then
      await waitFor(() => {
        expect(drawImageWithMosaic).toHaveBeenCalledTimes(2)
        expect(drawImageWithMosaic).toHaveBeenLastCalledWith(
          expect.any(Object),
          expect.any(Object),
          faces,
          MOSAIC_SCALE,
          0.18,
        )
      })
    })

    it('TC-04: isModelLoading=true のときローディングメッセージが表示される', () => {
      // Given / When
      setupUseFaceDetectionMock({ isModelLoading: true })
      render(<ImageFaceMosaic />)

      // Then
      expect(screen.getByText('AIモデルを読み込んでいます...')).toBeInTheDocument()
    })

    it('TC-05: isProcessing=true のとき推論中メッセージが表示される', () => {
      // Given / When
      setupUseFaceDetectionMock({ isProcessing: true, isModelLoading: false })
      render(<ImageFaceMosaic />)

      // Then
      expect(screen.getByText('顔を検出しています...')).toBeInTheDocument()
    })
  })

  // =====================================================================
  // 異常系
  // =====================================================================

  describe('異常系', () => {
    it('TC-06: error がある場合にエラーメッセージが表示される', () => {
      // Given / When
      setupUseFaceDetectionMock({ error: 'テストエラー' })
      render(<ImageFaceMosaic />)

      // Then
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('テストエラー')
    })

    it('TC-06c: detectFaces が例外を投げた場合は警告が表示されない', async () => {
      // Given
      const detectFaces = vi.fn().mockRejectedValue(new Error('boom'))
      setupUseFaceDetectionMock({ detectFaces })
      render(<ImageFaceMosaic />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })

      // When
      await act(async () => {
        uploadFile(input, file)
      })

      // Then
      await waitFor(() => {
        expect(detectFaces).toHaveBeenCalledTimes(1)
      })
      expect(screen.queryByText('顔が検出されませんでした。')).not.toBeInTheDocument()
    })

    it('TC-06b: error がない場合にエラーメッセージが表示されない', () => {
      // Given / When
      setupUseFaceDetectionMock({ error: null })
      render(<ImageFaceMosaic />)

      // Then
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  // =====================================================================
  // 境界値
  // =====================================================================

  describe('境界値', () => {
    it('TC-07: isModelLoading=true のとき ImageUploader が disabled になる', () => {
      // Given / When
      setupUseFaceDetectionMock({ isModelLoading: true })
      render(<ImageFaceMosaic />)

      // Then
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-disabled', 'true')
    })

    it('TC-07b: isProcessing=true のとき ImageUploader が disabled になる', () => {
      // Given / When
      setupUseFaceDetectionMock({ isProcessing: true })
      render(<ImageFaceMosaic />)

      // Then
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-disabled', 'true')
    })

    it('TC-08: isModelLoading と isProcessing が両方 false のとき disabled でない', () => {
      // Given / When
      setupUseFaceDetectionMock({ isModelLoading: false, isProcessing: false })
      render(<ImageFaceMosaic />)

      // Then
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-disabled', 'false')
    })
  })
})
