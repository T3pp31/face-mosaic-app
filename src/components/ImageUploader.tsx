import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'

export type ImageUploaderProps = {
  onFileSelect: (file: File) => void
  disabled?: boolean
}

/**
 * ドラッグ&ドロップおよびクリックによる画像ファイル選択コンポーネント
 */
export function ImageUploader({ onFileSelect, disabled = false }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (!disabled) {
      setIsDragging(true)
    }
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)

    if (disabled) return

    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      onFileSelect(file)
    }
  }

  function handleClick() {
    if (!disabled && inputRef.current) {
      inputRef.current.click()
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
    // 同じファイルを再選択できるようにリセット
    e.target.value = ''
  }

  const dropZoneClass = [
    'drop-zone',
    isDragging ? 'drop-zone--dragging' : '',
    disabled ? 'drop-zone--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={dropZoneClass}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleChange}
        disabled={disabled}
        aria-hidden="true"
      />
      <div className="drop-zone__content">
        <span className="drop-zone__icon" aria-hidden="true">
          &#128444;
        </span>
        <p className="drop-zone__text">
          画像をドラッグ&ドロップ
          <br />
          またはクリックして選択
        </p>
        <p className="drop-zone__hint">JPEG, PNG, WebP などの画像ファイル</p>
      </div>
    </div>
  )
}
