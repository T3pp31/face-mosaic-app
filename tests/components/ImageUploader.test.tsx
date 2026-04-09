/**
 * ImageUploader コンポーネント テスト
 *
 * テスト観点表（等価分割・境界値）
 *
 * | # | 区分       | 入力                                        | 期待する結果                                  |
 * |---|------------|---------------------------------------------|-----------------------------------------------|
 * | 1 | 正常系     | 画像ファイルをドロップ                      | onFileSelect が呼ばれる                       |
 * | 2 | 正常系     | ファイル選択ダイアログから選択              | onFileSelect が呼ばれる                       |
 * | 3 | 正常系     | ドラッグオーバー中                          | dragging クラスが付与される                   |
 * | 4 | 正常系     | ドラッグリーブ                              | dragging クラスが除去される                   |
 * | 5 | 正常系     | Enter キーで開く                            | ファイル選択が開ける                          |
 * | 6 | 正常系     | Space キーで開く                            | ファイル選択が開ける                          |
 * | 7 | 異常系     | 非画像ファイルをドロップ                    | onFileSelect が呼ばれない                    |
 * | 8 | 異常系     | disabled 状態でクリック                     | onFileSelect が呼ばれない                    |
 * | 9 | 異常系     | disabled 状態でドロップ                     | onFileSelect が呼ばれない                    |
 * |10 | 境界値     | disabled=true の場合の表示                  | disabled クラスが付与される                  |
 * |11 | 境界値     | ファイルなしの change イベント              | onFileSelect が呼ばれない                    |
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageUploader } from '@/components/ImageUploader'

// -----------------------------------------------------------------------
// ヘルパー
// -----------------------------------------------------------------------

function createImageFile(name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File(['dummy'], name, { type })
}

function createNonImageFile(name = 'doc.pdf', type = 'application/pdf'): File {
  return new File(['dummy'], name, { type })
}

function createDragEvent(files: File[]): Partial<DragEvent> {
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      files: files as unknown as FileList,
      clearData: vi.fn(),
      getData: vi.fn(),
      setData: vi.fn(),
      setDragImage: vi.fn(),
      effectAllowed: 'all',
      dropEffect: 'none',
      items: [] as unknown as DataTransferItemList,
      types: [],
    } as unknown as DataTransfer,
  }
}

// -----------------------------------------------------------------------
// テスト
// -----------------------------------------------------------------------

describe('ImageUploader', () => {
  // =====================================================================
  // 正常系
  // =====================================================================

  describe('正常系', () => {
    it('TC-01: 画像ファイルをドロップすると onFileSelect が呼ばれる', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} />)
      const dropZone = screen.getByRole('button')
      const file = createImageFile()

      // When
      fireEvent.drop(dropZone, createDragEvent([file]))

      // Then
      expect(onFileSelect).toHaveBeenCalledTimes(1)
      expect(onFileSelect).toHaveBeenCalledWith(file)
    })

    it('TC-02: ファイル選択ダイアログで画像を選ぶと onFileSelect が呼ばれる', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = createImageFile()

      // When
      Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true,
      })
      fireEvent.change(input)

      // Then
      expect(onFileSelect).toHaveBeenCalledTimes(1)
      expect(onFileSelect).toHaveBeenCalledWith(file)
    })

    it('TC-03: ドラッグオーバー中に dragging クラスが付与される', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} />)
      const dropZone = screen.getByRole('button')

      // When
      fireEvent.dragOver(dropZone, { preventDefault: vi.fn() })

      // Then
      expect(dropZone.className).toContain('drop-zone--dragging')
    })

    it('TC-04: ドラッグリーブで dragging クラスが除去される', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} />)
      const dropZone = screen.getByRole('button')

      // When: ドラッグオーバー → ドラッグリーブ
      fireEvent.dragOver(dropZone, { preventDefault: vi.fn() })
      fireEvent.dragLeave(dropZone, { preventDefault: vi.fn() })

      // Then
      expect(dropZone.className).not.toContain('drop-zone--dragging')
    })

    it('TC-05: Enter キーでファイル選択が開始される（input.click が呼ばれる）', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} />)
      const dropZone = screen.getByRole('button')
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})

      // When
      fireEvent.keyDown(dropZone, { key: 'Enter' })

      // Then
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('TC-06: Space キーでファイル選択が開始される（input.click が呼ばれる）', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} />)
      const dropZone = screen.getByRole('button')
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})

      // When
      fireEvent.keyDown(dropZone, { key: ' ' })

      // Then
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })
  })

  // =====================================================================
  // 異常系
  // =====================================================================

  describe('異常系', () => {
    it('TC-07: 非画像ファイルをドロップしても onFileSelect が呼ばれない', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} />)
      const dropZone = screen.getByRole('button')
      const file = createNonImageFile()

      // When
      fireEvent.drop(dropZone, createDragEvent([file]))

      // Then
      expect(onFileSelect).not.toHaveBeenCalled()
    })

    it('TC-08: disabled 状態でクリックしても input.click が呼ばれない', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} disabled={true} />)
      const dropZone = screen.getByRole('button')
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})

      // When
      fireEvent.click(dropZone)

      // Then
      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('TC-09: disabled 状態でドロップしても onFileSelect が呼ばれない', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} disabled={true} />)
      const dropZone = screen.getByRole('button')
      const file = createImageFile()

      // When
      fireEvent.drop(dropZone, createDragEvent([file]))

      // Then
      expect(onFileSelect).not.toHaveBeenCalled()
    })
  })

  // =====================================================================
  // 境界値
  // =====================================================================

  describe('境界値', () => {
    it('TC-10: disabled=true のとき drop-zone--disabled クラスが付与される', () => {
      // Given / When
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} disabled={true} />)
      const dropZone = screen.getByRole('button')

      // Then
      expect(dropZone.className).toContain('drop-zone--disabled')
    })

    it('TC-10b: disabled=false のとき drop-zone--disabled クラスが付与されない', () => {
      // Given / When
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} disabled={false} />)
      const dropZone = screen.getByRole('button')

      // Then
      expect(dropZone.className).not.toContain('drop-zone--disabled')
    })

    it('TC-11: change イベントで files が空の場合 onFileSelect が呼ばれない', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      // When: files が undefined (空)
      Object.defineProperty(input, 'files', {
        value: null,
        configurable: true,
      })
      fireEvent.change(input)

      // Then
      expect(onFileSelect).not.toHaveBeenCalled()
    })

    it('TC-12: disabled 状態でも dragging クラスが付与されない', () => {
      // Given
      const onFileSelect = vi.fn()
      render(<ImageUploader onFileSelect={onFileSelect} disabled={true} />)
      const dropZone = screen.getByRole('button')

      // When
      fireEvent.dragOver(dropZone, { preventDefault: vi.fn() })

      // Then
      expect(dropZone.className).not.toContain('drop-zone--dragging')
    })
  })
})
