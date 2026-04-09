import * as ort from 'onnxruntime-web'
import {
  MODEL_PATH,
  MODEL_INPUT_NAME,
  CONF_THRESHOLD,
  IOU_THRESHOLD,
  MAX_DETECTIONS,
} from '@/config/constants'

// jsDelivr CDN から WASM バイナリを読み込む
ort.env.wasm.wasmPaths =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'

// マルチスレッドを無効化して安定動作させる
ort.env.wasm.numThreads = 1

let sessionInstance: ort.InferenceSession | null = null

/**
 * InferenceSession をシングルトンで取得する
 */
export async function getFaceSession(): Promise<ort.InferenceSession> {
  if (sessionInstance !== null) {
    return sessionInstance
  }

  sessionInstance = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ['wasm'],
  })

  return sessionInstance
}

/**
 * 顔検出推論を実行する
 *
 * @param session  InferenceSession
 * @param tensor   前処理済み入力テンソル [1, 3, 128, 128]
 * @returns        推論出力マップ
 */
export async function runFaceDetection(
  session: ort.InferenceSession,
  tensor: ort.Tensor,
): Promise<ort.InferenceSession.OnnxValueMapType> {
  const confThresholdTensor = new ort.Tensor(
    'float32',
    Float32Array.from([CONF_THRESHOLD]),
    [1],
  )

  const iouThresholdTensor = new ort.Tensor(
    'float32',
    Float32Array.from([IOU_THRESHOLD]),
    [1],
  )

  const maxDetectionsTensor = new ort.Tensor(
    'int64',
    BigInt64Array.from([BigInt(MAX_DETECTIONS)]),
    [1],
  )

  const feeds: ort.InferenceSession.OnnxValueMapType = {
    [MODEL_INPUT_NAME]: tensor,
    conf_threshold: confThresholdTensor,
    iou_threshold: iouThresholdTensor,
    max_detections: maxDetectionsTensor,
  }

  return session.run(feeds)
}
