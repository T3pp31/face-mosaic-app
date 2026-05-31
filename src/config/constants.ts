/**
 * Face detection model configuration
 */
export const MODEL_PATH = `${import.meta.env.BASE_URL}models/blaze.onnx`

export const MODEL_INPUT_NAME = 'image'
export const MODEL_INPUT_SIZE = 128

export const CONF_THRESHOLD = 0.5
export const IOU_THRESHOLD = 0.3
export const MAX_DETECTIONS = 25

/**
 * Runtime adjustable detection parameter UI bounds
 */
export const CONF_THRESHOLD_MIN = 0.1
export const CONF_THRESHOLD_MAX = 0.9
export const CONF_THRESHOLD_STEP = 0.05

export const IOU_THRESHOLD_MIN = 0.1
export const IOU_THRESHOLD_MAX = 0.9
export const IOU_THRESHOLD_STEP = 0.05

export const MAX_DETECTIONS_MIN = 1
export const MAX_DETECTIONS_MAX = 50
export const MAX_DETECTIONS_STEP = 1

/**
 * Mosaic rendering configuration
 */
export const MOSAIC_SCALE = 0.03
export const BBOX_PADDING_RATIO = 0.15

/** 額・髪の毛方向に追加する上部パディング倍率 */
export const BBOX_PADDING_TOP_MULTIPLIER = 1.5

/**
 * タイル推論を行う顔サイズ上限 (px)。
 * この値以上の顔が全体推論で検出された場合、タイル推論はスキップする。
 */
export const SMALL_FACE_TILE_THRESHOLD = 30

/**
 * Minimum face size in pixels to filter out noise detections
 */
export const MIN_FACE_SIZE = 5

/**
 * BlazeFace anchor count (128x128 input)
 */
export const BLAZEFACE_ANCHOR_COUNT = 896

/**
 * Values per detection: 4 bbox + 12 landmark coords (6 keypoints x 2)
 */
export const VALUES_PER_DETECTION = 16
