import type { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { Tray, Menu, nativeImage, app, BrowserWindow } from "electron";
import { ApplicationTerminatorOnLastWindowClose } from "./ApplicationTerminatorOnLastWindowClose.js";
import type { AppInitConfig } from "../AppInitConfig.js";
import { getAppIconPath } from "../utils/getAppIconPath.js";

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
    const icon = nativeImage.createFromPath(iconPath);

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
          // Gán isQuitting = true và gọi app.quit()
          ApplicationTerminatorOnLastWindowClose.isQuitting = true;
          app.quit();
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

    // Load renderer
    if (this.#renderer instanceof URL) {
      this.#settingsWindow.loadURL(this.#renderer.href);
    } else {
      this.#settingsWindow.loadFile(this.#renderer.path);
    }

    // Xử lý nút đóng (X): Ẩn thay vì destroy
    this.#settingsWindow.on("close", (event) => {
      // Ngăn chặn đóng cửa sổ
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
   * Sử dụng icon từ folder icons ở root project.
   */
  #getTrayIconPath(): string {
    return getAppIconPath();
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
