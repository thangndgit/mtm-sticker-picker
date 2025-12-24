import {getNodeMajorVersion} from '@app/electron-versions';
import {spawn} from 'child_process';
import electronPath from 'electron';

export default /**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
({
  build: {
    ssr: true,
    sourcemap: 'inline',
    outDir: 'dist',
    assetsDir: '.',
    target: `node${getNodeMajorVersion()}`,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
      },
      external: [
        // electron-clipboard-ex is optional (only supports Windows/macOS)
        // Externalize để tránh lỗi build trên Linux
        'electron-clipboard-ex',
      ],
    },
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  plugins: [
    handleHotReload(),
  ],
});


/**
 * Implement Electron app reload when some file was changed
 * @return {import('vite').Plugin}
 */
function handleHotReload() {

  /** @type {ChildProcess} */
  let electronApp = null;

  /** @type {import('vite').ViteDevServer|null} */
  let rendererWatchServer = null;

  /** @type {boolean} */
  let cleanupHandlersRegistered = false;

  /**
   * Kill Electron process và đợi nó terminate hoàn toàn
   * @returns {Promise<void>}
   */
  async function killElectronProcess() {
    if (electronApp === null) {
      return;
    }

    const processToKill = electronApp;
    electronApp = null;

    // Remove exit listener để tránh trigger process.exit
    processToKill.removeAllListeners('exit');
    processToKill.removeAllListeners('error');

    return new Promise((resolve) => {
      // Kiểm tra xem process còn sống không
      if (processToKill.killed || processToKill.exitCode !== null) {
        resolve();
        return;
      }

      // Thử kill với SIGINT trước (graceful shutdown)
      processToKill.kill('SIGINT');

      // Đợi process terminate trong 2 giây
      const timeout = setTimeout(() => {
        // Nếu vẫn chưa terminate, force kill với SIGKILL
        if (!processToKill.killed && processToKill.exitCode === null) {
          console.warn('[HotReload] Electron process did not terminate, force killing...');
          try {
            processToKill.kill('SIGKILL');
          } catch (e) {
            // Ignore errors
          }
        }
        resolve();
      }, 2000);

      // Nếu process terminate trước timeout, clear timeout và resolve
      processToKill.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      processToKill.once('error', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * Cleanup handler khi dev script terminate
   */
  function cleanup() {
    if (electronApp !== null) {
      killElectronProcess().catch(() => {
        // Ignore errors during cleanup
      });
    }
  }

  /**
   * Register cleanup handlers (chỉ một lần)
   */
  function registerCleanupHandlers() {
    if (cleanupHandlersRegistered) {
      return;
    }
    cleanupHandlersRegistered = true;
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }

  return {
    name: '@app/main-process-hot-reload',

    config(config, env) {
      if (env.mode !== 'development') {
        return;
      }

      const rendererWatchServerProvider = config.plugins.find(p => p.name === '@app/renderer-watch-server-provider');
      if (!rendererWatchServerProvider) {
        throw new Error('Renderer watch server provider not found');
      }

      rendererWatchServer = rendererWatchServerProvider.api.provideRendererWatchServer();

      process.env.VITE_DEV_SERVER_URL = rendererWatchServer.resolvedUrls.local[0];

      return {
        build: {
          watch: {},
        },
      };
    },

    async writeBundle() {
      if (process.env.NODE_ENV !== 'development') {
        return;
      }

      // Register cleanup handlers (chỉ một lần)
      registerCleanupHandlers();

      // Kill electron process và đợi nó terminate hoàn toàn
      await killElectronProcess();

      // Spawn a new electron process
      electronApp = spawn(String(electronPath), ['--inspect', '.'], {
        stdio: 'inherit',
      });

      // Stops the watch script when the application has been quit
      electronApp.addListener('exit', (code) => {
        electronApp = null;
        // Chỉ exit nếu code không phải 0 (error) hoặc nếu user quit app
        if (code !== 0) {
          process.exit(code);
        }
      });

      electronApp.addListener('error', (error) => {
        console.error('[HotReload] Electron process error:', error);
        electronApp = null;
      });
    },
  };
}
