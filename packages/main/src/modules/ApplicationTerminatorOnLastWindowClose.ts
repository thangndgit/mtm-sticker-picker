import { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";

/**
 * Module quản lý vòng đời ứng dụng.
 * Chặn sự kiện 'window-all-closed' để app tiếp tục chạy ngầm trong System Tray.
 * App chỉ thoát hoàn toàn khi người dùng chọn 'Quit' từ Tray Menu.
 */
class ApplicationTerminatorOnLastWindowClose implements AppModule {
  // Flag để xác định xem app có đang trong quá trình quit hay không
  // Chỉ set true khi người dùng chọn 'Quit' từ Tray Menu
  static #isQuitting = false;

  static get isQuitting(): boolean {
    return ApplicationTerminatorOnLastWindowClose.#isQuitting;
  }

  static set isQuitting(value: boolean) {
    ApplicationTerminatorOnLastWindowClose.#isQuitting = value;
  }

  enable({ app }: ModuleContext): Promise<void> | void {
    // Chặn sự kiện 'window-all-closed': Khi tất cả cửa sổ đóng lại,
    // ứng dụng KHÔNG được thoát mà phải tiếp tục chạy ngầm trong System Tray.
    app.on("window-all-closed", () => {
      // Chỉ quit nếu người dùng đã chọn 'Quit' từ Tray Menu
      if (!ApplicationTerminatorOnLastWindowClose.#isQuitting) {
        // Không gọi app.quit() - App sẽ tiếp tục chạy ngầm trong System Tray
        // Electron sẽ không tự động quit khi có handler cho 'window-all-closed'
      } else {
        // Nếu isQuitting = true, cho phép app quit bình thường
        app.quit();
      }
    });
  }
}

export function terminateAppOnLastWindowClose(
  ...args: ConstructorParameters<typeof ApplicationTerminatorOnLastWindowClose>
) {
  return new ApplicationTerminatorOnLastWindowClose(...args);
}

// Export isQuitting để các module khác có thể truy cập
export { ApplicationTerminatorOnLastWindowClose };
