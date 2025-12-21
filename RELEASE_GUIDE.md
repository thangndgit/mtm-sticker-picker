# Hướng dẫn Build và Release App

## Tổng quan

Project này đã được setup sẵn với:
- ✅ **Auto-update**: Sử dụng `electron-updater` để tự động cập nhật app
- ✅ **GitHub Actions**: Tự động build và release khi push lên `main` branch
- ✅ **Multi-platform**: Build cho Windows, macOS, và Linux

## Các bước để Release App

### 1. Cập nhật Version

Trước khi release, cần cập nhật version trong `package.json`:

```json
{
  "version": "1.0.0"  // Tăng version theo semantic versioning (major.minor.patch)
}
```

**Semantic Versioning:**
- `1.0.0` → `1.0.1`: Patch (bug fixes)
- `1.0.0` → `1.1.0`: Minor (new features, backward compatible)
- `1.0.0` → `2.0.0`: Major (breaking changes)

### 2. Setup GitHub Token (Chỉ cần làm 1 lần)

Để GitHub Actions có thể publish releases, cần setup GitHub Personal Access Token:

1. Vào GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Tạo token mới với quyền:
   - `repo` (full control of private repositories)
   - `write:packages` (nếu cần)
3. Copy token và thêm vào GitHub Secrets:
   - Vào repo → Settings → Secrets and variables → Actions
   - Thêm secret mới: `GH_TOKEN` với value là token vừa tạo

**Lưu ý**: Nếu repo là public, có thể không cần token vì GitHub Actions có sẵn `GITHUB_TOKEN` với quyền đầy đủ.

### 3. Cấu hình electron-builder.mjs

File `electron-builder.mjs` đã được cấu hình với:

```javascript
publish: {
  provider: 'github',
  owner: 'thangndgit',
  repo: 'mtm-sticker-picker',
}
```

Điều này cho phép electron-builder publish releases lên GitHub Releases.

### 4. Release App

Có 2 cách để release:

#### Cách 1: Tự động qua GitHub Actions (Khuyến nghị)

1. **Commit và push code lên `main` branch:**
   ```bash
   git add .
   git commit -m "feat: new feature"
   git push origin main
   ```

2. **GitHub Actions sẽ tự động:**
   - Build app cho Windows, macOS, Linux
   - Chạy tests
   - Tạo GitHub Release với version từ `package.json`
   - Upload các file executable lên Releases
   - Tạo update files (`.yml`) cho auto-update

3. **Kiểm tra kết quả:**
   - Vào tab "Actions" trên GitHub để xem build progress
   - Vào tab "Releases" để xem release mới
   - Người dùng có thể tải app từ Releases page

#### Cách 2: Build và Release thủ công

Nếu muốn build và release thủ công:

```bash
# 1. Build app
npm run compile

# 2. Publish lên GitHub Releases (cần GH_TOKEN trong env)
export GH_TOKEN=your_github_token
npm run compile -- --publish always
```

**Lưu ý**: Cách này sẽ build cho platform hiện tại thôi. Để build multi-platform, nên dùng GitHub Actions.

### 5. Auto-update hoạt động như thế nào?

1. **Khi app chạy:**
   - `AutoUpdater` module sẽ tự động check updates từ GitHub Releases
   - Nếu có version mới, sẽ download và cài đặt tự động

2. **Update files:**
   - Electron-builder tạo các file `.yml` (latest.yml, latest-mac.yml, etc.)
   - Các file này chứa metadata về version mới nhất
   - App sẽ check các file này để biết có update không

3. **Distribution Channel:**
   - Có thể setup nhiều channels (stable, beta, alpha)
   - Mỗi channel có releases riêng
   - Set `VITE_DISTRIBUTION_CHANNEL` trong env để chọn channel

### 6. Người dùng tải App như thế nào?

Sau khi release, người dùng có thể:

1. **Tải từ GitHub Releases:**
   - Vào: `https://github.com/thangndgit/mtm-sticker-picker/releases`
   - Tải file phù hợp với OS của họ:
     - Windows: `.exe` hoặc `.exe` installer
     - macOS: `.dmg` hoặc `.pkg`
     - Linux: `.deb` hoặc `.AppImage`

2. **Auto-update:**
   - Sau khi cài đặt, app sẽ tự động check và update khi có version mới
   - Không cần tải lại từ GitHub

## Cấu trúc Release

Mỗi release sẽ chứa:

```
v1.0.0/
├── Matitmui Sticker Picker-1.0.0-win-x64.exe
├── Matitmui Sticker Picker-1.0.0-win-x64.exe.sig
├── Matitmui Sticker Picker-1.0.0-mac-x64.dmg
├── Matitmui Sticker Picker-1.0.0-mac-arm64.dmg
├── Matitmui Sticker Picker-1.0.0-linux-x64.deb
├── latest.yml (Windows)
├── latest-mac.yml (macOS)
└── latest-linux.yml (Linux)
```

## Troubleshooting

### Build fails trên GitHub Actions

- Kiểm tra logs trong tab "Actions"
- Đảm bảo `package.json` có version hợp lệ
- Kiểm tra GitHub token có đủ quyền

### Auto-update không hoạt động

- Kiểm tra `publish` config trong `electron-builder.mjs`
- Đảm bảo release có đầy đủ `.yml` files
- Kiểm tra app có quyền write vào thư mục cài đặt

### Release không xuất hiện trên GitHub

- Kiểm tra GitHub Actions workflow có chạy không
- Kiểm tra `GH_TOKEN` secret có đúng không
- Xem logs trong GitHub Actions để biết lỗi cụ thể

## Tài liệu tham khảo

- [Electron Builder Docs](https://www.electron.build/)
- [Electron Updater Docs](https://www.electron.build/auto-update)
- [GitHub Releases API](https://docs.github.com/en/rest/releases)

