import { describe, it, expect } from 'vitest'
import { postprocessDetections, type FaceBox } from '@/lib/onnx/postprocess'
import {
  VALUES_PER_DETECTION,
  MIN_FACE_SIZE,
} from '@/config/constants'

// ---------------------------------------------------------------------------
// テスト観点表（等価分割・境界値）— corner format [y_min, x_min, y_max, x_max]
// ---------------------------------------------------------------------------
// | # | 観点                              | 入力条件                              | 期待結果                        |
// |---|-----------------------------------|---------------------------------------|---------------------------------|
// | 1 | 正常系: 単一有効検出              | 1 行だけ非ゼロ                        | FaceBox 1 件                    |
// | 2 | 正常系: 複数有効検出              | 複数行が非ゼロ                        | FaceBox 複数件                  |
// | 3 | 正常系: 全スロット 0              | 全行 0                                | 空配列                          |
// | 4 | 境界値: MIN_FACE_SIZE ちょうど    | box幅高 = MIN_FACE_SIZE               | 1 件（有効）                    |
// | 5 | 境界値: MIN_FACE_SIZE 未満        | box幅高 < MIN_FACE_SIZE               | 0 件（除外）                    |
// | 6 | 座標変換: corner → ピクセル       | y_min,x_min,y_max,x_max 正規化       | 正しいピクセル座標              |
// | 7 | 座標変換: 画像全体               | (0,0,1,1)                             | (0,0,W,H)                       |
// | 8 | score: 常に 1.0                   | 有効な検出                            | score===1.0                     |
// | 9 | 動的サイズ: 小さい配列           | N=2 の入力                            | 正しく2件処理                   |
// |10 | 異常系: yMin/xMinのみ非ゼロ      | yMax/xMaxが0                          | MIN_FACE_SIZE未満で除外         |
// |11 | 座標系判定: 0-128 座標入力       | xMax/yMax > 1.0                       | MODEL_INPUT_SIZE 基準で変換     |
// ---------------------------------------------------------------------------

/**
 * N 件分の全ゼロ Float32Array を生成
 */
function makeZeroBoxes(count: number = 10): Float32Array {
  return new Float32Array(count * VALUES_PER_DETECTION)
}

/**
 * row 番目のスロットに [yMin, xMin, yMax, xMax, ...zeros] を書き込む
 */
function writeBox(
  arr: Float32Array,
  row: number,
  yMin: number,
  xMin: number,
  yMax: number,
  xMax: number,
): void {
  const offset = row * VALUES_PER_DETECTION
  arr[offset] = yMin
  arr[offset + 1] = xMin
  arr[offset + 2] = yMax
  arr[offset + 3] = xMax
}

