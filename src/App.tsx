import { useAudioRef } from './hooks/useAudioRef';
import { FileUpload } from './components/FileUpload';
import { useAppStore } from './store/useAppStore';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function App() {
  const audioStateRef = useAudioRef();
  const { isFileLoaded, fileName, duration } = useAppStore();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8"
      style={{ backgroundColor: '#0a0a0f' }}
    >
      <h1 className="text-4xl font-bold text-white tracking-wide text-center px-4">
        Jazz Communication Visualizer
      </h1>

      {!isFileLoaded ? (
        <FileUpload audioStateRef={audioStateRef} />
      ) : (
        <div className="flex flex-col items-center gap-4">
          {/* File info card */}
          <div
            className="px-6 py-4 rounded-lg text-center"
            style={{ backgroundColor: '#13131f', border: '1px solid rgba(99,102,241,0.3)' }}
          >
            <p className="text-white font-medium text-lg truncate max-w-xs" title={fileName ?? ''}>
              {fileName}
            </p>
            <p className="text-sm mt-1" style={{ color: '#a78bfa' }}>
              {formatDuration(duration)}
            </p>
          </div>

          {/* Load a different file */}
          <FileUpload audioStateRef={audioStateRef} />
        </div>
      )}
    </div>
  );
}

export default App;
