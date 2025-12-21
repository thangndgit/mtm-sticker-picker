import Store from "electron-store";
import type { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import type {
  AppConfig,
  Theme,
  PopupSize,
  GridColumns,
} from "../../../../types/config.d.ts";
import { EventEmitter } from "node:events";

/**
 * Module quản lý cấu hình người dùng với electron-store.
 * Lưu trữ: theme, gridColumns, popupSize, packOrder
 */
class ConfigManagerModule implements AppModule {
  readonly #store: Store<AppConfig>;
  readonly #eventEmitter = new EventEmitter();
  readonly #defaultConfig: AppConfig = {
    theme: "system",
    gridColumns: 4,
    popupSize: "medium",
    packOrder: [],
    autoLaunch: false,
  };

  constructor() {
    this.#store = new Store<AppConfig>({
      name: "sticker-picker-config",
      defaults: this.#defaultConfig,
    });

    // Lắng nghe thay đổi từ store và emit event
    this.#store.onDidChange("theme", () => {
      this.#eventEmitter.emit(
        "config-changed",
        "theme",
        this.getConfig().theme
      );
    });
    this.#store.onDidChange("gridColumns", () => {
      this.#eventEmitter.emit(
        "config-changed",
        "gridColumns",
        this.getConfig().gridColumns
      );
    });
    this.#store.onDidChange("popupSize", () => {
      this.#eventEmitter.emit(
        "config-changed",
        "popupSize",
        this.getConfig().popupSize
      );
    });
    this.#store.onDidChange("packOrder", () => {
      this.#eventEmitter.emit(
        "config-changed",
        "packOrder",
        this.getConfig().packOrder
      );
    });
    this.#store.onDidChange("autoLaunch", () => {
      this.#eventEmitter.emit(
        "config-changed",
        "autoLaunch",
        this.getConfig().autoLaunch
      );
    });
  }

  enable({ app: electronApp }: ModuleContext): Promise<void> | void {
    console.log("[ConfigManager] Module initialized");
  }

  /**
   * Lấy toàn bộ cấu hình
   */
  getConfig(): AppConfig {
    return {
      theme: this.#store.get("theme", this.#defaultConfig.theme),
      gridColumns: this.#store.get(
        "gridColumns",
        this.#defaultConfig.gridColumns
      ),
      popupSize: this.#store.get("popupSize", this.#defaultConfig.popupSize),
      packOrder: this.#store.get("packOrder", this.#defaultConfig.packOrder),
      autoLaunch: this.#store.get("autoLaunch", this.#defaultConfig.autoLaunch),
    };
  }

  /**
   * Cập nhật theme
   */
  setTheme(theme: Theme): void {
    this.#store.set("theme", theme);
    console.log(`[ConfigManager] Theme updated to: ${theme}`);
  }

  /**
   * Cập nhật số cột grid
   */
  setGridColumns(columns: GridColumns): void {
    this.#store.set("gridColumns", columns);
    console.log(`[ConfigManager] Grid columns updated to: ${columns}`);
  }

  /**
   * Cập nhật kích thước popup
   */
  setPopupSize(size: PopupSize): void {
    this.#store.set("popupSize", size);
    console.log(`[ConfigManager] Popup size updated to: ${size}`);
  }

  /**
   * Cập nhật thứ tự pack
   */
  setPackOrder(packOrder: readonly string[]): void {
    this.#store.set("packOrder", packOrder);
    console.log(`[ConfigManager] Pack order updated`);
  }

  /**
   * Cập nhật toàn bộ config
   */
  updateConfig(updates: Partial<AppConfig>): void {
    const currentConfig = this.getConfig();
    const newConfig: AppConfig = { ...currentConfig, ...updates };

    // Chỉ set các giá trị không phải undefined/null
    if (newConfig.theme !== undefined && newConfig.theme !== null) {
      this.#store.set("theme", newConfig.theme);
    }
    if (newConfig.gridColumns !== undefined && newConfig.gridColumns !== null) {
      this.#store.set("gridColumns", newConfig.gridColumns);
    }
    if (newConfig.popupSize !== undefined && newConfig.popupSize !== null) {
      this.#store.set("popupSize", newConfig.popupSize);
    }
    if (newConfig.packOrder !== undefined && newConfig.packOrder !== null) {
      this.#store.set("packOrder", newConfig.packOrder);
    }
    if (newConfig.autoLaunch !== undefined && newConfig.autoLaunch !== null) {
      this.#store.set("autoLaunch", newConfig.autoLaunch);
    }

    console.log("[ConfigManager] Config updated:", newConfig);
  }

  /**
   * Lắng nghe thay đổi config
   */
  onConfigChange(
    callback: (key: keyof AppConfig, value: unknown) => void
  ): void {
    this.#eventEmitter.on("config-changed", callback);
  }

  /**
   * Hủy lắng nghe thay đổi config
   */
  offConfigChange(
    callback: (key: keyof AppConfig, value: unknown) => void
  ): void {
    this.#eventEmitter.off("config-changed", callback);
  }
}

// Singleton instance
let configManagerInstance: ConfigManagerModule | null = null;

export function createConfigManagerModule(
  ...args: ConstructorParameters<typeof ConfigManagerModule>
) {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManagerModule(...args);
  }
  return configManagerInstance;
}

export function getConfigManager(): ConfigManagerModule | null {
  return configManagerInstance;
}
