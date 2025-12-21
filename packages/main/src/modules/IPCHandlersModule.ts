import type { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { ipcMain, app, clipboard, nativeImage, BrowserWindow } from "electron";
import { getStickerManager } from "./StickerManagerModule.js";
import { getRecentStickers } from "./RecentStickersModule.js";
import { getConfigManager } from "./ConfigManagerModule.js";
import { KeyboardSimulator } from "./KeyboardSimulator.js";
import { getPickerWindow } from "./PickerWindowModule.js";
import { join, extname, resolve } from "node:path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import type { AppConfig } from "../../../../types/config.d.ts";
import { getSystemTrayModule } from "./SystemTrayModule.js";
import sharp from "sharp";
import clipboardEx from "electron-clipboard-ex";

/**
 * Module xử lý IPC communication giữa Renderer và Main process.
 * Định nghĩa các IPC handlers theo pattern invoke/handle với format category:action.
 */
class IPCHandlersModule implements AppModule {
  enable({ app: electronApp }: ModuleContext): Promise<void> | void {
    // app:get-version - Lấy version của app
    ipcMain.handle("app:get-version", () => {
      return app.getVersion();
    });

    // window:close - Đóng cửa sổ hiện tại (cho Settings window và Picker window)
    ipcMain.handle("window:close", (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window && !window.isDestroyed()) {
        window.hide();
      }
    });

    // window:open-settings - Mở cửa sổ Settings
    ipcMain.handle("window:open-settings", () => {
      const systemTrayModule = getSystemTrayModule();
      if (systemTrayModule) {
        systemTrayModule.openSettingsWindow();
        return { success: true };
      }
      return { success: false, error: "SystemTrayModule not found" };
    });

    // window:check-click-outside - Kiểm tra xem click có nằm ngoài window bounds không
    ipcMain.handle(
      "window:check-click-outside",
      (event, mouseX: number, mouseY: number) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window || window.isDestroyed() || !window.isVisible()) {
          return false;
        }

        const bounds = window.getBounds();
        const isOutside =
          mouseX < bounds.x ||
          mouseX > bounds.x + bounds.width ||
          mouseY < bounds.y ||
          mouseY > bounds.y + bounds.height;

        if (isOutside) {
          window.hide();
          return true;
        }
        return false;
      }
    );

    // window:resize-to-content - Resize window theo content height
    ipcMain.handle(
      "window:resize-to-content",
      (event, width: number, height: number) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window && !window.isDestroyed()) {
          // Giới hạn min/max height để tránh window quá nhỏ hoặc quá lớn
          const minHeight = 200;
          const maxHeight = 800;
          const finalHeight = Math.max(minHeight, Math.min(maxHeight, height));
          window.setSize(width, finalHeight);
        }
      }
    );

    // window:minimize - Minimize cửa sổ hiện tại
    ipcMain.handle("window:minimize", (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.minimize();
      }
    });

    // sticker:get-all - Lấy danh sách tất cả sticker packs (chỉ metadata, không có stickers)
    ipcMain.handle("sticker:get-all", () => {
      const stickerManager = getStickerManager();
      if (stickerManager) {
        return stickerManager.getAllPacks();
      }
      return [];
    });

    // sticker:get-pack-stickers - Lấy stickers của một pack cụ thể (lazy load)
    ipcMain.handle(
      "sticker:get-pack-stickers",
      async (event, packId: string) => {
        const stickerManager = getStickerManager();
        if (stickerManager) {
          try {
            const stickers = await stickerManager.getPackStickers(packId);
            return { success: true, stickers };
          } catch (error) {
            console.error(
              `[IPC] Error getting pack stickers for ${packId}:`,
              error
            );
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              stickers: [],
            };
          }
        }
        return {
          success: false,
          error: "StickerManager not found",
          stickers: [],
        };
      }
    );

    // sticker:refresh - Quét lại thư mục sticker_data
    ipcMain.handle("sticker:refresh", async () => {
      const stickerManager = getStickerManager();
      if (stickerManager) {
        await stickerManager.reload();
        return { success: true, packs: stickerManager.getAllPacks() };
      }
      return { success: false, error: "StickerManager not found" };
    });

    // config:get - Lấy toàn bộ cấu hình
    ipcMain.handle("config:get", () => {
      const configManager = getConfigManager();
      if (configManager) {
        return configManager.getConfig();
      }
      return null;
    });

    // config:update - Cập nhật cấu hình
    ipcMain.handle("config:update", (event, updates: Partial<AppConfig>) => {
      const configManager = getConfigManager();
      if (configManager) {
        // Chỉ update các giá trị không phải undefined/null
        const validUpdates: Partial<AppConfig> = {};
        if (updates.theme !== undefined && updates.theme !== null) {
          validUpdates.theme = updates.theme;
        }
        if (updates.gridColumns !== undefined && updates.gridColumns !== null) {
          validUpdates.gridColumns = updates.gridColumns;
        }
        if (updates.popupSize !== undefined && updates.popupSize !== null) {
          validUpdates.popupSize = updates.popupSize;
        }
        if (updates.packOrder !== undefined && updates.packOrder !== null) {
          validUpdates.packOrder = updates.packOrder;
        }
        if (updates.autoLaunch !== undefined && updates.autoLaunch !== null) {
          validUpdates.autoLaunch = updates.autoLaunch;
        }

        configManager.updateConfig(validUpdates);

        // Xử lý auto-launch nếu có thay đổi
        if (validUpdates.autoLaunch !== undefined) {
          app.setLoginItemSettings({
            openAtLogin: validUpdates.autoLaunch,
            openAsHidden: true, // Khởi động ẩn (chỉ chạy trong background)
          });
          console.log(
            `[IPC] Auto-launch ${
              validUpdates.autoLaunch ? "enabled" : "disabled"
            }`
          );
        }

        // Gửi event để các window khác biết config đã thay đổi
        BrowserWindow.getAllWindows().forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send(
              "config:changed",
              configManager.getConfig()
            );
          }
        });
        return { success: true };
      }
      return { success: false, error: "ConfigManager not found" };
    });

    // sticker:get-recent - Lấy danh sách recent stickers
    ipcMain.handle("sticker:get-recent", () => {
      const recentStickers = getRecentStickers();
      if (recentStickers) {
        return recentStickers.getRecentPaths();
      }
      return [];
    });

    // sticker:select - Xử lý khi người dùng chọn một sticker
    ipcMain.handle("sticker:select", async (event, stickerPath: string) => {
      try {
        // 1. Lấy đường dẫn đầy đủ của sticker file
        const stickerManager = getStickerManager();
        if (!stickerManager) {
          throw new Error("StickerManager not found");
        }

        const stickerDataPath = stickerManager.getStickerDataPath();
        const fullStickerPath = join(stickerDataPath, stickerPath);

        // 2. Kiểm tra file có tồn tại không
        if (!existsSync(fullStickerPath)) {
          throw new Error(`File not found: ${fullStickerPath}`);
        }

        // 3. Xử lý theo loại file
        const ext = extname(fullStickerPath).toLowerCase();
        const isGif = ext === ".gif";

        if (isGif) {
          // Với GIF động: Electron's nativeImage chỉ hỗ trợ frame đầu tiên
          // Sử dụng electron-clipboard-ex để copy file trực tiếp vào clipboard
          // Điều này giữ được animation của GIF
          try {
            // Normalize path để đảm bảo format đúng
            const normalizedPath = resolve(fullStickerPath);

            // Kiểm tra platform hỗ trợ
            if (process.platform === "win32" || process.platform === "darwin") {
              // Windows và macOS: Sử dụng electron-clipboard-ex để copy file
              // Thư viện này hỗ trợ CF_HDROP trên Windows và file paths trên macOS
              clipboardEx.writeFilePaths([normalizedPath]);

              // Đợi một chút để đảm bảo clipboard được set
              await new Promise((resolve) => setTimeout(resolve, 50));
            } else {
              // Linux: electron-clipboard-ex không hỗ trợ, chỉ có thể copy frame đầu tiên
              console.warn(
                `[IPC] Linux không hỗ trợ copy file vào clipboard, sẽ copy frame đầu tiên của GIF`
              );
              const gifBuffer = await readFile(fullStickerPath);
              const pngBuffer = await sharp(gifBuffer, { animated: false })
                .png()
                .toBuffer();
              const image = nativeImage.createFromBuffer(pngBuffer);
              if (image.isEmpty()) {
                throw new Error(
                  `Failed to convert GIF to PNG from path: ${fullStickerPath}`
                );
              }
              clipboard.writeImage(image);
            }
          } catch (clipboardExError) {
            // Fallback: Nếu electron-clipboard-ex lỗi, thử copy như image
            console.warn(
              `[IPC] Failed to copy GIF file to clipboard via electron-clipboard-ex, trying image fallback:`,
              clipboardExError
            );
            try {
              const gifBuffer = await readFile(fullStickerPath);
              // Thử copy GIF buffer trực tiếp (có thể hoạt động với một số ứng dụng)
              const image = nativeImage.createFromBuffer(gifBuffer);
              if (!image.isEmpty()) {
                clipboard.writeImage(image);
              } else {
                // Fallback cuối cùng: Convert frame đầu tiên sang PNG
                const pngBuffer = await sharp(gifBuffer, { animated: false })
                  .png()
                  .toBuffer();
                const pngImage = nativeImage.createFromBuffer(pngBuffer);
                if (pngImage.isEmpty()) {
                  throw new Error(
                    `Failed to load GIF image from path: ${fullStickerPath}`
                  );
                }
                clipboard.writeImage(pngImage);
              }
            } catch (fallbackError) {
              throw new Error(
                `Failed to copy GIF file to clipboard: ${fullStickerPath}. ` +
                  `electron-clipboard-ex error: ${
                    clipboardExError instanceof Error
                      ? clipboardExError.message
                      : String(clipboardExError)
                  }. ` +
                  `Fallback error: ${
                    fallbackError instanceof Error
                      ? fallbackError.message
                      : String(fallbackError)
                  }`
              );
            }
          }
        } else {
          // Với các format khác (PNG, JPG, etc): Sử dụng nativeImage như cũ
          const image = nativeImage.createFromPath(fullStickerPath);
          if (image.isEmpty()) {
            throw new Error(
              `Failed to load image from path: ${fullStickerPath}`
            );
          }
          clipboard.writeImage(image);
        }

        // 4. Lưu vào recent stickers
        const recentStickers = getRecentStickers();
        if (recentStickers) {
          recentStickers.addRecent(stickerPath);
          // Gửi event để notify renderer về recent stickers đã thay đổi
          BrowserWindow.getAllWindows().forEach((window) => {
            if (!window.isDestroyed()) {
              window.webContents.send(
                "sticker:recent-updated",
                recentStickers.getRecentPaths()
              );
            }
          });
        }

        // 5. Delay ngắn để đảm bảo clipboard được set hoàn toàn trước khi paste
        await new Promise((resolve) => setTimeout(resolve, 10));

        // 6. Simulate Paste (window vẫn hiển thị nhưng không có focus nên paste vào input)
        await KeyboardSimulator.simulatePaste();

        // 7. Sau khi paste xong, ẩn picker window (để user thấy kết quả trước)
        const pickerWindow = getPickerWindow();
        if (pickerWindow && !pickerWindow.isDestroyed()) {
          pickerWindow.hide();
        }

        return { success: true };
      } catch (error) {
        console.error(`[IPC] Error in sticker:select:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Cleanup khi app quit
    electronApp.on("will-quit", () => {
      ipcMain.removeAllListeners();
    });
  }
}

export function createIPCHandlersModule(
  ...args: ConstructorParameters<typeof IPCHandlersModule>
) {
  return new IPCHandlersModule(...args);
}
