/**
 * useFaceDetection カスタムフック テスト
 *
 * テスト観点表（等価分割・境界値）
 *
 * | # | 区分       | 入力                                      | 期待する結果                          |
 * |---|------------|-------------------------------------------|---------------------------------------|
 * | 1 | 正常系     | 有効な画像、1件の顔検出                   | FaceBox[] が返る、エラーなし         |
 * | 2 | 正常系     | 有効な画像、顔なし検出                    | [] が返る、エラーなし                 |
 * | 3 | 正常系     | 2回目の呼び出し                          | セッションが再利用される              |
 * | 4 | 正常系     | 初回呼び出し中のロード状態               | isModelLoading が true になる        |
 * | 5 | 正常系     | 推論中の状態                             | isProcessing が true になる          |
 * | 6 | 異常系     | getFaceSession が例外をスロー            | error がセット、[] が返る            |
 * | 7 | 異常系     | runFaceDetection が例外をスロー          | error がセット、[] が返る            |
 * | 8 | 異常系     | 出力に selectedBoxes がない             | error がセット、[] が返る            |
 * | 9 | 境界値     | getFaceSession が非 Error をスロー       | fallback エラーメッセージがセット     |
 * |10 | 境界値     | runFaceDetection が非 Error をスロー     | fallback エラーメッセージがセット     |
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type * as ort from 'onnxruntime-web'
import { useFaceDetection } from '@/hooks/useFaceDetection'

// -----------------------------------------------------------------------
// モジュールモック
// -----------------------------------------------------------------------

vi.mock('@/lib/onnx/session', () => ({
  getFaceSession: vi.fn(),
  runFaceDetection: vi.fn(),
}))

vi.mock('@/lib/onnx/preprocess', () => ({
  preprocessImageToTensor: vi.fn(),
}))

vi.mock('@/lib/onnx/postprocess', () => ({
  postprocessDetections: vi.fn(),
}))

import { getFaceSession, runFaceDetection } from '@/lib/onnx/session'
import { preprocessImageToTensor } from '@/lib/onnx/preprocess'
import { postprocessDetections } from '@/lib/onnx/postprocess'

// -----------------------------------------------------------------------
// ヘルパー
// -----------------------------------------------------------------------

function createMockImage(): HTMLImageElement {
  return document.createElement('img')
}

function createMockTensor(): ort.Tensor {
  return {
    data: new Float32Array(128 * 128 * 3),
    dims: [1, 3, 128, 128],
    type: 'float32',
  } as unknown as ort.Tensor
}

function createMockSession(): ort.InferenceSession {
  return {} as ort.InferenceSession
}

function createMockSelectedBoxes(count: number): Float32Array {
  return new Float32Array(count * 16)
}

// -----------------------------------------------------------------------
// テスト
// -----------------------------------------------------------------------

describe('useFaceDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =====================================================================
  // 正常系
  // =====================================================================

  describe('正常系', () => {
    it('TC-01: 1件の顔を検出して FaceBox[] を返す', async () => {
      // Given
      const session = createMockSession()
      const tensor = createMockTensor()
      const boxes = createMockSelectedBoxes(1)
      const expectedFaces = [{ x1: 10, y1: 20, x2: 100, y2: 120, score: 1.0 }]

      vi.mocked(getFaceSession).mockResolvedValue(session)
      vi.mocked(preprocessImageToTensor).mockReturnValue({
        tensor,
        originalWidth: 640,
        originalHeight: 480,
      })
      vi.mocked(runFaceDetection).mockResolvedValue({
        selectedBoxes: {
          data: boxes,
          dims: [1, 1, 16],
          type: 'float32',
        } as unknown as ort.Tensor,
      })
      vi.mocked(postprocessDetections).mockReturnValue(expectedFaces)

      const { result } = renderHook(() => useFaceDetection())
      const image = createMockImage()

      // When
      let faces: typeof expectedFaces = []
      await act(async () => {
        faces = await result.current.detectFaces(image)
      })

      // Then
      expect(faces).toEqual(expectedFaces)
      expect(result.current.error).toBeNull()
      expect(result.current.isModelLoading).toBe(false)
      expect(result.current.isProcessing).toBe(false)
    })

    it('TC-02: 顔なしの場合は空配列を返す', async () => {
      // Given
      const session = createMockSession()
      const tensor = createMockTensor()
      const boxes = createMockSelectedBoxes(0)

      vi.mocked(getFaceSession).mockResolvedValue(session)
      vi.mocked(preprocessImageToTensor).mockReturnValue({
        tensor,
        originalWidth: 100,
        originalHeight: 100,
      })
      vi.mocked(runFaceDetection).mockResolvedValue({
        selectedBoxes: {
          data: boxes,
          dims: [1, 0, 16],
          type: 'float32',
        } as unknown as ort.Tensor,
      })
      vi.mocked(postprocessDetections).mockReturnValue([])

      const { result } = renderHook(() => useFaceDetection())

      // When
      let faces: ReturnType<typeof postprocessDetections> = []
      await act(async () => {
        faces = await result.current.detectFaces(createMockImage())
      })

      // Then
      expect(faces).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('TC-03: 2回目の呼び出しでも正常に動作する', async () => {
      // Given
      const session = createMockSession()
      const tensor = createMockTensor()
      const boxes = createMockSelectedBoxes(1)
      const expectedFaces = [{ x1: 10, y1: 20, x2: 100, y2: 120, score: 1.0 }]

      vi.mocked(getFaceSession).mockResolvedValue(session)
      vi.mocked(preprocessImageToTensor).mockReturnValue({
        tensor,
        originalWidth: 640,
        originalHeight: 480,
      })
      vi.mocked(runFaceDetection).mockResolvedValue({
        selectedBoxes: {
          data: boxes,
          dims: [1, 1, 16],
          type: 'float32',
        } as unknown as ort.Tensor,
      })
      vi.mocked(postprocessDetections).mockReturnValue(expectedFaces)

      const { result } = renderHook(() => useFaceDetection())

      // When: 1回目
      await act(async () => {
        await result.current.detectFaces(createMockImage())
      })

      // When: 2回目
      let faces: typeof expectedFaces = []
      await act(async () => {
        faces = await result.current.detectFaces(createMockImage())
      })

      // Then: getFaceSession が2回呼ばれる（シングルトンはライブラリ内部で管理）
      expect(getFaceSession).toHaveBeenCalledTimes(2)
      expect(faces).toEqual(expectedFaces)
    })

    it('TC-04: 呼び出し完了後に isModelLoading が false に戻る', async () => {
      // Given
      vi.mocked(getFaceSession).mockResolvedValue(createMockSession())
      vi.mocked(preprocessImageToTensor).mockReturnValue({
        tensor: createMockTensor(),
        originalWidth: 100,
        originalHeight: 100,
      })
      vi.mocked(runFaceDetection).mockResolvedValue({
        selectedBoxes: {
          data: new Float32Array(0),
          dims: [1, 0, 16],
          type: 'float32',
        } as unknown as ort.Tensor,
      })
      vi.mocked(postprocessDetections).mockReturnValue([])

      const { result } = renderHook(() => useFaceDetection())

      // When
      await act(async () => {
        await result.current.detectFaces(createMockImage())
      })

      // Then
      expect(result.current.isModelLoading).toBe(false)
    })

    it('TC-05: 呼び出し完了後に isProcessing が false に戻る', async () => {
      // Given
      vi.mocked(getFaceSession).mockResolvedValue(createMockSession())
      vi.mocked(preprocessImageToTensor).mockReturnValue({
        tensor: createMockTensor(),
        originalWidth: 100,
        originalHeight: 100,
      })
      vi.mocked(runFaceDetection).mockResolvedValue({
        selectedBoxes: {
          data: new Float32Array(0),
          dims: [1, 0, 16],
          type: 'float32',
        } as unknown as ort.Tensor,
      })
      vi.mocked(postprocessDetections).mockReturnValue([])

      const { result } = renderHook(() => useFaceDetection())

      // When
      await act(async () => {
        await result.current.detectFaces(createMockImage())
      })

      // Then
      expect(result.current.isProcessing).toBe(false)
    })
  })

  // =====================================================================
  // 異常系
  // =====================================================================

  describe('異常系', () => {
    it('TC-06: getFaceSession が Error をスローした場合 — error がセットされ [] が返る', async () => {
      // Given
      vi.mocked(getFaceSession).mockRejectedValue(
        new Error('モデルファイルが見つかりません'),
      )

      const { result } = renderHook(() => useFaceDetection())

      // When
      let faces: ReturnType<typeof postprocessDetections> = []
      await act(async () => {
        faces = await result.current.detectFaces(createMockImage())
      })

      // Then
      expect(faces).toEqual([])
      expect(result.current.error).toBe('モデルファイルが見つかりません')
      expect(result.current.isModelLoading).toBe(false)
      expect(result.current.isProcessing).toBe(false)
    })

    it('TC-07: runFaceDetection が Error をスローした場合 — error がセットされ [] が返る', async () => {
      // Given
      vi.mocked(getFaceSession).mockResolvedValue(createMockSession())
      vi.mocked(preprocessImageToTensor).mockReturnValue({
        tensor: createMockTensor(),
        originalWidth: 100,
        originalHeight: 100,
      })
      vi.mocked(runFaceDetection).mockRejectedValue(
        new Error('推論に失敗しました'),
      )

      const { result } = renderHook(() => useFaceDetection())

      // When
      let faces: ReturnType<typeof postprocessDetections> = []
      await act(async () => {
        faces = await result.current.detectFaces(createMockImage())
      })

      // Then
      expect(faces).toEqual([])
      expect(result.current.error).toBe('推論に失敗しました')
      expect(result.current.isProcessing).toBe(false)
    })

    it('TC-08: 出力に selectedBoxes がない場合 — error がセットされ [] が返る', async () => {
      // Given
      vi.mocked(getFaceSession).mockResolvedValue(createMockSession())
      vi.mocked(preprocessImageToTensor).mockReturnValue({
        tensor: createMockTensor(),
        originalWidth: 100,
        originalHeight: 100,
      })
      // selectedBoxes を含まない出力
      vi.mocked(runFaceDetection).mockResolvedValue({})

      const { result } = renderHook(() => useFaceDetection())

      // When
      let faces: ReturnType<typeof postprocessDetections> = []
      await act(async () => {
        faces = await result.current.detectFaces(createMockImage())
      })

      // Then
      expect(faces).toEqual([])
      expect(result.current.error).toBe(
        'モデルの出力に selectedBoxes が含まれていません',
      )
    })
  })

  // =====================================================================
  // 境界値
  // =====================================================================

  describe('境界値', () => {
    it('TC-09: getFaceSession が非 Error をスローした場合 — fallback メッセージがセット', async () => {
      // Given: 非 Error オブジェクトをスロー
      vi.mocked(getFaceSession).mockRejectedValue('文字列エラー')

      const { result } = renderHook(() => useFaceDetection())

      // When
      await act(async () => {
        await result.current.detectFaces(createMockImage())
      })

      // Then
      expect(result.current.error).toBe('モデルの読み込みに失敗しました')
    })

    it('TC-10: runFaceDetection が非 Error をスローした場合 — fallback メッセージがセット', async () => {
      // Given
      vi.mocked(getFaceSession).mockResolvedValue(createMockSession())
      vi.mocked(preprocessImageToTensor).mockReturnValue({
        tensor: createMockTensor(),
        originalWidth: 100,
        originalHeight: 100,
      })
      vi.mocked(runFaceDetection).mockRejectedValue(42)

      const { result } = renderHook(() => useFaceDetection())

      // When
      await act(async () => {
        await result.current.detectFaces(createMockImage())
      })

      // Then
      expect(result.current.error).toBe('顔検出の処理に失敗しました')
    })

    it('TC-11: 連続エラー後の再実行で error がリセットされる', async () => {
      // Given: 1回目はエラー
      vi.mocked(getFaceSession).mockRejectedValueOnce(
        new Error('初回エラー'),
      )

      // 2回目は成功
      vi.mocked(getFaceSession).mockResolvedValue(createMockSession())
      vi.mocked(preprocessImageToTensor).mockReturnValue({
        tensor: createMockTensor(),
        originalWidth: 100,
        originalHeight: 100,
      })
      vi.mocked(runFaceDetection).mockResolvedValue({
        selectedBoxes: {
          data: new Float32Array(0),
          dims: [1, 0, 16],
          type: 'float32',
        } as unknown as ort.Tensor,
      })
      vi.mocked(postprocessDetections).mockReturnValue([])

      const { result } = renderHook(() => useFaceDetection())

      // When: 1回目（エラー）
      await act(async () => {
        await result.current.detectFaces(createMockImage())
      })
      expect(result.current.error).not.toBeNull()

      // When: 2回目（成功）
      await act(async () => {
        await result.current.detectFaces(createMockImage())
      })

      // Then: エラーがクリアされる
      expect(result.current.error).toBeNull()
    })
  })
})
