import Store from "electron-store";
import type { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";

/**
 * Interface cho Recent Sticker data
 */
interface RecentStickerData {
  path: string;
  timestamp: number;
}

/**
 * Module quản lý Recent Stickers.
 * Lưu danh sách 30 sticker gần nhất vào electron-store.
 * Sử dụng debounce để tránh ghi file quá thường xuyên.
 */
class RecentStickersModule implements AppModule {
  readonly #store: Store<{ recentStickers: RecentStickerData[] }>;
  readonly #maxRecentCount = 16;
  #pendingUpdates: RecentStickerData[] | null = null;
  #writeTimeout: NodeJS.Timeout | null = null;
  readonly #writeDebounceMs = 500; // Debounce 500ms

  constructor() {
    this.#store = new Store<{ recentStickers: RecentStickerData[] }>({
      name: "sticker-picker-config",
      defaults: {
        recentStickers: [],
      },
    });
  }

  enable({ app: electronApp }: ModuleContext): Promise<void> | void {
    // Cleanup khi app quit
    electronApp.on("will-quit", () => {
      this.#flushPendingUpdates();
    });
    console.log("[RecentStickers] Module initialized");
  }

  /**
   * Thêm một sticker vào danh sách recent.
   * Sử dụng debounce để tránh ghi file quá thường xuyên.
   */
  addRecent(stickerPath: string): void {
    const recentStickers = this.#store.get("recentStickers", []);

    // Loại bỏ sticker đã tồn tại (nếu có)
    const filtered = recentStickers.filter((item) => item.path !== stickerPath);

    // Thêm sticker mới vào đầu danh sách
    const newRecent: RecentStickerData = {
      path: stickerPath,
      timestamp: Date.now(),
    };

    const updated = [newRecent, ...filtered].slice(0, this.#maxRecentCount);

    // Debounce write operation
    this.#pendingUpdates = updated;

    if (this.#writeTimeout) {
      clearTimeout(this.#writeTimeout);
    }

    this.#writeTimeout = setTimeout(() => {
      this.#flushPendingUpdates();
    }, this.#writeDebounceMs);

    console.log(`[RecentStickers] Added sticker to recent: ${stickerPath}`);
  }

  /**
   * Ghi pending updates vào store.
   */
  #flushPendingUpdates(): void {
    if (this.#pendingUpdates) {
      this.#store.set("recentStickers", this.#pendingUpdates);
      this.#pendingUpdates = null;
    }
    if (this.#writeTimeout) {
      clearTimeout(this.#writeTimeout);
      this.#writeTimeout = null;
    }
  }

  /**
   * Lấy danh sách recent stickers (chỉ trả về paths).
   * Nếu có pending updates, trả về pending updates thay vì giá trị trong store.
   */
  getRecentPaths(): readonly string[] {
    // Nếu có pending updates, trả về pending updates (giá trị mới nhất)
    if (this.#pendingUpdates) {
      return this.#pendingUpdates.map((item) => item.path);
    }
    // Nếu không có pending, trả về từ store
    const recentStickers = this.#store.get("recentStickers", []);
    return recentStickers.map((item) => item.path);
  }

  /**
   * Lấy toàn bộ recent stickers data (bao gồm timestamp).
   */
  getRecentStickers(): readonly RecentStickerData[] {
    return this.#store.get("recentStickers", []);
  }

  /**
   * Xóa tất cả recent stickers.
   */
  clearRecent(): void {
    this.#store.set("recentStickers", []);
    console.log("[RecentStickers] Cleared all recent stickers");
  }
}

// Singleton instance
let recentStickersInstance: RecentStickersModule | null = null;

export function createRecentStickersModule(
  ...args: ConstructorParameters<typeof RecentStickersModule>
) {
  if (!recentStickersInstance) {
    recentStickersInstance = new RecentStickersModule(...args);
  }
  return recentStickersInstance;
}

export function getRecentStickers(): RecentStickersModule | null {
  return recentStickersInstance;
}
