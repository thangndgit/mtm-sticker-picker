import { app } from "electron";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

/**
 * Lấy đường dẫn đến App icon.
 * Sử dụng icon từ folder icons ở root project.
 * Dùng cho BrowserWindow icon, Tray icon, v.v.
 */
export function getAppIconPath(): string {
  const appPath = app.getAppPath();

  // Trong development: icons ở root project
  // Trong production: icons được copy vào extraResources
  let iconPath: string;

  if (import.meta.env.DEV) {
    // Development: Tìm từ thư mục hiện tại (dist) lên root
    const appDir = dirname(fileURLToPath(import.meta.url));
    // Từ dist/utils/ lên root: dist/utils -> dist -> packages -> root
    const iconsPath = join(appDir, "..", "..", "..", "icons");

    // Chọn icon phù hợp với platform
    if (process.platform === "win32") {
      iconPath = join(iconsPath, "favicon.ico");
    } else if (process.platform === "darwin") {
      // macOS có thể dùng PNG (sẽ được convert tự động nếu cần)
      iconPath = join(iconsPath, "apple-icon-180x180.png");
    } else {
      // Linux
      iconPath = join(iconsPath, "android-icon-192x192.png");
    }
  } else {
    // Production: Tìm trong resources/icons (từ extraResources)
    const resourcesPath = process.resourcesPath || appPath;
    const iconsPath = join(resourcesPath, "icons");

    if (process.platform === "win32") {
      iconPath = join(iconsPath, "favicon.ico");
    } else if (process.platform === "darwin") {
      iconPath = join(iconsPath, "apple-icon-180x180.png");
    } else {
      iconPath = join(iconsPath, "android-icon-192x192.png");
    }
  }

  return iconPath;
}

