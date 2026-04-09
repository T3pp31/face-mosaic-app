import { describe, it, expect } from 'vitest'
import { postprocessDetections, type FaceBox } from '@/lib/onnx/postprocess'
import {
  VALUES_PER_DETECTION,
  MIN_FACE_SIZE,
} from '@/config/constants'

const BLAZEFACE_ANCHOR_COUNT = 896

// ---------------------------------------------------------------------------
// テスト観点表（等価分割・境界値）
// ---------------------------------------------------------------------------
// | # | 観点                              | 入力条件                              | 期待結果                        |
// |---|-----------------------------------|---------------------------------------|---------------------------------|
// | 1 | 正常系: 単一有効検出              | 1 行だけ非ゼロ、残りは全0             | FaceBox 1 件                    |
// | 2 | 正常系: 複数有効検出              | 複数行が非ゼロ                        | FaceBox 複数件                  |
// | 3 | 正常系: 全スロット 0              | 896 行全て 0                          | 空配列                          |
// | 4 | 境界値: MIN_FACE_SIZE ちょうど    | w = h = MIN_FACE_SIZE/originalW       | 1 件（境界値は有効）            |
// | 5 | 境界値: MIN_FACE_SIZE 未満        | w = h < MIN_FACE_SIZE                 | 0 件（フィルタ除外）            |
// | 6 | 境界値: MIN_FACE_SIZE - 1         | w = (MIN_FACE_SIZE-1)/W など          | 0 件                            |
// | 7 | 座標変換: 正規化→ピクセル         | xCenter=0.5, yCenter=0.5, w=h=0.5    | x1=0,y1=0,x2=W,y2=H            |
// | 8 | 座標変換: 画像端のボックス        | xCenter=0, yCenter=0, w=h=0.5        | x1<0 (クリップしない)           |
// | 9 | score: 常に 1.0                   | 有効な検出                            | score===1.0                     |
// |10 | 全行非ゼロ                        | 896 行全て有効                        | 最大 896 件                     |
// ---------------------------------------------------------------------------

/**
 * BLAZEFACE_ANCHOR_COUNT × VALUES_PER_DETECTION の全ゼロ Float32Array を生成
 */
function makeZeroBoxes(): Float32Array {
  return new Float32Array(BLAZEFACE_ANCHOR_COUNT * VALUES_PER_DETECTION)
}

/**
 * row 番目のスロットに [yCenter, xCenter, h, w, ...zeros] を書き込む
 */
function writeBox(
  arr: Float32Array,
  row: number,
  yCenter: number,
  xCenter: number,
  h: number,
  w: number,
): void {
  const offset = row * VALUES_PER_DETECTION
  arr[offset] = yCenter
  arr[offset + 1] = xCenter
  arr[offset + 2] = h
  arr[offset + 3] = w
}

