import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// テスト観点表（等価分割・境界値）
// ---------------------------------------------------------------------------
// | # | 観点                                   | 入力条件                           | 期待結果                                      |
// |---|----------------------------------------|------------------------------------|-----------------------------------------------|
// | 1 | 正常系: getFaceSession 初回呼び出し     | session が未作成                    | InferenceSession を返す                       |
// | 2 | 正常系: getFaceSession 2 回目呼び出し   | 既にセッション作成済み              | 同一インスタンスを返す（シングルトン）         |
// | 3 | 正常系: runFaceDetection 呼び出し       | 有効な session と tensor            | session.run が正しい feeds で呼ばれる         |
// | 4 | feeds: conf_threshold が float32        | runFaceDetection 実行               | feeds に float32 テンソルが含まれる           |
// | 5 | feeds: iou_threshold が float32         | runFaceDetection 実行               | feeds に float32 テンソルが含まれる           |
// | 6 | feeds: max_detections が int64          | runFaceDetection 実行               | feeds に int64 テンソルが含まれる             |
// | 7 | feeds: image テンソルが渡される         | runFaceDetection 実行               | MODEL_INPUT_NAME が feeds に含まれる          |
// | 8 | 異常系: InferenceSession.create 失敗    | create が reject する               | エラーが伝播する                              |
// | 9 | 異常系: session.run 失敗               | session.run が reject する          | エラーが伝播する                              |
// |10 | feeds に 4 つのキーが含まれる          | runFaceDetection 実行               | feeds のキー数が 4                            |
// |11 | 動的閾値の反映                          | options で閾値/件数を指定            | feeds の値が options と一致                    |
// ---------------------------------------------------------------------------

// onnxruntime-web を完全 mock する
vi.mock('onnxruntime-web', () => {
  const mockCreate = vi.fn()

  class MockTensor {
    type: string
    data: Float32Array | BigInt64Array
    dims: number[]

    constructor(
      type: string,
      data: Float32Array | BigInt64Array,
      dims: number[],
    ) {
      this.type = type
      this.data = data
      this.dims = dims
    }
  }

  return {
    default: {},
    InferenceSession: {
      create: mockCreate,
    },
    Tensor: MockTensor,
    env: {
      wasm: {
        wasmPaths: '',
        numThreads: 1,
      },
    },
  }
})

// モジュールキャッシュを毎テストでリセットして singleton を初期化し、mock カウンタもクリアする
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('getFaceSession', () => {
  it('TC01: 初回呼び出しで InferenceSession.create を呼び session を返す', async () => {
    // Given
    const ort = await import('onnxruntime-web')
    const mockSession = { run: vi.fn() }
    vi.mocked(ort.InferenceSession.create).mockResolvedValue(
      mockSession as unknown as ReturnType<
        (typeof ort.InferenceSession)['create']
      >,
    )

    const { getFaceSession } = await import('@/lib/onnx/session')

    // When
    const session = await getFaceSession()

    // Then
    expect(session).toBe(mockSession)
    expect(ort.InferenceSession.create).toHaveBeenCalledOnce()
  })

  it('TC02: 2 回目の呼び出しでは create を呼ばず同一インスタンスを返す（シングルトン）', async () => {
    // Given
    const ort = await import('onnxruntime-web')
    const mockSession = { run: vi.fn() }
    vi.mocked(ort.InferenceSession.create).mockResolvedValue(
      mockSession as unknown as ReturnType<
        (typeof ort.InferenceSession)['create']
      >,
    )

    const { getFaceSession } = await import('@/lib/onnx/session')

    // When
    const session1 = await getFaceSession()
    const session2 = await getFaceSession()

    // Then
    expect(session1).toBe(session2)
    expect(ort.InferenceSession.create).toHaveBeenCalledOnce()
  })

  it('TC08: InferenceSession.create が失敗するとエラーが伝播する', async () => {
    // Given
    const ort = await import('onnxruntime-web')
    vi.mocked(ort.InferenceSession.create).mockRejectedValue(
      new Error('Model load failed'),
    )

    const { getFaceSession } = await import('@/lib/onnx/session')

    // When / Then
    await expect(getFaceSession()).rejects.toThrow('Model load failed')
  })
})

