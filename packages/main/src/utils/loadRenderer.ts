import type { BrowserWindow } from "electron";
import { app } from "electron";
import type { AppInitConfig } from "../AppInitConfig.js";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

/**
 * Resolve fallback path cho renderer khi dev server không sẵn sàng.
 * Tìm file index.html trong dist folder của renderer.
 */
function getFallbackRendererPath(): string {
  try {
    // Thử resolve từ import.meta.resolve (như entry-point.mjs)
    // @ts-expect-error - import.meta.resolve is available in Node.js ESM
    return fileURLToPath(import.meta.resolve("@app/renderer"));
  } catch (error) {
    // Nếu resolve fail, tìm từ app path
    const appPath = app.getAppPath();
    if (import.meta.env.DEV) {
      // Development: Tìm từ dist/utils/ lên packages/renderer/dist/index.html
      const currentDir = dirname(fileURLToPath(import.meta.url));
      // dist/utils -> dist -> packages -> renderer -> dist -> index.html
      return join(currentDir, "..", "..", "renderer", "dist", "index.html");
    } else {
      // Production: Tìm trong app path
      return join(appPath, "packages", "renderer", "dist", "index.html");
    }
  }
}

/**
 * Load renderer vào BrowserWindow với fallback mechanism.
 * - Nếu renderer là URL (dev mode): Thử loadURL, nếu fail thì fallback về loadFile
 * - Nếu renderer là path: LoadFile trực tiếp
 *
 * @param window - BrowserWindow cần load renderer
 * @param renderer - Renderer config (URL hoặc path)
 * @param hash - Optional hash để append vào URL (ví dụ: "#picker")
 */
export function loadRenderer(
  window: BrowserWindow,
  renderer: AppInitConfig["renderer"],
  hash?: string,
): void {
  if (renderer instanceof URL) {
    // Dev mode: Thử load URL, nếu fail thì fallback về file
    const url = hash ? `${renderer.href}${hash}` : renderer.href;

    // Thêm listener để handle did-fail-load event (khi dev server chưa sẵn sàng)
    const handleDidFailLoad = (
      event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean,
    ) => {
      // Chỉ xử lý lỗi của main frame
      if (!isMainFrame) {
        return;
      }

      // Chỉ xử lý lỗi connection refused hoặc các lỗi network khác
      if (
        errorCode === -106 || // ERR_INTERNET_DISCONNECTED
        errorCode === -105 || // ERR_NAME_NOT_RESOLVED
        errorCode === -102 || // ERR_CONNECTION_REFUSED
        errorCode === -118 // ERR_CONNECTION_TIMED_OUT
      ) {
        console.warn(
          `[loadRenderer] Connection error (${errorCode}) loading ${validatedURL}, falling back to file`,
        );
        // Remove listener để tránh loop
        window.webContents.removeListener("did-fail-load", handleDidFailLoad);

        // Fallback: Load từ file đã build
        const fallbackPath = getFallbackRendererPath();
        if (hash) {
          window.loadFile(fallbackPath, { hash });
        } else {
          window.loadFile(fallbackPath);
        }
      }
    };

    window.webContents.once("did-fail-load", handleDidFailLoad);

    // Thử load URL
    window.loadURL(url).catch((error) => {
      console.warn(
        `[loadRenderer] Failed to load URL ${url}, falling back to file:`,
        error,
      );
      // Fallback: Load từ file đã build
      const fallbackPath = getFallbackRendererPath();
      if (hash) {
        window.loadFile(fallbackPath, { hash });
      } else {
        window.loadFile(fallbackPath);
      }
    });
  } else {
    // Production mode hoặc path: Load file trực tiếp
    if (hash) {
      window.loadFile(renderer.path, { hash });
    } else {
      window.loadFile(renderer.path);
    }
  }
}

