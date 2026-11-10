# Hệ Thống Quản Lý Kho Lưu Mẫu Thuốc Lá (Khatoco)

Hệ thống quản lý, định vị tọa độ kệ/ô/cột, in tem nhãn QR chuẩn công nghiệp và kiểm kê kho thuốc lá mẫu theo kiến trúc tách biệt **Frontend (Vercel)** — **Backend (Supabase RPC & RLS)** — **Database (PostgreSQL)**.

## Cấu trúc dự án

```text
Quanlykho/
├── frontend/                   # Giao diện Web (React 19 + Vite) triển khai trên Vercel
│   ├── public/                 # Tài nguyên tĩnh (favicon, icons)
│   ├── src/
│   │   ├── components/         # Các màn hình & thành phần giao diện (BentoDashboard, WarehouseAudit, MonthlyAnalytics, SearchLogsTab, UserVisitorManagerTab)
│   │   ├── services/           # Tầng giao tiếp API / Supabase (warehouseService, visitorService)
│   │   ├── utils/              # Các hàm tiện ích thuần túy (deviceUtils, formatters, giải mã SINGAPOREZ, tạo QR SVG)
│   │   ├── App.jsx             # Điều phối giao diện chính
│   │   ├── supabaseClient.js   # Khởi tạo kết nối Supabase Client
│   │   └── main.jsx            # Điểm khởi chạy ứng dụng React
│   ├── index.html              # Trang HTML gốc
│   └── vite.config.js          # Cấu hình đóng gói Vite
│
├── backend/                    # Logic nghiệp vụ máy chủ & Bảo mật trên Supabase
│   ├── rpc/                    # Stored Procedures (Atomic Transactions: duyệt mẫu, hoàn tác, đóng thùng)
│   ├── security/               # Chính sách bảo mật Row Level Security (RLS) & phân quyền Admin
│   └── scripts/                # Công cụ script vận hành & bảo trì dữ liệu
│
├── database/                   # Cơ sở dữ liệu PostgreSQL
│   ├── schema/                 # Cấu trúc bảng dữ liệu (supabase_setup.sql)
│   └── seeds/                  # Dữ liệu danh mục sản phẩm gốc (seed_products_only.sql, Danh sach.xlsx)
│
├── docs/                       # Tài liệu hướng dẫn, lộ trình kiến trúc & đặc tả nghiệp vụ
├── vercel.json                 # Cấu hình build & HTTP Security Headers trên Vercel
└── package.json                # Quản lý thư viện và lệnh chạy dự án
```

## Lệnh chạy dự án

```bash
# Chạy môi trường phát triển ở Local
npm run dev

# Đóng gói bản Production (xuất ra thư mục dist/)
npm run build
```
