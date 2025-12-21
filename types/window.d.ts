import type { StickerPack } from "./sticker.d.ts";
import type { AppConfig } from "./config.d.ts";

/**
 * Type definitions cho window API từ Preload
 */
interface Window {
  // Base64 encoded keys từ preload exposed.ts
  // appAPI
  YXBwQVBJ?: {
    getVersion: () => Promise<string>;
  };
  // windowAPI
  d2luZG93QVBJ?: {
    close: () => Promise<void>;
    minimize: () => Promise<void>;
    checkClickOutside: (mouseX: number, mouseY: number) => Promise<boolean>;
    resizeToContent: (width: number, height: number) => Promise<void>;
    openSettings: () => Promise<{ success: boolean; error?: string }>;
  };
  // stickerAPI (base64 của "stickerAPI" là "c3RpY2tlckFQSQ==")
  c3RpY2tlckFQSQ?: {
    getAll: () => Promise<readonly Omit<StickerPack, 'stickers'>[]>;
    getPackStickers: (packId: string) => Promise<{ success: boolean; stickers: readonly StickerItem[]; error?: string }>;
    select: (
      stickerPath: string
    ) => Promise<{ success: boolean; error?: string }>;
    getRecent: () => Promise<string[]>;
    refresh: () => Promise<{
      success: boolean;
      packs?: readonly Omit<StickerPack, 'stickers'>[];
      error?: string;
    }>;
    onRecentUpdated: (callback: (paths: string[]) => void) => () => void;
  };
  // configAPI (base64 của "configAPI" là "Y29uZmlnQVBJ")
  Y29uZmlnQVBJ?: {
    get: () => Promise<AppConfig | null>;
    update: (
      updates: Partial<AppConfig>
    ) => Promise<{ success: boolean; error?: string }>;
    onChanged: (callback: (config: AppConfig) => void) => () => void;
  };
}
