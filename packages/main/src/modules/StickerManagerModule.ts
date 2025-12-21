import type { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { app, protocol } from "electron";
import { readdir, stat, mkdir } from "fs/promises";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { StickerItem, StickerPack } from "../../../../types/sticker.d.ts";
import { readFile } from "fs/promises";

/**
 * Module quản lý Sticker data.
 * Quét thư mục sticker_data, tạo protocol ảo sticker://,
 * và cung cấp API để lấy danh sách stickers.
 */
class StickerManagerModule implements AppModule {
  readonly #stickerDataPath: string;
  readonly #protocolName = "sticker";
  // Chỉ lưu metadata của packs (không có stickers) để tiết kiệm RAM
  #packMetadata: readonly Omit<StickerPack, "stickers">[] = [];
  // Cache stickers đã load (lazy load)
  readonly #packStickersCache = new Map<string, readonly StickerItem[]>();

  constructor() {
    // Xác định đường dẫn thư mục sticker_data
    // Trong production, sticker_data nằm trong extraResources (bên ngoài .asar)
    const appPath = app.getAppPath();

    if (import.meta.env.DEV) {
      // Development: Tìm từ thư mục hiện tại (dist) lên root
      const appDir = dirname(fileURLToPath(import.meta.url));
      this.#stickerDataPath = join(appDir, "..", "..", "..", "sticker_data");
    } else {
      // Production: Tìm trong resources (extraResources)
      // Trên Windows: resources/sticker_data
      // Trên macOS: Contents/Resources/sticker_data
      // Trên Linux: resources/sticker_data
      if (process.platform === "darwin") {
        // macOS: app.getAppPath() trả về Contents/Resources/app.asar
        this.#stickerDataPath = join(appPath, "..", "sticker_data");
      } else {
        // Windows/Linux: app.getAppPath() trả về resources/app.asar
        this.#stickerDataPath = join(appPath, "..", "sticker_data");
      }
    }
  }

  async enable({ app: electronApp }: ModuleContext): Promise<void> {
    // Đăng ký protocol ảo sticker://
    // Protocol phải được đăng ký TRƯỚC khi app ready (trong app.on('ready') hoặc app.once('ready'))
    // Vì protocol.registerFileProtocol chỉ hoạt động sau khi app ready

    const registerProtocol = () => {
      const registered = protocol.registerFileProtocol(
        this.#protocolName,
        async (request, callback) => {
          try {
            // Lấy đường dẫn từ URL (ví dụ: sticker://pack_default/s_1.png -> pack_default/s_1.png)
            // Với custom protocol, cần parse thủ công vì new URL() có thể không hoạt động đúng
            const protocolPrefix = `${this.#protocolName}://`;
            if (!request.url.startsWith(protocolPrefix)) {
              console.error(
                `[StickerManager] Invalid protocol in URL: ${request.url}`
              );
              callback({ error: -2 });
              return;
            }

            // Bỏ phần protocol prefix để lấy path
            let filePath = request.url.substring(protocolPrefix.length);

            // Bỏ dấu / đầu tiên nếu có
            if (filePath.startsWith("/")) {
              filePath = filePath.substring(1);
            }

            // Decode URL encoding (ví dụ: %5B -> [, %5D -> ])
            try {
              filePath = decodeURIComponent(filePath);
            } catch (e) {
              // Nếu decode fail, dùng path gốc
              console.warn(
                `[StickerManager] Failed to decode URL: ${filePath}`
              );
            }

            const fullPath = join(this.#stickerDataPath, filePath);

            // Kiểm tra file có tồn tại không
            const { existsSync } = await import("fs");
            if (!existsSync(fullPath)) {
              console.error(`[StickerManager] File not found: ${fullPath}`);
              callback({ error: -2 }); // FILE_NOT_FOUND
              return;
            }

            // Trả về đường dẫn file
            callback({ path: fullPath });
          } catch (error) {
            console.error(
              "[StickerManager] Error serving sticker file:",
              error
            );
            console.error("[StickerManager] Request URL:", request.url);
            callback({ error: -2 }); // FILE_NOT_FOUND
          }
        }
      );

      if (!registered) {
        console.error(
          `[StickerManager] ✗ Failed to register protocol '${
            this.#protocolName
          }://'`
        );
      }
    };

    // Đăng ký protocol trong app.once('ready') để đảm bảo đúng thời điểm
    // Nếu app đã ready, đăng ký ngay
    if (electronApp.isReady()) {
      registerProtocol();
    } else {
      electronApp.once("ready", registerProtocol);
    }

    // Đợi app ready trước khi quét stickers
    await electronApp.whenReady();

    // Quét và load stickers
    await this.#scanStickers();
  }

  /**
   * Quét thư mục sticker_data và load tất cả stickers.
   */
  async #scanStickers(): Promise<void> {
    try {
      // Tạo thư mục sticker_data nếu không tồn tại
      await this.#ensureStickerDataDirectory();

      // Đọc danh sách các thư mục trong sticker_data
      const entries = await readdir(this.#stickerDataPath, {
        withFileTypes: true,
      });

      // Tìm các folder có format pack[pack_name]
      const packDirs = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith("pack[") &&
          entry.name.endsWith("]")
      );

      const packs: StickerPack[] = [];

      // Quét từng pack
      for (const packDir of packDirs) {
        const packId = packDir.name;
        const packPath = join(this.#stickerDataPath, packId);

        // Đọc s_data.json để lấy metadata
        const dataFilePath = join(packPath, "s_data.json");
        let packName = packId;
        let displayName = packId;
        let order = 999; // Default order nếu không có

        try {
          const dataFileContent = await readFile(dataFilePath, "utf-8");
          const data = JSON.parse(dataFileContent) as {
            name: string;
            displayName: string;
            order: number;
          };
          packName = data.name || packId;
          displayName = data.displayName || packId;
          order = data.order ?? 999;
        } catch (error) {
          // Nếu không có s_data.json, sử dụng tên folder làm fallback
          console.warn(
            `[StickerManager] Could not read s_data.json for ${packId}:`,
            error
          );
          // Extract name từ pack[pack_name]
          const match = packId.match(/^pack\[(.+)\]$/);
          if (match) {
            packName = match[1];
            displayName = packName
              .split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");
          }
        }

        // Quét các file ảnh trong pack (format: s_00, s_01, ...)
        const files = await readdir(packPath);

        // Lọc các file sticker (s_00, s_01, ...) và bỏ qua s_thumb, s_data.json
        const stickerFiles = files.filter((file) => {
          const name = basename(file, extname(file));
          return (
            name.startsWith("s_") &&
            name !== "s_thumb" &&
            name !== "s_data" &&
            this.#isImageFile(file)
          );
        });

        // Sắp xếp files theo số (s_00, s_01, s_02, ...)
        stickerFiles.sort((a, b) => {
          const indexA = this.#extractIndex(a);
          const indexB = this.#extractIndex(b);
          return indexA - indexB;
        });

        // Tạo StickerItem cho mỗi file
        const stickers: StickerItem[] = stickerFiles.map((file, idx) => {
          const name = basename(file, extname(file));
          const path = `${packId}/${file}`;
          const id = `${packName}_${idx}`;

          // Tạo URL với protocol sticker://
          // Format: sticker://pack[pack_name]/s_00.png
          // Encode path để xử lý ký tự đặc biệt như [ và ]
          const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/"); // Giữ lại dấu / không encode
          const url = `${this.#protocolName}://${encodedPath}`;

          return {
            id,
            name,
            path,
            packId: packName, // Sử dụng name từ s_data.json làm packId
            url,
          } as const;
        });

        // Kiểm tra xem có s_thumb không
        let thumbnailUrl: string | undefined;
        const thumbFiles = files.filter(
          (file) =>
            basename(file, extname(file)) === "s_thumb" &&
            this.#isImageFile(file)
        );
        if (thumbFiles.length > 0) {
          const thumbPath = `${packId}/${thumbFiles[0]}`;
          const encodedThumbPath = encodeURIComponent(thumbPath).replace(
            /%2F/g,
            "/"
          ); // Giữ lại dấu / không encode
          thumbnailUrl = `${this.#protocolName}://${encodedThumbPath}`;
        } else if (stickers.length > 0) {
          // Fallback: dùng sticker đầu tiên làm thumbnail
          thumbnailUrl = stickers[0].url;
        }

        // Tạo StickerPack
        packs.push({
          id: packName, // Sử dụng name từ s_data.json làm id
          name: packId, // Giữ tên folder để truy cập file
          displayName,
          order,
          thumbnailUrl,
          stickers,
        } as const);
      }

      // Sắp xếp packs theo order từ s_data.json (mặc định)
      packs.sort((a, b) => a.order - b.order);

      this.#packMetadata = packs;
    } catch (error) {
      console.error("Error scanning stickers:", error);
      this.#packMetadata = [];
    }
  }

  /**
   * Đảm bảo thư mục sticker_data tồn tại.
   * Nếu không tồn tại, tạo thư mục mẫu với một pack mặc định.
   */
  async #ensureStickerDataDirectory(): Promise<void> {
    try {
      await stat(this.#stickerDataPath);
      // Thư mục đã tồn tại
    } catch {
      // Thư mục không tồn tại, tạo mới
      await mkdir(this.#stickerDataPath, { recursive: true });

      // Tạo thư mục pack mẫu với cấu trúc mới
      const defaultPackPath = join(this.#stickerDataPath, "pack[default]");
      await mkdir(defaultPackPath, { recursive: true });

      // Tạo s_data.json mẫu
      const defaultData = {
        name: "default",
        displayName: "Default Pack",
        order: 1,
      };
      await import("fs/promises").then((fs) =>
        fs.writeFile(
          join(defaultPackPath, "s_data.json"),
          JSON.stringify(defaultData, null, 2),
          "utf-8"
        )
      );
    }
  }

  /**
   * Kiểm tra xem file có phải là file ảnh không.
   */
  #isImageFile(filename: string): boolean {
    const ext = extname(filename).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext);
  }

  /**
   * Trích xuất index từ tên file (ví dụ: s_00.png -> 0, s_01.png -> 1).
   */
  #extractIndex(filename: string): number {
    const name = basename(filename, extname(filename));
    const match = name.match(/^s_(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 0;
  }

  /**
   * Lấy danh sách tất cả sticker packs (chỉ metadata, không có stickers).
   */
  getAllPacks(): readonly Omit<StickerPack, "stickers">[] {
    return this.#packMetadata;
  }

  /**
   * Reload stickers (quét lại từ disk).
   */
  async reload(): Promise<void> {
    // Clear cache khi reload
    this.#packStickersCache.clear();
    await this.#scanStickers();
  }

  /**
   * Lấy stickers của một pack cụ thể (lazy load).
   * Nếu đã có trong cache, trả về từ cache.
   * Nếu chưa có, scan và load từ disk, sau đó cache lại.
   */
  async getPackStickers(packId: string): Promise<readonly StickerItem[]> {
    // Kiểm tra cache trước
    if (this.#packStickersCache.has(packId)) {
      return this.#packStickersCache.get(packId)!;
    }

    // Tìm pack metadata
    const packMeta = this.#packMetadata.find((p) => p.id === packId);
    if (!packMeta) {
      console.warn(`[StickerManager] Pack not found: ${packId}`);
      return [];
    }

    // Scan và load stickers của pack này
    const packPath = join(this.#stickerDataPath, packMeta.name);
    const stickers = await this.#scanPackStickers(
      packMeta.name,
      packMeta.id,
      packPath
    );

    // Cache lại
    this.#packStickersCache.set(packId, stickers);

    return stickers;
  }

  /**
   * Scan và load stickers của một pack cụ thể từ disk.
   */
  async #scanPackStickers(
    packFolderName: string,
    packName: string,
    packPath: string
  ): Promise<readonly StickerItem[]> {
    try {
      // Quét các file ảnh trong pack (format: s_00, s_01, ...)
      const files = await readdir(packPath);

      // Lọc các file sticker (s_00, s_01, ...) và bỏ qua s_thumb, s_data.json
      const stickerFiles = files.filter((file) => {
        const name = basename(file, extname(file));
        return (
          name.startsWith("s_") &&
          name !== "s_thumb" &&
          name !== "s_data" &&
          this.#isImageFile(file)
        );
      });

      // Sắp xếp files theo số (s_00, s_01, s_02, ...)
      stickerFiles.sort((a, b) => {
        const indexA = this.#extractIndex(a);
        const indexB = this.#extractIndex(b);
        return indexA - indexB;
      });

      // Tạo StickerItem cho mỗi file
      const stickers: StickerItem[] = stickerFiles.map((file, idx) => {
        const name = basename(file, extname(file));
        const path = `${packFolderName}/${file}`;
        const id = `${packName}_${idx}`;

        // Tạo URL với protocol sticker://
        const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
        const url = `${this.#protocolName}://${encodedPath}`;

        return {
          id,
          name,
          path,
          packId: packName,
          url,
        } as const;
      });

      return stickers;
    } catch (error) {
      console.error(
        `[StickerManager] Error scanning stickers for pack ${packName}:`,
        error
      );
      return [];
    }
  }

  /**
   * Clear cache của một pack cụ thể (để force reload).
   */
  clearPackCache(packId: string): void {
    this.#packStickersCache.delete(packId);
  }

  /**
   * Clear toàn bộ cache.
   */
  clearAllCache(): void {
    this.#packStickersCache.clear();
  }

  /**
   * Lấy đường dẫn thư mục sticker_data (để các module khác có thể truy cập).
   */
  getStickerDataPath(): string {
    return this.#stickerDataPath;
  }
}

// Singleton instance
let stickerManagerInstance: StickerManagerModule | null = null;

export function createStickerManagerModule(
  ...args: ConstructorParameters<typeof StickerManagerModule>
) {
  if (!stickerManagerInstance) {
    stickerManagerInstance = new StickerManagerModule(...args);
  }
  return stickerManagerInstance;
}

// Export getter để các module khác có thể truy cập
export function getStickerManager(): StickerManagerModule | null {
  return stickerManagerInstance;
}
