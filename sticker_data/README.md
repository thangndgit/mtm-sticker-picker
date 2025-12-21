# Sticker Data Directory

Thư mục này chứa tất cả các sticker packs cho ứng dụng Sticker Picker.

## Cấu trúc thư mục

```
sticker_data/
├── pack_[name]/
│   ├── s_1.png
│   ├── s_2.png
│   ├── s_3.jpg
│   └── ...
├── pack_[name2]/
│   ├── s_1.png
│   ├── s_2.png
│   └── ...
└── ...
```

## Quy tắc đặt tên

### Thư mục Pack
- Tên thư mục phải bắt đầu bằng `pack_` (ví dụ: `pack_default`, `pack_animals`, `pack_emotions`)
- Sau `pack_` có thể là bất kỳ tên nào (chỉ dùng chữ cái, số, và dấu gạch dưới)
- Ví dụ hợp lệ:
  - `pack_default`
  - `pack_animals`
  - `pack_food_drinks`
  - `pack_emoji_2024`

### File Sticker
- Tên file phải bắt đầu bằng `s_` (ví dụ: `s_1.png`, `s_2.jpg`)
- Sau `s_` phải là số (index của sticker)
- Định dạng file hỗ trợ: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`
- Ví dụ hợp lệ:
  - `s_1.png`
  - `s_2.jpg`
  - `s_10.gif`
  - `s_100.webp`

## Metadata

Display name của mỗi pack được định nghĩa trong code tại:
`packages/main/src/modules/StickerManagerModule.ts`

Nếu pack không có trong metadata, tên hiển thị sẽ được tự động format từ tên thư mục:
- `pack_default` → "Default Pack"
- `pack_animals` → "Animals Pack"
- `pack_food_drinks` → "Food Drinks Pack"

## Ví dụ cấu trúc hoàn chỉnh

```
sticker_data/
├── pack_default/
│   ├── s_1.png
│   ├── s_2.png
│   └── s_3.png
├── pack_animals/
│   ├── s_1.png
│   ├── s_2.png
│   └── s_3.png
└── pack_emotions/
    ├── s_1.png
    ├── s_2.png
    └── s_3.png
```

## Lưu ý

- Thư mục này sẽ được tự động tạo khi app chạy lần đầu nếu chưa tồn tại
- Stickers sẽ được sắp xếp theo index (số sau `s_`)
- Ảnh sẽ được hiển thị qua protocol ảo `sticker://` để đảm bảo bảo mật

