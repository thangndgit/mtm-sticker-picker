import type { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { BrowserWindow, globalShortcut, screen } from "electron";
import type { AppInitConfig } from "../AppInitConfig.js";
import { getAppIconPath } from "../utils/getAppIconPath.js";

/**
 * Module quản lý cửa sổ Picker (Popup).
 * Tạo frameless popup với global shortcut, tự động tính toán vị trí,
 * và tự ẩn khi bị blur.
 */
class PickerWindowModule implements AppModule {
  readonly #preload: { path: string };
  readonly #renderer: { path: string } | URL;
  #pickerWindow: BrowserWindow | null = null;
  readonly #shortcut = "CommandOrControl+Shift+X";
  #mouseTrackingInterval: NodeJS.Timeout | null = null;

  constructor({ initConfig }: { initConfig: AppInitConfig }) {
    this.#preload = initConfig.preload;
    this.#renderer = initConfig.renderer;
  }

  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady();

    // Đăng ký Global Shortcut: CommandOrControl+Shift+X
    const ret = globalShortcut.register(this.#shortcut, () => {
      this.#togglePickerWindow();
    });

    if (!ret) {
      console.error("Failed to register global shortcut:", this.#shortcut);
    }

    // Đăng ký Global Shortcut: ESC để đóng popup
    // Chỉ hoạt động khi picker window đang visible
    const escRet = globalShortcut.register("Escape", () => {
      if (
        this.#pickerWindow &&
        !this.#pickerWindow.isDestroyed() &&
        this.#pickerWindow.isVisible()
      ) {
        this.#pickerWindow.hide();
      }
    });

    if (!escRet) {
      console.warn(
        "Failed to register ESC global shortcut (may be in use by another app)"
      );
    }

    // Unregister shortcut khi app quit
    app.on("will-quit", () => {
      globalShortcut.unregister(this.#shortcut);
      globalShortcut.unregister("Escape");
      globalShortcut.unregisterAll();
    });
  }

  /**
   * Toggle cửa sổ Picker: Nếu đang hiện thì ẩn, nếu đang ẩn thì hiện.
   */
  #togglePickerWindow(): void {
    // Tạo window nếu chưa tồn tại
    if (!this.#pickerWindow || this.#pickerWindow.isDestroyed()) {
      this.#createPickerWindow();
      return;
    }

    // Toggle visibility
    if (this.#pickerWindow.isVisible()) {
      // Fade out trước khi hide
      let opacity = 1;
      const fadeOutInterval = setInterval(() => {
        opacity -= 0.1;
        if (opacity <= 0) {
          opacity = 0;
          clearInterval(fadeOutInterval);
          if (this.#pickerWindow && !this.#pickerWindow.isDestroyed()) {
            this.#pickerWindow.hide();
            this.#pickerWindow.setOpacity(1); // Reset opacity cho lần show tiếp theo
          }
        } else if (this.#pickerWindow && !this.#pickerWindow.isDestroyed()) {
          this.#pickerWindow.setOpacity(opacity);
        } else {
          clearInterval(fadeOutInterval);
        }
      }, 16); // ~60fps
    } else {
      // Đảm bảo window được hide trước khi show lại (tránh nháy)
      if (this.#pickerWindow.isVisible()) {
        this.#pickerWindow.hide();
      }
      // Show ngay sau khi hide (không delay)
      this.#showPickerWindow();
    }
  }

  /**
   * Tạo cửa sổ Picker mới.
   */
  #createPickerWindow(): void {
    // Fix cứng kích thước popup: 400x800
    const width = 400;
    const height = 550;

    // Tạo pickerWindow: frameless, alwaysOnTop, skipTaskbar, transparent
    this.#pickerWindow = new BrowserWindow({
      width,
      height,
      frame: false, // Frameless
      alwaysOnTop: true, // Always on top
      skipTaskbar: true, // Skip taskbar
      transparent: true, // Transparent background
      show: false, // Không hiện ngay
      resizable: false, // Không cho resize
      focusable: false, // KHÔNG lấy focus để không làm mất focus của input đang nhập
      icon: getAppIconPath(), // Set icon cho window
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webviewTag: false,
        preload: this.#preload.path,
      },
    });

    // Load renderer (sẽ load component Picker)
    if (this.#renderer instanceof URL) {
      this.#pickerWindow.loadURL(this.#renderer.href + "#picker");
    } else {
      this.#pickerWindow.loadFile(this.#renderer.path, { hash: "picker" });
    }

    // Với focusable: false, blur event không hoạt động
    // ESC được xử lý bằng global shortcut
    // Click ra ngoài: Sử dụng setIgnoreMouseEvents với forward để detect click
    // Khi window visible, set ignoreMouseEvents(false, { forward: true })
    // để window nhận mouse events nhưng forward chúng
    this.#pickerWindow.on("show", () => {
      if (this.#pickerWindow && !this.#pickerWindow.isDestroyed()) {
        // Cho phép window nhận mouse events
        // forward: true để forward events đến window bên dưới khi click ra ngoài
        this.#pickerWindow.setIgnoreMouseEvents(false, { forward: true });
      }
    });

    this.#pickerWindow.on("hide", () => {
      // Dừng track mouse khi window ẩn
      this.#stopMouseTracking();
    });

    // Cleanup khi cửa sổ bị destroy
    this.#pickerWindow.on("closed", () => {
      this.#pickerWindow = null;
    });

    // Show window khi ready (chỉ lần đầu)
    this.#pickerWindow.once("ready-to-show", () => {
      if (this.#pickerWindow && !this.#pickerWindow.isDestroyed()) {
        this.#showPickerWindow();
      }
    });
  }

  /**
   * Hiển thị cửa sổ Picker tại vị trí con trỏ chuột.
   * Tính toán để Popup KHÔNG được tràn khỏi vùng làm việc an toàn của màn hình (Work Area).
   */
  #showPickerWindow(): void {
    if (!this.#pickerWindow || this.#pickerWindow.isDestroyed()) {
      return;
    }

    // Lấy tọa độ chuột
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const workArea = display.workArea;

    // Kích thước cửa sổ
    const windowBounds = this.#pickerWindow.getBounds();
    const windowWidth = windowBounds.width;
    const windowHeight = windowBounds.height;

    // Tính toán vị trí
    let x = cursorPoint.x;
    let y = cursorPoint.y;

    // Điều chỉnh để không tràn ra ngoài workArea
    if (x + windowWidth > workArea.x + workArea.width) {
      x = workArea.x + workArea.width - windowWidth;
    }
    if (y + windowHeight > workArea.y + workArea.height) {
      y = workArea.y + workArea.height - windowHeight;
    }
    if (x < workArea.x) {
      x = workArea.x;
    }
    if (y < workArea.y) {
      y = workArea.y;
    }

    const finalX = Math.round(x);
    const finalY = Math.round(y);

    // Đảm bảo window được hide trước khi set position và show lại
    if (this.#pickerWindow.isVisible()) {
      this.#pickerWindow.hide();
    }

    // Set position trước, sau đó mới show với fade in animation
    this.#pickerWindow.setPosition(finalX, finalY);
    this.#pickerWindow.setOpacity(0); // Bắt đầu với opacity 0
    this.#pickerWindow.show();

    // Fade in animation
    let opacity = 0;
    const fadeInterval = setInterval(() => {
      opacity += 0.1;
      if (opacity >= 1) {
        opacity = 1;
        clearInterval(fadeInterval);
      }
      if (this.#pickerWindow && !this.#pickerWindow.isDestroyed()) {
        this.#pickerWindow.setOpacity(opacity);
      } else {
        clearInterval(fadeInterval);
      }
    }, 16); // ~60fps
  }

  /**
   * Bắt đầu track mouse để detect click ra ngoài window
   */
  #startMouseTracking(): void {
    if (this.#mouseTrackingInterval) {
      return; // Đã đang track
    }

    // Track mouse position mỗi 100ms
    this.#mouseTrackingInterval = setInterval(() => {
      if (
        !this.#pickerWindow ||
        this.#pickerWindow.isDestroyed() ||
        !this.#pickerWindow.isVisible()
      ) {
        this.#stopMouseTracking();
        return;
      }

      const mousePos = screen.getCursorScreenPoint();
      const windowBounds = this.#pickerWindow.getBounds();

      // Kiểm tra xem mouse có nằm trong window bounds không
      const isInsideWindow =
        mousePos.x >= windowBounds.x &&
        mousePos.x <= windowBounds.x + windowBounds.width &&
        mousePos.y >= windowBounds.y &&
        mousePos.y <= windowBounds.y + windowBounds.height;

      // Nếu mouse ra ngoài window, không làm gì (chờ click)
      // Click sẽ được detect qua IPC từ renderer hoặc global mouse hook
    }, 100);
  }

  /**
   * Dừng track mouse
   */
  #stopMouseTracking(): void {
    if (this.#mouseTrackingInterval) {
      clearInterval(this.#mouseTrackingInterval);
      this.#mouseTrackingInterval = null;
    }
  }

  /**
   * Getter để các module khác có thể truy cập pickerWindow
   */
  get pickerWindow(): BrowserWindow | null {
    return this.#pickerWindow;
  }
}

// Singleton instance để có thể truy cập từ module khác
let pickerWindowInstance: PickerWindowModule | null = null;

export function createPickerWindowModule(
  ...args: ConstructorParameters<typeof PickerWindowModule>
) {
  if (!pickerWindowInstance) {
    pickerWindowInstance = new PickerWindowModule(...args);
  }
  return pickerWindowInstance;
}

export function getPickerWindow(): BrowserWindow | null {
  return pickerWindowInstance?.pickerWindow ?? null;
}
