import { sha256sum } from "./nodeCrypto.js";
import { versions } from "./versions.js";
import { ipcRenderer } from "electron";
import type { StickerPack, StickerItem } from "../../../types/sticker.d.ts";

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
}

/**
 * API cho Sticker Picker app
 */
const appAPI = {
  /**
   * Lấy version của app
   */
  getVersion: (): Promise<string> => {
    return ipcRenderer.invoke("app:get-version");
  },
};

/**
 * API cho Window operations
 */
const windowAPI = {
  /**
   * Đóng cửa sổ hiện tại (ẩn thay vì destroy)
   */
  close: (): Promise<void> => {
    return ipcRenderer.invoke("window:close");
  },
  /**
   * Mở cửa sổ Settings
   */
  openSettings: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke("window:open-settings");
  },
  /**
   * Minimize cửa sổ hiện tại
   */
  minimize: (): Promise<void> => {
    return ipcRenderer.invoke("window:minimize");
  },
  /**
   * Kiểm tra xem click có nằm ngoài window bounds không
   */
  checkClickOutside: (mouseX: number, mouseY: number): Promise<boolean> => {
    return ipcRenderer.invoke("window:check-click-outside", mouseX, mouseY);
  },
  /**
   * Resize window theo content height
   */
  resizeToContent: (width: number, height: number): Promise<void> => {
    return ipcRenderer.invoke("window:resize-to-content", width, height);
  },
};

/**
 * API cho Sticker operations
 */
const stickerAPI = {
  /**
   * Lấy danh sách tất cả sticker packs (chỉ metadata, không có stickers)
   */
  getAll: (): Promise<
    Array<{
      id: string;
      name: string;
      displayName: string;
      order: number;
      thumbnailUrl?: string;
    }>
  > => {
    return ipcRenderer.invoke("sticker:get-all");
  },
  /**
   * Lấy stickers của một pack cụ thể (lazy load)
   */
  getPackStickers: (packId: string): Promise<{ success: boolean; stickers: readonly StickerItem[]; error?: string }> => {
    return ipcRenderer.invoke("sticker:get-pack-stickers", packId);
  },
  /**
   * Chọn một sticker (copy vào clipboard và paste)
   */
  select: (
    stickerPath: string
  ): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke("sticker:select", stickerPath);
  },
  /**
   * Lấy danh sách recent stickers (paths)
   */
  getRecent: (): Promise<string[]> => {
    return ipcRenderer.invoke("sticker:get-recent");
  },
  onRecentUpdated: (callback: (paths: string[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, paths: string[]) => callback(paths);
    ipcRenderer.on("sticker:recent-updated", handler);
    return () => {
      ipcRenderer.removeListener("sticker:recent-updated", handler);
    };
  },
  /**
   * Quét lại thư mục sticker_data
   */
  refresh: (): Promise<{
    success: boolean;
    packs?: readonly StickerPack[];
    error?: string;
  }> => {
    return ipcRenderer.invoke("sticker:refresh");
  },
};

/**
 * API cho Config operations
 */
const configAPI = {
  /**
   * Lấy toàn bộ cấu hình
   */
  get: (): Promise<{
    theme: "system" | "light" | "dark";
    gridColumns: 3 | 4 | 5;
    popupSize: "small" | "medium" | "large";
    packOrder: string[];
  } | null> => {
    return ipcRenderer.invoke("config:get");
  },
  /**
   * Cập nhật cấu hình
   */
  update: (updates: {
    theme?: "system" | "light" | "dark";
    gridColumns?: 3 | 4 | 5;
    popupSize?: "small" | "medium" | "large";
    packOrder?: string[];
  }): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke("config:update", updates);
  },
  /**
   * Lắng nghe thay đổi config
   */
  onChanged: (
    callback: (config: {
      theme: "system" | "light" | "dark";
      gridColumns: 3 | 4 | 5;
      popupSize: "small" | "medium" | "large";
      packOrder: string[];
    }) => void
  ): (() => void) => {
    const handler = (_event: unknown, config: unknown) => {
      callback(config as Parameters<typeof callback>[0]);
    };
    ipcRenderer.on("config:changed", handler);
    return () => {
      ipcRenderer.removeListener("config:changed", handler);
    };
  },
};

export { sha256sum, versions, send, appAPI, windowAPI, stickerAPI, configAPI };