describe('runFaceDetection', () => {
  async function setupMocks() {
    const ort = await import('onnxruntime-web')
    const mockRun = vi.fn().mockResolvedValue({ selectedBoxes: {} })
    const mockSession = { run: mockRun }
    vi.mocked(ort.InferenceSession.create).mockResolvedValue(
      mockSession as unknown as ReturnType<
        (typeof ort.InferenceSession)['create']
      >,
    )
    const { runFaceDetection } = await import('@/lib/onnx/session')
    return { runFaceDetection, mockSession, mockRun, ort }
  }

  it('TC03: session.run が呼ばれ結果を返す', async () => {
    // Given
    const { runFaceDetection, mockSession, mockRun, ort } = await setupMocks()
    const inputTensor = new ort.Tensor(
      'float32',
      new Float32Array(1 * 3 * 128 * 128),
      [1, 3, 128, 128],
    )

    // When
    const result = await runFaceDetection(
      mockSession as unknown as import('onnxruntime-web').InferenceSession,
      inputTensor as unknown as import('onnxruntime-web').Tensor,
    )

    // Then
    expect(mockRun).toHaveBeenCalledOnce()
    expect(result).toEqual({ selectedBoxes: {} })
  })

  it('TC04: conf_threshold が float32 テンソルとして feeds に含まれる', async () => {
    // Given
    const { runFaceDetection, mockSession, mockRun, ort } = await setupMocks()
    const inputTensor = new ort.Tensor(
      'float32',
      new Float32Array(1 * 3 * 128 * 128),
      [1, 3, 128, 128],
    )

    // When
    await runFaceDetection(
      mockSession as unknown as import('onnxruntime-web').InferenceSession,
      inputTensor as unknown as import('onnxruntime-web').Tensor,
    )

    // Then
    const feeds = mockRun.mock.calls[0][0] as Record<string, { type: string }>
    expect(feeds['conf_threshold'].type).toBe('float32')
  })

  it('TC05: iou_threshold が float32 テンソルとして feeds に含まれる', async () => {
    // Given
    const { runFaceDetection, mockSession, mockRun, ort } = await setupMocks()
    const inputTensor = new ort.Tensor(
      'float32',
      new Float32Array(1 * 3 * 128 * 128),
      [1, 3, 128, 128],
    )

    // When
    await runFaceDetection(
      mockSession as unknown as import('onnxruntime-web').InferenceSession,
      inputTensor as unknown as import('onnxruntime-web').Tensor,
    )

    // Then
    const feeds = mockRun.mock.calls[0][0] as Record<string, { type: string }>
    expect(feeds['iou_threshold'].type).toBe('float32')
  })

  it('TC06: max_detections が int64 テンソルとして feeds に含まれる', async () => {
    // Given
    const { runFaceDetection, mockSession, mockRun, ort } = await setupMocks()
    const inputTensor = new ort.Tensor(
      'float32',
      new Float32Array(1 * 3 * 128 * 128),
      [1, 3, 128, 128],
    )

    // When
    await runFaceDetection(
      mockSession as unknown as import('onnxruntime-web').InferenceSession,
      inputTensor as unknown as import('onnxruntime-web').Tensor,
    )

    // Then
    const feeds = mockRun.mock.calls[0][0] as Record<string, { type: string }>
    expect(feeds['max_detections'].type).toBe('int64')
  })

  it('TC07: MODEL_INPUT_NAME (image) キーが feeds に含まれる', async () => {
    // Given
    const { runFaceDetection, mockSession, mockRun, ort } = await setupMocks()
    const inputTensor = new ort.Tensor(
      'float32',
      new Float32Array(1 * 3 * 128 * 128),
      [1, 3, 128, 128],
    )

    // When
    await runFaceDetection(
      mockSession as unknown as import('onnxruntime-web').InferenceSession,
      inputTensor as unknown as import('onnxruntime-web').Tensor,
    )

    // Then: MODEL_INPUT_NAME = 'image' が feeds にある
    const feeds = mockRun.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(feeds)).toContain('image')
  })

  it('TC10: feeds のキーが 4 つある (image, conf_threshold, iou_threshold, max_detections)', async () => {
    // Given
    const { runFaceDetection, mockSession, mockRun, ort } = await setupMocks()
    const inputTensor = new ort.Tensor(
      'float32',
      new Float32Array(1 * 3 * 128 * 128),
      [1, 3, 128, 128],
    )

    // When
    await runFaceDetection(
      mockSession as unknown as import('onnxruntime-web').InferenceSession,
      inputTensor as unknown as import('onnxruntime-web').Tensor,
    )

    // Then
    const feeds = mockRun.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(feeds)).toHaveLength(4)
    expect(Object.keys(feeds).sort()).toEqual(
      ['conf_threshold', 'image', 'iou_threshold', 'max_detections'].sort(),
    )
  })

  it('TC09: session.run が失敗するとエラーが伝播する', async () => {
    // Given
    const { runFaceDetection, mockSession, mockRun, ort } = await setupMocks()
    mockRun.mockRejectedValue(new Error('Inference failed'))
    const inputTensor = new ort.Tensor(
      'float32',
      new Float32Array(1 * 3 * 128 * 128),
      [1, 3, 128, 128],
    )

    // When / Then
    await expect(
      runFaceDetection(
        mockSession as unknown as import('onnxruntime-web').InferenceSession,
        inputTensor as unknown as import('onnxruntime-web').Tensor,
      ),
    ).rejects.toThrow('Inference failed')
  })

  it('TC11: options で指定した動的閾値が feeds に反映される', async () => {
    // Given
    const { runFaceDetection, mockSession, mockRun, ort } = await setupMocks()
    const inputTensor = new ort.Tensor(
      'float32',
      new Float32Array(1 * 3 * 128 * 128),
      [1, 3, 128, 128],
    )
    const dynamicOptions = {
      confThreshold: 0.2,
      iouThreshold: 0.6,
      maxDetections: 40,
    }

    // When
    await runFaceDetection(
      mockSession as unknown as import('onnxruntime-web').InferenceSession,
      inputTensor as unknown as import('onnxruntime-web').Tensor,
      dynamicOptions,
    )

    // Then
    const feeds = mockRun.mock.calls[0][0] as Record<
      string,
      { data: Float32Array | BigInt64Array }
    >
    expect((feeds['conf_threshold'].data as Float32Array)[0]).toBeCloseTo(0.2)
    expect((feeds['iou_threshold'].data as Float32Array)[0]).toBeCloseTo(0.6)
    expect((feeds['max_detections'].data as BigInt64Array)[0]).toBe(BigInt(40))
  })
})
