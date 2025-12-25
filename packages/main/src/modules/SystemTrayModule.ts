import type { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { Tray, Menu, nativeImage, app, BrowserWindow } from "electron";
import { ApplicationTerminatorOnLastWindowClose } from "./ApplicationTerminatorOnLastWindowClose.js";
import type { AppInitConfig } from "../AppInitConfig.js";
import { getAppIconPath } from "../utils/getAppIconPath.js";
import { loadRenderer } from "../utils/loadRenderer.js";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

/**
 * Module quản lý System Tray và Menu.
 * Tạo Tray icon với menu chuột phải (Settings, About, Quit).
 * Double-click vào Tray icon sẽ mở cửa sổ Settings.
 */
class SystemTrayModule implements AppModule {
  readonly #preload: { path: string };
  readonly #renderer: { path: string } | URL;
  #tray: Tray | null = null;
  #settingsWindow: BrowserWindow | null = null;

  constructor({ initConfig }: { initConfig: AppInitConfig }) {
    this.#preload = initConfig.preload;
    this.#renderer = initConfig.renderer;
  }

  async enable({ app }: ModuleContext): Promise<void> {
    // Đặt tên app
    app.setName("Matitmui Sticker Picker");
    await app.whenReady();

    // Lấy đường dẫn đến icon
    const iconPath = this.#getTrayIconPath();
    let icon = nativeImage.createFromPath(iconPath);

    // Resize icon để phù hợp với system tray
    // macOS: 22x22 (Retina: 44x44), Windows/Linux: 16x16
    const traySize = process.platform === "darwin" ? 22 : 16;
    if (icon.getSize().width !== traySize) {
      icon = icon.resize({ width: traySize, height: traySize });
    }

    // Tạo Tray icon
    this.#tray = new Tray(icon);

    // Đặt tooltip
    this.#tray.setToolTip("Sticker Picker");

    // Tạo menu chuột phải
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Settings",
        click: () => this.openSettingsWindow(),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          // Gán isQuitting = true
          ApplicationTerminatorOnLastWindowClose.isQuitting = true;

          // Đóng tất cả windows trước khi quit
          // Điều này đảm bảo window-all-closed event được trigger
          const allWindows = BrowserWindow.getAllWindows();
          allWindows.forEach((window) => {
            if (!window.isDestroyed()) {
              // Remove preventDefault handlers nếu có
              window.removeAllListeners("close");
              window.destroy();
            }
          });

          // Đảm bảo Settings window được destroy
          if (this.#settingsWindow && !this.#settingsWindow.isDestroyed()) {
            this.#settingsWindow.removeAllListeners("close");
            this.#settingsWindow.destroy();
            this.#settingsWindow = null;
          }

          // Sau đó quit app
          app.quit();

          // Force quit sau 2 giây nếu app vẫn chưa quit (fallback)
          setTimeout(() => {
            // Kiểm tra xem process còn chạy không
            try {
              process.exit(0);
            } catch (e) {
              // Ignore errors
            }
          }, 2000);
        },
      },
    ]);

    this.#tray.setContextMenu(contextMenu);

    // Double-click vào Tray icon: Mở cửa sổ Settings
    this.#tray.on("double-click", () => {
      this.openSettingsWindow();
    });

    // Xử lý khi app đang quit: Destroy tray
    app.on("before-quit", () => {
      if (this.#tray) {
        this.#tray.destroy();
        this.#tray = null;
      }
    });

    // Trong dev mode: Tự động mở Settings window để dễ debug
    if (import.meta.env.DEV) {
      app.once("ready", () => {
        // Đợi một chút để đảm bảo tất cả modules đã được init
        setTimeout(() => {
          this.openSettingsWindow();
        }, 500);
      });
    }
  }

  /**
   * Mở cửa sổ Settings.
   * Nếu cửa sổ Settings đã có thì hiện lên (show/focus),
   * nếu chưa có thì tạo mới.
   */
  openSettingsWindow(): void {
    if (this.#settingsWindow && !this.#settingsWindow.isDestroyed()) {
      // Cửa sổ đã tồn tại: hiện lên và focus
      if (this.#settingsWindow.isMinimized()) {
        this.#settingsWindow.restore();
      }
      this.#settingsWindow.show();
      this.#settingsWindow.focus();
      return;
    }

    // Tạo cửa sổ Settings mới
    this.#settingsWindow = new BrowserWindow({
      width: 600,
      height: 800,
      show: false,
      resizable: false, // Không cho phép resize
      autoHideMenuBar: true, // Ẩn menu bar (File, Edit, View, Window, Help)
      icon: getAppIconPath(), // Set icon cho window
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webviewTag: false,
        preload: this.#preload.path,
      },
    });

    // Load renderer với fallback mechanism
    loadRenderer(this.#settingsWindow, this.#renderer);

    // Xử lý nút đóng (X): Ẩn thay vì destroy (trừ khi app đang quit)
    this.#settingsWindow.on("close", (event) => {
      // Nếu app đang quit, cho phép đóng cửa sổ bình thường
      if (ApplicationTerminatorOnLastWindowClose.isQuitting) {
        // Không preventDefault - cho phép window đóng và destroy
        return;
      }
      // Ngăn chặn đóng cửa sổ (chỉ ẩn)
      event.preventDefault();
      // Ẩn cửa sổ thay vì destroy
      this.#settingsWindow?.hide();
    });

    // Hiển thị cửa sổ khi ready
    this.#settingsWindow.once("ready-to-show", () => {
      this.#settingsWindow?.show();
      this.#settingsWindow?.focus();
    });

    // Cleanup khi cửa sổ bị destroy
    this.#settingsWindow.on("closed", () => {
      this.#settingsWindow = null;
    });
  }

  /**
   * Lấy đường dẫn đến Tray icon.
   * Sử dụng icon nhỏ (16x16 hoặc 32x32) từ folder icons để phù hợp với system tray.
   */
  #getTrayIconPath(): string {
    const appPath = app.getAppPath();

    let iconPath: string;

    if (import.meta.env.DEV) {
      // Development: Tìm từ thư mục hiện tại (dist) lên root
      const appDir = dirname(fileURLToPath(import.meta.url));
      // Từ dist/modules/ lên root: dist/modules -> dist -> packages -> root
      const iconsPath = join(appDir, "..", "..", "..", "icons");

      // Sử dụng favicon-32x32.png hoặc favicon-16x16.png cho tray icon
      if (process.platform === "win32") {
        iconPath = join(iconsPath, "favicon.ico");
      } else {
        // macOS và Linux: dùng favicon-32x32.png (sẽ resize về 22x22 hoặc 16x16)
        iconPath = join(iconsPath, "favicon-32x32.png");
      }
    } else {
      // Production: Tìm trong resources/icons (từ extraResources)
      const resourcesPath = process.resourcesPath || appPath;
      const iconsPath = join(resourcesPath, "icons");

      if (process.platform === "win32") {
        iconPath = join(iconsPath, "favicon.ico");
      } else {
        iconPath = join(iconsPath, "favicon-32x32.png");
      }
    }

    return iconPath;
  }

  /**
   * Getter để các module khác có thể truy cập settingsWindow
   */
  get settingsWindow(): BrowserWindow | null {
    return this.#settingsWindow;
  }
}

// Singleton instance
let systemTrayModuleInstance: SystemTrayModule | null = null;

export function createSystemTrayModule(
  ...args: ConstructorParameters<typeof SystemTrayModule>
) {
  if (!systemTrayModuleInstance) {
    systemTrayModuleInstance = new SystemTrayModule(...args);
  }
  return systemTrayModuleInstance;
}

export function getSystemTrayModule(): SystemTrayModule | null {
  return systemTrayModuleInstance;
}
