/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import type { StickerPack, StickerItem } from "../../../../types/sticker.d.ts";
import type { AppConfig } from "../../../../types/config.d.ts";
import "./Picker.css";

/**
 * Component Picker - Giao diện popup nhỏ để chọn sticker.
 * Hiển thị khi người dùng nhấn global shortcut (CommandOrControl+Shift+X).
 */
function Picker() {
  // Pack metadata (không có stickers) - load ngay để hiển thị nav
  const [packMetadata, setPackMetadata] = useState<
    readonly Omit<StickerPack, "stickers">[]
  >([]);
  // Cache stickers đã load - lazy load khi click vào pack
  const [stickersCache, setStickersCache] = useState<
    Map<string, readonly StickerItem[]>
  >(new Map());
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clickingStickerId, setClickingStickerId] = useState<string | null>(
    null
  );
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [recentStickerPaths, setRecentStickerPaths] = useState<string[]>([]);
  const [recentStickers, setRecentStickers] = useState<readonly StickerItem[]>(
    []
  );
  const [loadingStickers, setLoadingStickers] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  // Load pack metadata (không load stickers) khi mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const configAPI = (window as any).Y29uZmlnQVBJ;
        const stickerAPI = (window as any)["c3RpY2tlckFQSQ=="];

        // Load config
        if (configAPI && typeof configAPI.get === "function") {
          const loadedConfig = await configAPI.get();
          setConfig(loadedConfig);
        }

        // Load pack metadata (không load stickers để tiết kiệm RAM)
        if (stickerAPI && typeof stickerAPI.getAll === "function") {
          const allPacks = await stickerAPI.getAll();
          // Chỉ lưu metadata (không có stickers)
          const metadata = (allPacks || []).map(
            (pack: Omit<StickerPack, "stickers">) => ({
              id: pack.id,
              name: pack.name,
              displayName: pack.displayName,
              order: pack.order,
              thumbnailUrl: pack.thumbnailUrl,
            })
          );
          setPackMetadata(metadata);

          // Load recent stickers paths
          if (stickerAPI.getRecent) {
            const recentPaths = await stickerAPI.getRecent();
            setRecentStickerPaths(recentPaths);
          }
        }
      } catch (error) {
        console.error("[Picker] Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Reload recent stickers từ cache hoặc API
  const reloadRecentStickers = useCallback(
    async (paths: string[]) => {
      const recentItems: StickerItem[] = [];
      const missingPaths = new Set<string>(paths);

      // Tìm stickers từ cache trước
      for (const [, stickers] of stickersCache.entries()) {
        for (const sticker of stickers) {
          if (paths.includes(sticker.path)) {
            recentItems.push(sticker);
            missingPaths.delete(sticker.path);
          }
        }
      }

      // Nếu chưa đủ, load từ API (lazy load từng pack)
      if (missingPaths.size > 0) {
        const stickerAPI = (window as any)["c3RpY2tlckFQSQ=="];
        if (stickerAPI && typeof stickerAPI.getPackStickers === "function") {
          // Tìm các pack IDs cần load
          const packsToLoad = new Set<string>();
          for (const path of missingPaths) {
            // Extract packId từ path (format: pack[pack_name]/s_00.png)
            const match = path.match(/^pack\[([^\]]+)\]/);
            if (match) {
              // Tìm pack metadata để lấy pack.id (name từ s_data.json)
              const packMeta = packMetadata.find(
                (p) => p.name === `pack[${match[1]}]`
              );
              if (packMeta) {
                packsToLoad.add(packMeta.id);
              }
            }
          }

          // Load stickers từng pack
          for (const packId of packsToLoad) {
            try {
              const result = await stickerAPI.getPackStickers(packId);
              if (result.success && result.stickers) {
                // Cache stickers
                setStickersCache((prev) =>
                  new Map(prev).set(packId, result.stickers)
                );
                // Thêm vào recent items
                for (const sticker of result.stickers) {
                  if (
                    paths.includes(sticker.path) &&
                    !recentItems.find((item) => item.path === sticker.path)
                  ) {
                    recentItems.push(sticker);
                  }
                }
              }
            } catch (error) {
              console.error(
                `[Picker] Error loading pack ${packId} for recent:`,
                error
              );
            }
          }
        }
      }

      // Sort by recentPaths order
      recentItems.sort((a, b) => {
        const aIndex = paths.indexOf(a.path);
        const bIndex = paths.indexOf(b.path);
        return aIndex - bIndex;
      });
      setRecentStickers(recentItems);
    },
    [stickersCache, packMetadata]
  );

  // Lắng nghe recent stickers updates
  useEffect(() => {
    const stickerAPI = (window as any)["c3RpY2tlckFQSQ=="];
    if (stickerAPI && typeof stickerAPI.onRecentUpdated === "function") {
      const unsubscribe = stickerAPI.onRecentUpdated((paths: string[]) => {
        setRecentStickerPaths(paths);
        // Reload recent stickers từ cache hoặc API
        reloadRecentStickers(paths);
      });
      return unsubscribe;
    }
  }, [reloadRecentStickers]);

  // Load recent stickers khi có recentStickerPaths
  useEffect(() => {
    if (recentStickerPaths.length > 0) {
      reloadRecentStickers(recentStickerPaths);
    }
  }, [recentStickerPaths, reloadRecentStickers]);

  // Load stickers của một pack khi được chọn (lazy loading)
  useEffect(() => {
    if (!selectedPackId || selectedPackId === "recent") return;

    // Nếu đã có trong cache, không load lại
    if (stickersCache.has(selectedPackId)) return;

    const loadPackStickers = async () => {
      setLoadingStickers(selectedPackId);
      try {
        const stickerAPI = (window as any)["c3RpY2tlckFQSQ=="];
        if (stickerAPI && typeof stickerAPI.getPackStickers === "function") {
          // Gọi API mới để chỉ load stickers của pack này (lazy load từ Main process)
          const result = await stickerAPI.getPackStickers(selectedPackId);
          if (result.success && result.stickers) {
            // Cache stickers của pack này
            setStickersCache((prev) =>
              new Map(prev).set(selectedPackId, result.stickers)
            );
            // Reload recent nếu cần
            if (recentStickerPaths.length > 0) {
              reloadRecentStickers(recentStickerPaths);
            }
          } else {
            console.error(
              `[Picker] Failed to load stickers for pack ${selectedPackId}:`,
              result.error
            );
          }
        } else {
          console.error("[Picker] stickerAPI.getPackStickers not found");
        }
      } catch (error) {
        console.error(
          `[Picker] Error loading stickers for pack ${selectedPackId}:`,
          error
        );
      } finally {
        setLoadingStickers(null);
      }
    };

    loadPackStickers();
  }, [selectedPackId, stickersCache, recentStickerPaths, reloadRecentStickers]);

  // Cleanup cache khi chuyển pack (chỉ giữ lại pack đang chọn và recent)
  useEffect(() => {
    // Giữ lại cache cho pack đang chọn và các packs có stickers trong recent
    const keepPacks = new Set<string>();
    if (selectedPackId && selectedPackId !== "recent") {
      keepPacks.add(selectedPackId);
    }
    // Thêm các packs có stickers trong recent
    for (const sticker of recentStickers) {
      keepPacks.add(sticker.packId);
    }

    // Cleanup cache
    setStickersCache((prev) => {
      const newCache = new Map<string, readonly StickerItem[]>();
      for (const [packId, stickers] of prev.entries()) {
        if (keepPacks.has(packId)) {
          newCache.set(packId, stickers);
        }
      }
      return newCache;
    });
  }, [selectedPackId, recentStickers]);

  // Lắng nghe config changes
  useEffect(() => {
    const configAPI = (window as any).Y29uZmlnQVBJ;
    if (configAPI && typeof configAPI.onChanged === "function") {
      const unsubscribe = configAPI.onChanged((newConfig: AppConfig) => {
        setConfig(newConfig);
        // Update grid columns CSS variable
        if (gridRef.current) {
          gridRef.current.style.setProperty(
            "--grid-cols",
            String(newConfig.gridColumns)
          );
        }
      });
      return unsubscribe;
    }
  }, []);

  // Set initial grid columns
  useEffect(() => {
    if (config && gridRef.current) {
      gridRef.current.style.setProperty(
        "--grid-cols",
        String(config.gridColumns)
      );
    }
  }, [config]);

  // Auto-select pack based on config packOrder or first pack
  useEffect(() => {
    if (packMetadata.length > 0 && !selectedPackId) {
      if (config?.packOrder && config.packOrder.length > 0) {
        const firstOrderedPack = packMetadata.find((p) =>
          config.packOrder.includes(p.id)
        );
        if (firstOrderedPack) {
          setSelectedPackId(firstOrderedPack.id);
          return;
        }
      }
      setSelectedPackId(packMetadata[0].id);
    }
  }, [packMetadata, config, selectedPackId]);

  // Sort packs: Ưu tiên packOrder từ config (nếu user đã sửa), nếu không thì dùng order từ s_data.json
  const sortedPacks =
    packMetadata.length > 0 && config?.packOrder && config.packOrder.length > 0
      ? [...packMetadata].sort((a, b) => {
          const aIndex = config.packOrder.indexOf(a.id);
          const bIndex = config.packOrder.indexOf(b.id);
          if (aIndex === -1 && bIndex === -1) return a.order - b.order;
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        })
      : [...packMetadata].sort((a, b) => a.order - b.order);

  // Tạo selectedPack từ metadata và cache
  const selectedPack = useMemo(() => {
    if (selectedPackId === "recent") {
      return {
        id: "recent",
        name: "recent",
        displayName: "Recent",
        order: 0,
        stickers: recentStickers,
      } as StickerPack;
    }
    const metadata = packMetadata.find((p) => p.id === selectedPackId);
    if (!metadata || !selectedPackId) return null;
    const stickers = stickersCache.get(selectedPackId) || [];
    return {
      ...metadata,
      stickers,
    } as StickerPack;
  }, [selectedPackId, packMetadata, stickersCache, recentStickers]);

  // Reset highlighted index khi chuyển pack
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [selectedPackId]);

  const handleStickerClick = useCallback(
    async (sticker: StickerItem) => {
      if (clickingStickerId === sticker.id) return;
      setClickingStickerId(sticker.id);
      try {
        const stickerAPI = (window as any)["c3RpY2tlckFQSQ=="];
        if (stickerAPI && typeof stickerAPI.select === "function") {
          const result = await stickerAPI.select(sticker.path);
          if (!result.success) {
            console.error(`[Picker] Failed to select sticker:`, result.error);
          }
        } else {
          console.error(
            "[Picker] stickerAPI not found or select is not a function"
          );
        }
      } catch (error) {
        console.error("[Picker] Error selecting sticker:", error);
      } finally {
        setTimeout(() => {
          setClickingStickerId(null);
        }, 200);
      }
    },
    [clickingStickerId]
  );

  // Keyboard shortcuts: Esc, Arrow keys, Enter
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedPack || selectedPack.stickers.length === 0) {
        // Only handle ESC if no stickers are present
        if (event.key === "Escape") {
          const windowAPI = (window as any).d2luZG93QVBJ;
          if (windowAPI) {
            windowAPI.close();
          }
        }
        return;
      }

      switch (event.key) {
        case "Escape": {
          // ESC: Close popup with fade out
          event.preventDefault();
          const windowAPI = (window as any).d2luZG93QVBJ;
          if (windowAPI) {
            const container = containerRef.current;
            if (container) {
              container.style.transition = "opacity 0.2s";
              container.style.opacity = "0";
              setTimeout(() => {
                windowAPI.close();
              }, 200);
            } else {
              windowAPI.close();
            }
          }
          break;
        }

        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          // Arrow keys: Move highlight
          event.preventDefault();
          const currentIndex = highlightedIndex === -1 ? 0 : highlightedIndex;
          const gridColumns = config?.gridColumns || 4;
          let newIndex = currentIndex;

          if (event.key === "ArrowUp") {
            newIndex = Math.max(0, currentIndex - gridColumns);
          } else if (event.key === "ArrowDown") {
            newIndex = Math.min(
              selectedPack.stickers.length - 1,
              currentIndex + gridColumns
            );
          } else if (event.key === "ArrowLeft") {
            newIndex = Math.max(0, currentIndex - 1);
          } else if (event.key === "ArrowRight") {
            newIndex = Math.min(
              selectedPack.stickers.length - 1,
              currentIndex + 1
            );
          }

          setHighlightedIndex(newIndex);
          // Scroll into view if needed
          setTimeout(() => {
            if (highlightedRef.current) {
              highlightedRef.current.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 0);
          break;
        }

        case "Enter":
          // Enter: Select highlighted sticker
          if (
            highlightedIndex >= 0 &&
            highlightedIndex < selectedPack.stickers.length
          ) {
            event.preventDefault();
            const sticker = selectedPack.stickers[highlightedIndex];
            handleStickerClick(sticker);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedPack, highlightedIndex, config?.gridColumns, handleStickerClick]);

  // Xử lý wheel scroll trên nav để scroll ngang
  useEffect(() => {
    const navElement = navRef.current;
    if (!navElement) return;

    const handleWheel = (e: WheelEvent) => {
      // Kiểm tra xem có thể scroll ngang không
      const canScrollHorizontal =
        navElement.scrollWidth > navElement.clientWidth;

      if (!canScrollHorizontal) {
        // Không có gì để scroll, không làm gì
        return;
      }

      // Chỉ xử lý khi đang hover vào nav
      const rect = navElement.getBoundingClientRect();
      const isHovering =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (isHovering) {
        // Prevent default vertical scroll
        e.preventDefault();
        e.stopPropagation();

        // Scroll ngang thay vì dọc
        // Sử dụng deltaY để scroll ngang (wheel down = scroll right)
        const scrollAmount = e.deltaY;
        const currentScroll = navElement.scrollLeft;
        const maxScroll = navElement.scrollWidth - navElement.clientWidth;

        // Tính toán scroll position mới
        let newScroll = currentScroll + scrollAmount;
        newScroll = Math.max(0, Math.min(maxScroll, newScroll));

        navElement.scrollLeft = newScroll;
      }
    };

    navElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      navElement.removeEventListener("wheel", handleWheel);
    };
  }, [packMetadata, recentStickers]); // Re-run khi có thay đổi packs

  const gridColumns = config?.gridColumns || 4;

  return (
    <div
      className="picker-container"
      data-theme={config?.theme || "system"}
      ref={containerRef}
    >
      <div className="picker-header">
        <div className="picker-header-title">
          <img
            src="/icons/favicon-32x32.png"
            alt="App Logo"
            className="picker-logo"
          />
          <h2>Matitmui Sticker Picker</h2>
        </div>
        <div className="picker-header-actions">
          <button
            className="picker-header-btn picker-header-btn-settings"
            onClick={async () => {
              const windowAPI = (window as any).d2luZG93QVBJ;
              if (windowAPI && typeof windowAPI.openSettings === "function") {
                await windowAPI.openSettings();
              }
            }}
            title="Settings"
          >
            ⚙️
          </button>
          <button
            className="picker-header-btn picker-header-btn-close"
            onClick={async () => {
              const windowAPI = (window as any).d2luZG93QVBJ;
              if (windowAPI && typeof windowAPI.close === "function") {
                await windowAPI.close();
              }
            }}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {loading ? (
        <div className="picker-content">
          <p className="picker-placeholder">Loading stickers...</p>
        </div>
      ) : packMetadata.length === 0 && recentStickers.length === 0 ? (
        <div className="picker-content">
          <p className="picker-placeholder">
            No sticker packs found.
            <br />
            <small>
              Create sticker_data folder with pack[name] subfolders.
            </small>
          </p>
        </div>
      ) : (
        <>
          {/* Navigation - Horizontal scroll */}
          <div className="picker-navigation" ref={navRef}>
            <div className="picker-navigation-scroll">
              {/* Recent Tab */}
              {recentStickers.length > 0 && (
                <button
                  className={`picker-nav-item ${
                    selectedPackId === "recent" ? "active" : ""
                  }`}
                  onClick={() => setSelectedPackId("recent")}
                  title="Recent Stickers"
                >
                  <span className="picker-nav-icon">🕒</span>
                </button>
              )}
              {/* Pack Tabs */}
              {sortedPacks.map((pack) => {
                const thumbnailUrl = pack.thumbnailUrl;
                return (
                  <button
                    key={pack.id}
                    className={`picker-nav-item ${
                      selectedPackId === pack.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedPackId(pack.id)}
                    title={pack.displayName}
                  >
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt={pack.displayName}
                        className="picker-nav-thumbnail"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = "none";
                          const fallback = document.createElement("span");
                          fallback.className = "picker-nav-fallback";
                          fallback.textContent = pack.displayName
                            .charAt(0)
                            .toUpperCase();
                          target.parentElement?.appendChild(fallback);
                        }}
                      />
                    ) : (
                      <span className="picker-nav-fallback">
                        {pack.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sticker Grid - Vertical scroll */}
          <div className="picker-content" ref={gridRef}>
            {loadingStickers === selectedPackId ? (
              <p className="picker-placeholder">Loading stickers...</p>
            ) : selectedPack && selectedPack.stickers.length > 0 ? (
              <div
                className="picker-grid"
                style={{ "--grid-cols": gridColumns } as React.CSSProperties}
              >
                {selectedPack.stickers.map(
                  (sticker: StickerItem, index: number) => {
                    const isHighlighted = highlightedIndex === index;
                    return (
                      <div
                        key={sticker.id}
                        ref={
                          isHighlighted
                            ? (el) => {
                                highlightedRef.current = el;
                              }
                            : null
                        }
                        className={`picker-sticker-item ${
                          clickingStickerId === sticker.id ? "clicking" : ""
                        } ${isHighlighted ? "highlighted" : ""}`}
                        onClick={() => {
                          setHighlightedIndex(index);
                          handleStickerClick(sticker);
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <img
                          src={sticker.url}
                          alt={sticker.name}
                          loading="lazy"
                          onError={(e) => {
                            console.error(
                              `[Picker] Failed to load image: ${sticker.url}`,
                              e
                            );
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                        {clickingStickerId === sticker.id && (
                          <div className="picker-sticker-loading">
                            <div className="picker-sticker-spinner"></div>
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <p className="picker-placeholder">
                {selectedPackId === "recent"
                  ? "No recent stickers yet."
                  : "No stickers in this pack."}
              </p>
            )}
          </div>
        </>
      )}

      <div
        className="picker-footer"
        onClick={async () => {
          const windowAPI = (window as any).d2luZG93QVBJ;
          if (windowAPI && typeof windowAPI.close === "function") {
            await windowAPI.close();
          }
        }}
      >
        <p className="picker-hint">Press ESC to close</p>
      </div>
    </div>
  );
}

export default Picker;
