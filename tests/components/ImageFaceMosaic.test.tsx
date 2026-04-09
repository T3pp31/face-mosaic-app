/**
 * ImageFaceMosaic コンポーネント テスト
 *
 * テスト観点表（等価分割・境界値）
 *
 * | #  | 区分   | 入力/状態                              | 期待する結果                                  |
 * |----|--------|----------------------------------------|-----------------------------------------------|
 * |  1 | 正常系 | 初期表示                               | DropZone が表示、canvas は非表示              |
 * |  2 | 正常系 | ファイル選択 → 成功                    | 顔検出・モザイク描画が呼ばれる               |
 * |  3 | 正常系 | ファイル選択 → 顔なし                  | drawImageWithMosaic が空配列で呼ばれる        |
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

import { useFaceDetection } from '@/hooks/useFaceDetection'
import { drawImageWithMosaic } from '@/lib/mosaic/mosaicCanvas'
import type { FaceBox } from '@/lib/onnx/postprocess'

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

function createImageFile(name = 'test.jpg'): File {
  return new File(['dummy'], name, { type: 'image/jpeg' })
}

// -----------------------------------------------------------------------
// テスト
// -----------------------------------------------------------------------

describe('ImageFaceMosaic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // URL.createObjectURL / revokeObjectURL のモック
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()

    // Image のモック（src セット直後に onload を同期呼び出し）
    class MockImage {
      width = 100
      height = 100
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''

      get src() {
        return this._src
      }
      set src(value: string) {
        this._src = value
        if (this.onload) {
          this.onload()
        }
      }
    }
    vi.stubGlobal('Image', MockImage)
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
      const file = createImageFile()

      // When: fireEvent.change で change イベントを発火
      await act(async () => {
        Object.defineProperty(input, 'files', {
          value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
          configurable: true,
        })
        fireEvent.change(input)
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
      const file = createImageFile()

      // When
      await act(async () => {
        Object.defineProperty(input, 'files', {
          value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
          configurable: true,
        })
        fireEvent.change(input)
      })

      // Then
      await waitFor(() => {
        expect(drawImageWithMosaic).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Object),
          [],
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
