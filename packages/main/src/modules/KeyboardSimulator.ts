import { keyboard, Key } from "@nut-tree-fork/nut-js";

/**
 * Module mô phỏng bàn phím để gửi tổ hợp phím Paste.
 * Sử dụng native module @nut-tree-fork/nut-js để đảm bảo độ tin cậy và tốc độ cao.
 *
 * Ưu điểm so với PowerShell/AppleScript:
 * - Nhanh hơn: ~5-20ms thay vì ~80-180ms
 * - Không spawn process: Gọi native API trực tiếp
 * - Cross-platform: Hoạt động trên Windows, macOS, Linux
 * - Đáng tin cậy hơn: Không phụ thuộc vào script engine
 *
 * Lưu ý: Native module cần được rebuild cho Electron version.
 * Chạy: npm install --workspace=@app/main @nut-tree-fork/nut-js
 * Sau đó: npx electron-rebuild -f -w @nut-tree-fork/nut-js (nếu cần)
 */
export class KeyboardSimulator {
  /**
   * Gửi tổ hợp phím Paste (Ctrl+V trên Windows/Linux, Cmd+V trên macOS).
   * Sử dụng pressKey và sau đó explicitly release modifier key để tránh bị "ghim".
   */
  static async simulatePaste(): Promise<void> {
    const platform = process.platform;

    try {
      if (platform === "win32" || platform === "linux") {
        // Windows/Linux: Ctrl+V
        await keyboard.pressKey(Key.LeftControl, Key.V);
        // Đợi một chút để paste hoàn tất, sau đó release modifier key
        // Điều này quan trọng để tránh Ctrl bị "ghim"
        await new Promise((resolve) => setTimeout(resolve, 30));
        await keyboard.releaseKey(Key.LeftControl);
      } else if (platform === "darwin") {
        // macOS: Cmd+V (LeftSuper = Command key trên Mac)
        await keyboard.pressKey(Key.LeftSuper, Key.V);
        // Đợi một chút để paste hoàn tất, sau đó release modifier key
        await new Promise((resolve) => setTimeout(resolve, 30));
        await keyboard.releaseKey(Key.LeftSuper);
      } else {
        console.warn(`[KeyboardSimulator] Unsupported platform: ${platform}`);
      }
    } catch (error) {
      console.error(`[KeyboardSimulator] Error simulating paste:`, error);
      throw error;
    }
  }
}
