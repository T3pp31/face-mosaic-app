import { ImageFaceMosaic } from '@/components/ImageFaceMosaic'
import './App.css'

const GITHUB_URL = 'https://github.com/nopeNoshishi/face-mosaic-app'

function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Face Mosaic</h1>
        <p className="app__description">
          画像をアップロードすると、検出された顔にモザイクをかけます。
          すべての処理はブラウザ内で完結し、画像はサーバーに送信されません。
        </p>
      </header>

      <main className="app__main">
        <ImageFaceMosaic />
      </main>

      <footer className="app__footer">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="app__github-link"
        >
          GitHub
        </a>
      </footer>
    </div>
  )
}

export default App