describe('postprocessDetections', () => {
  // -----------------------------------------------------------------------
  // 正常系
  // -----------------------------------------------------------------------

  it('TC01: 単一有効検出を正しく変換して返す', () => {
    // Given: 1 行だけ有効な検出がある selectedBoxes (960×960 px 画像)
    const boxes = makeZeroBoxes()
    const originalWidth = 960
    const originalHeight = 960
    // 正規化座標: center=(0.5, 0.5), size=(0.5, 0.5) → ピクセル: (240,240)-(720,720)
    writeBox(boxes, 0, 0.5, 0.5, 0.5, 0.5)

    // When
    const results = postprocessDetections(boxes, originalWidth, originalHeight)

    // Then
    expect(results).toHaveLength(1)
    expect(results[0].x1).toBeCloseTo(240)
    expect(results[0].y1).toBeCloseTo(240)
    expect(results[0].x2).toBeCloseTo(720)
    expect(results[0].y2).toBeCloseTo(720)
  })

  it('TC02: 複数有効検出を全て返す', () => {
    // Given: 行 0 と 行 2 が有効
    const boxes = makeZeroBoxes()
    const W = 640
    const H = 480
    writeBox(boxes, 0, 0.5, 0.5, 0.5, 0.5)
    writeBox(boxes, 2, 0.3, 0.3, 0.4, 0.4)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then
    expect(results).toHaveLength(2)
  })

  it('TC03: 全スロットが 0 のとき空配列を返す', () => {
    // Given: 全行ゼロ
    const boxes = makeZeroBoxes()

    // When
    const results = postprocessDetections(boxes, 1280, 720)

    // Then
    expect(results).toHaveLength(0)
  })

  it('TC09: 有効な検出の score は常に 1.0', () => {
    // Given
    const boxes = makeZeroBoxes()
    writeBox(boxes, 0, 0.5, 0.5, 0.5, 0.5)

    // When
    const results = postprocessDetections(boxes, 640, 480)

    // Then
    expect(results[0].score).toBe(1.0)
  })

  it('TC10: 896 行全て有効な検出を全件返す', () => {
    // Given: 全行に同じ有効な検出
    const boxes = makeZeroBoxes()
    const W = 640
    const H = 480
    for (let i = 0; i < BLAZEFACE_ANCHOR_COUNT; i++) {
      writeBox(boxes, i, 0.5, 0.5, 0.5, 0.5)
    }

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then
    expect(results).toHaveLength(BLAZEFACE_ANCHOR_COUNT)
  })

  // -----------------------------------------------------------------------
  // 境界値
  // -----------------------------------------------------------------------

  it('TC04: ボックスサイズが MIN_FACE_SIZE ちょうどのとき含まれる', () => {
    // Given: width = MIN_FACE_SIZE px となる正規化サイズ
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes()
    const normalizedW = MIN_FACE_SIZE / W
    const normalizedH = MIN_FACE_SIZE / H
    writeBox(boxes, 0, 0.5, 0.5, normalizedH, normalizedW)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then: MIN_FACE_SIZE ちょうどは有効（< ではなく >= が条件）
    expect(results).toHaveLength(1)
  })

  it('TC05: ボックスサイズが MIN_FACE_SIZE 未満のとき除外される', () => {
    // Given: width = (MIN_FACE_SIZE - 1) px の正規化サイズ
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes()
    const normalizedW = (MIN_FACE_SIZE - 1) / W
    const normalizedH = (MIN_FACE_SIZE - 1) / H
    writeBox(boxes, 0, 0.5, 0.5, normalizedH, normalizedW)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then
    expect(results).toHaveLength(0)
  })

  it('TC06: ボックスサイズが MIN_FACE_SIZE - 1 のとき除外される（境界値 -1）', () => {
    // Given
    const W = 1280
    const H = 960
    const boxes = makeZeroBoxes()
    const tooSmall = (MIN_FACE_SIZE - 1) / Math.min(W, H)
    writeBox(boxes, 5, 0.5, 0.5, tooSmall, tooSmall)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then
    expect(results).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // 座標変換
  // -----------------------------------------------------------------------

  it('TC07: 中心(0.5,0.5) サイズ(1.0,1.0) のとき画像全体のボックスになる', () => {
    // Given
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes()
    writeBox(boxes, 0, 0.5, 0.5, 1.0, 1.0)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then: x1=0, y1=0, x2=W, y2=H
    expect(results[0].x1).toBeCloseTo(0)
    expect(results[0].y1).toBeCloseTo(0)
    expect(results[0].x2).toBeCloseTo(W)
    expect(results[0].y2).toBeCloseTo(H)
  })

  it('TC08: 中心が端にあるボックスは負座標を持ちうる（クリップしない）', () => {
    // Given: xCenter=0.0, yCenter=0.0, size=0.5
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes()
    // サイズを MIN_FACE_SIZE より大きくするため 0.5 にする
    writeBox(boxes, 0, 0.0, 0.0, 0.5, 0.5)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then: 左上ははみ出るので負値になる
    expect(results[0].x1).toBeLessThan(0)
    expect(results[0].y1).toBeLessThan(0)
  })

  it('TC07b: 座標変換の算術確認 (y_center, x_center, h, w → x1,y1,x2,y2)', () => {
    // Given: y_center=0.4, x_center=0.6, h=0.2, w=0.4 で 640x480 画像
    const W = 640
    const H = 480
    const boxes = makeZeroBoxes()
    writeBox(boxes, 0, 0.4, 0.6, 0.2, 0.4)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then
    // x1 = (0.6 - 0.4/2) * 640 = 0.4 * 640 = 256
    // y1 = (0.4 - 0.2/2) * 480 = 0.3 * 480 = 144
    // x2 = (0.6 + 0.4/2) * 640 = 0.8 * 640 = 512
    // y2 = (0.4 + 0.2/2) * 480 = 0.5 * 480 = 240
    expect(results[0].x1).toBeCloseTo(256)
    expect(results[0].y1).toBeCloseTo(144)
    expect(results[0].x2).toBeCloseTo(512)
    expect(results[0].y2).toBeCloseTo(240)
  })

  // -----------------------------------------------------------------------
  // 異常系・エッジケース
  // -----------------------------------------------------------------------

  it('TC11: 大きな画像サイズで正規化座標が正しくスケールされる', () => {
    // Given: 1000x1000 px 画像で center=(0.1, 0.1), size=(0.02, 0.02)
    // → ピクセル: box width = 0.02 * 1000 = 20 >= MIN_FACE_SIZE(5) なので有効
    const boxes = makeZeroBoxes()
    const W = 1000
    const H = 1000
    writeBox(boxes, 0, 0.1, 0.1, 0.02, 0.02)

    // When
    const results = postprocessDetections(boxes, W, H)

    // Then: ピクセル値 = 正規化値 × W/H
    // x1 = (0.1 - 0.02/2) * 1000 = 0.09 * 1000 = 90
    // y1 = (0.1 - 0.02/2) * 1000 = 90
    // x2 = (0.1 + 0.02/2) * 1000 = 0.11 * 1000 = 110
    // y2 = 110
    expect(results).toHaveLength(1)
    expect(results[0].x1).toBeCloseTo(90)
    expect(results[0].y1).toBeCloseTo(90)
    expect(results[0].x2).toBeCloseTo(110)
    expect(results[0].y2).toBeCloseTo(110)
  })

  it('TC12: yCenter と xCenter のみ非ゼロで h/w が 0 → スキップ', () => {
    // Given: h=0, w=0 のためゼロ判定でスキップされる
    const boxes = makeZeroBoxes()
    const offset = 0 * VALUES_PER_DETECTION
    boxes[offset] = 0.5 // yCenter
    boxes[offset + 1] = 0.5 // xCenter
    // h=0, w=0

    // When
    const results = postprocessDetections(boxes, 640, 480)

    // Then: h=0 w=0 は全て 0 条件を満たすためスキップ
    expect(results).toHaveLength(0)
  })

  it('TC13: 返り値の型が FaceBox 型に準拠している', () => {
    // Given
    const boxes = makeZeroBoxes()
    writeBox(boxes, 0, 0.5, 0.5, 0.5, 0.5)

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
})
