/**
 * Type definitions cho Sticker data structures
 */

/**
 * Một sticker item đơn lẻ
 */
export interface StickerItem {
  /** Unique identifier của sticker (format: packId_index) */
  readonly id: string;
  /** Tên file của sticker (không bao gồm extension) */
  readonly name: string;
  /** Đường dẫn file tương đối từ sticker_data (format: pack_[name]/s_[index].[ext]) */
  readonly path: string;
  /** ID của pack chứa sticker này */
  readonly packId: string;
  /** Đường dẫn đầy đủ để truy cập qua protocol ảo (format: sticker://pack_[name]/s_[index].[ext]) */
  readonly url: string;
}

/**
 * Một sticker pack (bộ sticker)
 */
export interface StickerPack {
  /** Unique identifier của pack (format: pack[pack_name]) */
  readonly id: string;
  /** Tên thư mục của pack (format: pack[pack_name]) */
  readonly name: string;
  /** Tên hiển thị của pack (từ s_data.json) */
  readonly displayName: string;
  /** Thứ tự mặc định của pack (từ s_data.json) */
  readonly order: number;
  /** URL của thumbnail pack (s_thumb) */
  readonly thumbnailUrl?: string;
  /** Danh sách các sticker trong pack */
  readonly stickers: readonly StickerItem[];
}

