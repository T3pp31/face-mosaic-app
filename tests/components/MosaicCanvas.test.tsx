/**
 * MosaicCanvas コンポーネント テスト
 *
 * テスト観点表（等価分割・境界値）
 *
 * | # | 区分   | 入力                         | 期待する結果                          |
 * |---|--------|------------------------------|---------------------------------------|
 * | 1 | 正常系 | hasResult=true               | canvas が表示される（display: block） |
 * | 2 | 正常系 | hasResult=false              | canvas が非表示（display: none）      |
 * | 3 | 正常系 | canvasRef に ref が渡される  | canvas 要素が ref に設定される        |
 * | 4 | 境界値 | hasResult が true→false 切替 | 表示状態が正しく変化する              |
 */

import { describe, it, expect, useRef } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { MosaicCanvas } from '@/components/MosaicCanvas'

describe('MosaicCanvas', () => {
  // =====================================================================
  // 正常系
  // =====================================================================

  describe('正常系', () => {
    it('TC-01: hasResult=true のとき wrapper が display: block になる', () => {
      // Given / When
      const canvasRef = createRef<HTMLCanvasElement | null>()
      const { container } = render(
        <MosaicCanvas canvasRef={canvasRef} hasResult={true} />,
      )
      const wrapper = container.firstChild as HTMLElement

      // Then
      expect(wrapper.style.display).toBe('block')
    })

    it('TC-02: hasResult=false のとき wrapper が display: none になる', () => {
      // Given / When
      const canvasRef = createRef<HTMLCanvasElement | null>()
      const { container } = render(
        <MosaicCanvas canvasRef={canvasRef} hasResult={false} />,
      )
      const wrapper = container.firstChild as HTMLElement

      // Then
      expect(wrapper.style.display).toBe('none')
    })

    it('TC-03: canvasRef が canvas 要素を参照している', () => {
      // Given
      const canvasRef = createRef<HTMLCanvasElement | null>()

      // When
      render(<MosaicCanvas canvasRef={canvasRef} hasResult={true} />)

      // Then
      expect(canvasRef.current).toBeInstanceOf(HTMLCanvasElement)
    })

    it('TC-04: canvas 要素に aria-label が設定されている', () => {
      // Given / When
      const canvasRef = createRef<HTMLCanvasElement | null>()
      render(<MosaicCanvas canvasRef={canvasRef} hasResult={true} />)

      // Then
      const canvas = canvasRef.current
      expect(canvas?.getAttribute('aria-label')).toBe('モザイク処理済み画像')
    })
  })

  // =====================================================================
  // 境界値
  // =====================================================================

  describe('境界値', () => {
    it('TC-05: hasResult が true→false に変化したとき表示が非表示になる', () => {
      // Given
      const canvasRef = createRef<HTMLCanvasElement | null>()
      const { container, rerender } = render(
        <MosaicCanvas canvasRef={canvasRef} hasResult={true} />,
      )
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.style.display).toBe('block')

      // When
      rerender(<MosaicCanvas canvasRef={canvasRef} hasResult={false} />)

      // Then
      expect(wrapper.style.display).toBe('none')
    })

    it('TC-06: hasResult が false→true に変化したとき表示になる', () => {
      // Given
      const canvasRef = createRef<HTMLCanvasElement | null>()
      const { container, rerender } = render(
        <MosaicCanvas canvasRef={canvasRef} hasResult={false} />,
      )
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.style.display).toBe('none')

      // When
      rerender(<MosaicCanvas canvasRef={canvasRef} hasResult={true} />)

      // Then
      expect(wrapper.style.display).toBe('block')
    })
  })
})
