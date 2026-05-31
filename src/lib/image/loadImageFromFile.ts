/**
 * File から HTMLImageElement を生成する。
 * EXIF 回転情報は createImageBitmap が利用可能な場合に反映する。
 */
export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await loadImageWithExifCorrection(file)
    } catch {
      // createImageBitmap 非対応形式などは従来方式へフォールバック
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    return await loadImageFromUrl(objectUrl)
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

async function loadImageWithExifCorrection(file: File): Promise<HTMLImageElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height

    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      throw new Error('Failed to get 2D context from canvas')
    }

    ctx.drawImage(bitmap, 0, 0)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result === null) {
          reject(new Error('Failed to encode image'))
          return
        }
        resolve(result)
      }, 'image/png')
    })

    const objectUrl = URL.createObjectURL(blob)
    try {
      return await loadImageFromUrl(objectUrl)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } finally {
    bitmap.close()
  }
}

function loadImageFromUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    img.src = src
  })
}
