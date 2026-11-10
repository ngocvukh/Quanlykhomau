# Database (PostgreSQL Schema & Seeds) — Quản Lý Kho Thuốc Lá Mẫu

Thư mục này chứa cấu trúc bảng dữ liệu (Schema) và dữ liệu danh mục sản phẩm gốc (Seeds) trên Supabase.

## Cấu trúc thư mục
- **`schema/`**
  - `supabase_setup.sql`: Khởi tạo các bảng cốt lõi (`profiles`, `products`, `boxes`, `samples`, `transactions`, `slot_configs`, `search_logs`, `visitor_resets`, `destruction_logs`, `bulk_import_drafts`).
- **`seeds/`**
  - `seed_products_only.sql`: Dữ liệu danh mục sản phẩm thuốc lá chuẩn hóa (Nội địa & Xuất khẩu).
  - `Danh sach.xlsx`: Bảng Excel danh mục sản phẩm gốc và định dạng bao (`Kingsize`, `SuperSlim`, `Slim`, `Demi`, `Semi`).