describe('postprocessDetections', () => {
  // -----------------------------------------------------------------------
  // 正常系
  // -----------------------------------------------------------------------

  it('TC01: 単一有効検出を正しく変換して返す', () => {
    // Given: corner format (yMin=0.25, xMin=0.25, yMax=0.75, xMax=0.75) on 960x960
    const boxes = makeZeroBoxes(1)
    writeBox(boxes, 0, 0.25, 0.25, 0.75, 0.75)

    // When
    const results = postprocessDetections(boxes, 960, 960)

    // Then: x1=240, y1=240, x2=720, y2=720
    expect(results).toHaveLength(1)
    expect(results[0].x1).toBeCloseTo(240)
    expect(results[0].y1).toBeCloseTo(240)
    expect(results[0].x2).toBeCloseTo(720)
    expect(results[0].y2).toBeCloseTo(720)
  })

  it('TC02: 複数有効検出を全て返す', () => {
    // Given: 2行が有効
    const boxes = makeZeroBoxes(3)
    writeBox(boxes, 0, 0.1, 0.1, 0.5, 0.5)
    writeBox(boxes, 2, 0.3, 0.3, 0.7, 0.7)

    // When
    const results = postprocessDetections(boxes, 640, 480)

    // Then
    expect(results).toHaveLength(2)
  })

  it('TC03: 全スロットが 0 のとき空配列を返す', () => {
    // Given: 全行ゼロ
    const boxes = makeZeroBoxes(5)

    // When
    const results = postprocessDetections(boxes, 1280, 720)

    // Then
    expect(results).toHaveLength(0)
  })

  it('TC08: 有効な検出の score は常に 1.0', () => {
    // Given
    const boxes = makeZeroBoxes(1)
    writeBox(boxes, 0, 0.2, 0.2, 0.8, 0.8)

    // When
    const results = postprocessDetections(boxes, 640, 480)

    // Then
    expect(results[0].score).toBe(1.0)
  })

  // -----------------------------------------------------------------------
  // 境界値
  // -----------------------------------------------------------------------

  it('TC04: ボックスサイズが MIN_FACE_SIZE ちょうどのとき含まれる', () => {
    // Given: box幅 = MIN_FACE_SIZE px (= 5/640), box高 = MIN_FACE_SIZE px (= 5/480)
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes(1)
    const xMin = 0.5
    const yMin = 0.5
    const xMax = xMin + MIN_FACE_SIZE / W
    const yMax = yMin + MIN_FACE_SIZE / H
    writeBox(boxes, 0, yMin, xMin, yMax, xMax)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then: MIN_FACE_SIZE ちょうどは有効
    expect(results).toHaveLength(1)
  })

  it('TC05: ボックスサイズが MIN_FACE_SIZE 未満のとき除外される', () => {
    // Given: box幅 = (MIN_FACE_SIZE - 1) px
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes(1)
    const xMin = 0.5
    const yMin = 0.5
    const xMax = xMin + (MIN_FACE_SIZE - 1) / W
    const yMax = yMin + (MIN_FACE_SIZE - 1) / H
    writeBox(boxes, 0, yMin, xMin, yMax, xMax)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then
    expect(results).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // 座標変換
  // -----------------------------------------------------------------------

  it('TC06: corner format の座標変換の算術確認', () => {
    // Given: yMin=0.3, xMin=0.4, yMax=0.5, xMax=0.8 on 640x480
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes(1)
    writeBox(boxes, 0, 0.3, 0.4, 0.5, 0.8)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then: x1=0.4*640=256, y1=0.3*480=144, x2=0.8*640=512, y2=0.5*480=240
    expect(results[0].x1).toBeCloseTo(256)
    expect(results[0].y1).toBeCloseTo(144)
    expect(results[0].x2).toBeCloseTo(512)
    expect(results[0].y2).toBeCloseTo(240)
  })

  it('TC07: (0,0,1,1) のとき画像全体のボックスになる', () => {
    // Given
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes(1)
    writeBox(boxes, 0, 0.0, 0.0, 1.0, 1.0)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then: 全0行スキップされないように注意 — yMax,xMax が非ゼロなのでスキップされない
    expect(results).toHaveLength(1)
    expect(results[0].x1).toBeCloseTo(0)
    expect(results[0].y1).toBeCloseTo(0)
    expect(results[0].x2).toBeCloseTo(W)
    expect(results[0].y2).toBeCloseTo(H)
  })

  it('TC14: 0-128 座標入力でも適切なピクセル bbox へ変換される', () => {
    // Given: MODEL_INPUT_SIZE=128 基準の座標
    // x:[32,96], y:[16,112] on 640x480 => x:[160,480], y:[60,420]
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes(1)
    writeBox(boxes, 0, 16, 32, 112, 96)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then
    expect(results).toHaveLength(1)
    expect(results[0].x1).toBeCloseTo(160)
    expect(results[0].y1).toBeCloseTo(60)
    expect(results[0].x2).toBeCloseTo(480)
    expect(results[0].y2).toBeCloseTo(420)
  })

  // -----------------------------------------------------------------------
  // 動的サイズ
  // -----------------------------------------------------------------------

  it('TC09: 動的サイズ（N=2）の入力を正しく処理する', () => {
    // Given: 2件分のみの小さい配列
    const boxes = new Float32Array(2 * VALUES_PER_DETECTION)
    writeBox(boxes, 0, 0.1, 0.2, 0.4, 0.5)
    writeBox(boxes, 1, 0.5, 0.5, 0.9, 0.9)

    // When
    const results = postprocessDetections(boxes, 1000, 1000)

    // Then
    expect(results).toHaveLength(2)
    expect(results[0].x1).toBeCloseTo(200)
    expect(results[0].y1).toBeCloseTo(100)
    expect(results[1].x1).toBeCloseTo(500)
    expect(results[1].y1).toBeCloseTo(500)
  })

  // -----------------------------------------------------------------------
  // 異常系・エッジケース
  // -----------------------------------------------------------------------

  it('TC10: yMin/xMin のみ非ゼロで yMax/xMax が 0 → MIN_FACE_SIZE 未満で除外', () => {
    // Given: yMax=0, xMax=0 なので box size は負
    const boxes = makeZeroBoxes(1)
    const offset = 0
    boxes[offset] = 0.5     // yMin
    boxes[offset + 1] = 0.5 // xMin
    // yMax=0, xMax=0

    // When
    const results = postprocessDetections(boxes, 640, 480)

    // Then: 全4値が0ではないのでスキップされないが、サイズが負なので除外
    expect(results).toHaveLength(0)
  })

  it('TC11: 大きな画像サイズで正規化座標が正しくスケールされる', () => {
    // Given: 1000x1000 画像で小さい顔 (yMin=0.09, xMin=0.09, yMax=0.11, xMax=0.11)
    // → box size = 0.02 * 1000 = 20px >= MIN_FACE_SIZE
    const boxes = makeZeroBoxes(1)
    writeBox(boxes, 0, 0.09, 0.09, 0.11, 0.11)

    // When
    const results = postprocessDetections(boxes, 1000, 1000)

    // Then
    expect(results).toHaveLength(1)
    expect(results[0].x1).toBeCloseTo(90)
    expect(results[0].y1).toBeCloseTo(90)
    expect(results[0].x2).toBeCloseTo(110)
    expect(results[0].y2).toBeCloseTo(110)
  })

  it('TC12: 返り値の型が FaceBox 型に準拠している', () => {
    // Given
    const boxes = makeZeroBoxes(1)
    writeBox(boxes, 0, 0.2, 0.2, 0.8, 0.8)

    // When
    const results: FaceBox[] = postprocessDetections(boxes, 640, 480)

    // Then: 必須フィールドが存在する
    const box = results[0]
    expect(typeof box.x1).toBe('number')
    expect(typeof box.y1).toBe('number')
    expect(typeof box.x2).toBe('number')
    expect(typeof box.y2).toBe('number')
    expect(typeof box.score).toBe('number')
  })

  it('TC13: 空の Float32Array (0検出) は空配列を返す', () => {
    // Given
    const boxes = new Float32Array(0)

    // When
    const results = postprocessDetections(boxes, 640, 480)

    // Then
    expect(results).toHaveLength(0)
  })


  it('TC15: 複数小顔ケースで座標変換済み FaceBox[] の件数が維持される', () => {
    // Given: 全体縮小推論では 1 件だったとみなす
    const fullScaleFaces: FaceBox[] = [
      { x1: 10, y1: 10, x2: 20, y2: 20, score: 1.0 },
    ]

    // Given: タイル推論を合成した座標変換済みボックス（小顔3件）
    const tiledFaces: FaceBox[] = [
      { x1: 10, y1: 10, x2: 20, y2: 20, score: 1.0 },
      { x1: 30, y1: 12, x2: 40, y2: 22, score: 1.0 },
      { x1: 50, y1: 14, x2: 60, y2: 24, score: 1.0 },
    ]

    // When
    const fullResults = postprocessDetections(fullScaleFaces, 100, 100)
    const tiledResults = postprocessDetections(tiledFaces, 100, 100)

    // Then: タイル合成後の件数が増える
    expect(fullResults).toHaveLength(1)
    expect(tiledResults).toHaveLength(3)
    expect(tiledResults.length).toBeGreaterThan(fullResults.length)
  })

})
