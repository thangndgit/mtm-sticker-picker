/**
 * Type definitions cho User Configuration
 */

export type Theme = "system" | "light" | "dark";

export type PopupSize = "small" | "medium" | "large";

export type GridColumns = 3 | 4 | 5;

export interface AppConfig {
  theme: Theme;
  gridColumns: GridColumns;
  popupSize: PopupSize;
  packOrder: readonly string[]; // Mảng ID các pack để sắp xếp thứ tự hiển thị
  autoLaunch: boolean; // Tự động khởi động cùng OS
}
