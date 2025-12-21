/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import type { AppConfig } from "../../../../types/config.d.ts";
import type { StickerPack } from "../../../../types/sticker.d.ts";
import "./Settings.css";

/**
 * Component Settings - Giao diện cấu hình chính.
 * Hiển thị khi mở từ Tray Menu hoặc double-click vào Tray icon.
 */
function Settings() {
  const [appVersion, setAppVersion] = useState<string>("");
  const [originalConfig, setOriginalConfig] = useState<AppConfig | null>(null); // Config gốc từ server
  const [localConfig, setLocalConfig] = useState<AppConfig | null>(null); // Config local để chỉnh sửa
  const [packs, setPacks] = useState<readonly StickerPack[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedPackId, setDraggedPackId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const appAPI = (window as any).YXBwQVBJ;
        const configAPI = (window as any).Y29uZmlnQVBJ;
        const stickerAPI = (window as any)["c3RpY2tlckFQSQ=="];

        // Load version
        if (appAPI) {
          const version = await appAPI.getVersion();
          setAppVersion(version);
        }

        // Load config
        if (configAPI && typeof configAPI.get === "function") {
          const loadedConfig = await configAPI.get();
          setOriginalConfig(loadedConfig);
          setLocalConfig(loadedConfig);
        }

        // Load packs
        if (stickerAPI && typeof stickerAPI.getAll === "function") {
          const allPacks = await stickerAPI.getAll();
          setPacks(allPacks || []);
        }
      } catch (error) {
        console.error("[Settings] Error loading data:", error);
      }
    };

    loadData();
  }, []);

  // Kiểm tra xem có thay đổi không
  useEffect(() => {
    if (!originalConfig || !localConfig) {
      setHasChanges(false);
      return;
    }

    const changed =
      originalConfig.theme !== localConfig.theme ||
      originalConfig.gridColumns !== localConfig.gridColumns ||
      originalConfig.popupSize !== localConfig.popupSize ||
      originalConfig.autoLaunch !== localConfig.autoLaunch ||
      JSON.stringify(originalConfig.packOrder) !==
        JSON.stringify(localConfig.packOrder);

    setHasChanges(changed);
  }, [originalConfig, localConfig]);

  const handleSave = async () => {
    if (!localConfig || !hasChanges) return;

    setSaving(true);
    try {
      const configAPI = (window as any).Y29uZmlnQVBJ;
      if (configAPI && typeof configAPI.update === "function") {
        await configAPI.update(localConfig);
        setOriginalConfig(localConfig); // Cập nhật originalConfig sau khi save thành công
        setHasChanges(false);
      }
    } catch (error) {
      console.error("[Settings] Error saving config:", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!originalConfig) return;
    setLocalConfig(originalConfig); // Reset về config gốc
    setHasChanges(false);
  };

  const handleLocalChange = (updates: Partial<AppConfig>) => {
    if (!localConfig) return;
    setLocalConfig({ ...localConfig, ...updates });
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, packId: string) => {
    setDraggedPackId(packId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", packId);
    // Tạo drag image tùy chỉnh (optional)
    if (e.dataTransfer.setDragImage) {
      const dragImage = document.createElement("div");
      dragImage.style.opacity = "0.5";
      dragImage.style.position = "absolute";
      dragImage.style.top = "-1000px";
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (!localConfig || !draggedPackId || packs.length === 0) return;

    // Lấy danh sách tất cả pack IDs
    const allPackIds = packs.map((p) => p.id);
    let currentOrder = [...localConfig.packOrder];

    // Đảm bảo tất cả packs đều có trong order
    const missingPacks = allPackIds.filter((id) => !currentOrder.includes(id));
    if (missingPacks.length > 0) {
      currentOrder = [...currentOrder, ...missingPacks];
    }

    const draggedIndex = currentOrder.indexOf(draggedPackId);
    if (draggedIndex === -1) {
      console.error(`[Settings] Pack ${draggedPackId} not found in order`);
      return;
    }

    // Tính sortedPacks dựa trên currentOrder hiện tại
    const sortedPacks =
      packs.length > 0 && currentOrder.length > 0
        ? [...packs].sort((a, b) => {
            const aIndex = currentOrder.indexOf(a.id);
            const bIndex = currentOrder.indexOf(b.id);
            if (aIndex === -1 && bIndex === -1) return a.order - b.order;
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
          })
        : [...packs].sort((a, b) => a.order - b.order);

    const targetPackId = sortedPacks[dropIndex]?.id;
    if (!targetPackId || targetPackId === draggedPackId) return; // Không làm gì nếu drop vào chính nó

    const targetIndex = currentOrder.indexOf(targetPackId);
    if (targetIndex === -1) return;

    // Di chuyển pack từ draggedIndex đến targetIndex
    // Xử lý đúng cả khi drag lên hoặc xuống
    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);

    // Tính lại targetIndex sau khi xóa draggedIndex
    // Nếu drag từ trên xuống (draggedIndex < targetIndex), targetIndex giảm đi 1
    // Nếu drag từ dưới lên (draggedIndex > targetIndex), targetIndex không đổi
    const adjustedTargetIndex =
      draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    newOrder.splice(adjustedTargetIndex, 0, draggedPackId);

    handleLocalChange({ packOrder: newOrder });
  };

  const handleDragEnd = () => {
    setDraggedPackId(null);
    setDragOverIndex(null);
  };

  if (!localConfig) {
    return (
      <div className="settings-container">
        <div className="settings-loading">Loading settings...</div>
      </div>
    );
  }

  // Sort packs according to packOrder (if defined in config), otherwise by default order from s_data.json
  const sortedPacks =
    packs.length > 0 &&
    localConfig.packOrder &&
    localConfig.packOrder.length > 0
      ? [...packs].sort((a, b) => {
          const aIndex = localConfig.packOrder.indexOf(a.id);
          const bIndex = localConfig.packOrder.indexOf(b.id);
          if (aIndex === -1 && bIndex === -1) return a.order - b.order; // Fallback to default order
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        })
      : [...packs].sort((a, b) => a.order - b.order); // Default sort by order from s_data.json

  const shortcutText = navigator.platform.toLowerCase().includes("mac")
    ? "⌘ + Shift + X"
    : "Ctrl + Shift + X";

  return (
    <div className="settings-container" data-theme={localConfig.theme}>
      <div className="settings-header">
        <div
          className="settings-app-banner"
          onClick={() => {
            window.open(
              "https://github.com/thangndgit/mtm-sticker-picker",
              "_blank"
            );
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              window.open(
                "https://github.com/thangndgit/mtm-sticker-picker",
                "_blank"
              );
            }
          }}
          aria-label="Star mtm-sticker-picker on GitHub"
        ></div>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h2 className="settings-section-title">General</h2>

          <div className="settings-item">
            <label htmlFor="theme-select">Theme</label>
            <select
              id="theme-select"
              value={localConfig.theme}
              onChange={(e) =>
                handleLocalChange({
                  theme: e.target.value as AppConfig["theme"],
                })
              }
              className="settings-select"
            >
              <option value="system">Follow System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="settings-item">
            <label>Shortcut</label>
            <div className="settings-value">
              <kbd className="settings-kbd">{shortcutText}</kbd>
            </div>
          </div>

          <div className="settings-item">
            <label htmlFor="auto-launch-checkbox">Auto-launch on startup</label>
            <input
              id="auto-launch-checkbox"
              type="checkbox"
              checked={localConfig.autoLaunch || false}
              onChange={(e) =>
                handleLocalChange({ autoLaunch: e.target.checked })
              }
              className="settings-checkbox"
            />
          </div>
        </div>

        <div className="settings-section-divider"></div>

        <div className="settings-section">
          <h2 className="settings-section-title">Sticker Packs</h2>
          <div className="settings-pack-list">
            {(() => {
              // Tính toán currentOrder đầy đủ bao gồm tất cả packs
              const allPackIds = packs.map((p) => p.id);
              let currentOrder = [...localConfig.packOrder];
              // Thêm các packs chưa có vào cuối order
              const missingPacks = allPackIds.filter(
                (id) => !currentOrder.includes(id)
              );
              if (missingPacks.length > 0) {
                currentOrder = [...currentOrder, ...missingPacks];
              }

              return sortedPacks.map((pack, index) => {
                const thumbnailUrl =
                  pack.thumbnailUrl ||
                  (pack.stickers.length > 0 ? pack.stickers[0].url : null);
                const isDragging = draggedPackId === pack.id;
                const isDragOver = dragOverIndex === index;

                return (
                  <div
                    key={pack.id}
                    className={`settings-pack-item ${
                      isDragging ? "dragging" : ""
                    } ${isDragOver ? "drag-over" : ""}`}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, pack.id)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="settings-pack-drag-handle">
                      <span className="settings-pack-drag-icon">☰</span>
                    </div>
                    <div className="settings-pack-icon">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt={pack.displayName}
                          className="settings-pack-thumbnail"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            const fallback = document.createElement("span");
                            fallback.className = "settings-pack-fallback";
                            fallback.textContent = pack.displayName
                              .charAt(0)
                              .toUpperCase();
                            target.parentElement?.appendChild(fallback);
                          }}
                        />
                      ) : (
                        <span className="settings-pack-fallback">
                          {pack.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="settings-pack-info">
                      <span className="settings-pack-name">
                        {pack.displayName}
                      </span>
                      <span className="settings-pack-count">
                        {pack.stickers.length} stickers
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        <div className="settings-section-divider"></div>

        <div className="settings-section">
          <h2 className="settings-section-title">About</h2>
          <div className="settings-item">
            <label>Version</label>
            <div className="settings-value">{appVersion || "Loading..."}</div>
          </div>
          <div className="settings-item">
            <label>Author</label>
            <div className="settings-value">Matitmui</div>
          </div>
        </div>
      </div>

      {/* Sticky Save/Discard Buttons */}
      {hasChanges && (
        <div className="settings-save-bar">
          <button
            className="settings-discard-btn"
            onClick={handleDiscard}
            disabled={saving}
          >
            Discard
          </button>
          <button
            className="settings-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}

export default Settings;
