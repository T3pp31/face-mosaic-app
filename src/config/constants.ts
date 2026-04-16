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
 * Mosaic rendering configuration
 */
export const MOSAIC_SCALE = 0.08
export const BBOX_PADDING_RATIO = 0.05

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
