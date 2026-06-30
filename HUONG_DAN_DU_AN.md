# 📦 Tài liệu Dự án: Webapp Quản lý Kho Lưu Thuốc Lá Mẫu

> **Cập nhật lần cuối**: 30/06/2026  
> **Tác giả**: Ngọc Vũ  
> **GitHub**: https://github.com/ngocvukh/Quanlykhomau  
> **Website chạy thật**: https://quanlykhomau.vercel.app (hoặc link Vercel của bạn)  
> **Database**: Supabase — `https://obfdrpqnntylboptkwin.supabase.co`

---

## 📋 Mục lục
1. [Tổng quan dự án](#1-tổng-quan-dự-án)
2. [Công nghệ sử dụng](#2-công-nghệ-sử-dụng)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Cài đặt & Chạy Local](#4-cài-đặt--chạy-local)
5. [Cấu hình Supabase (Database)](#5-cấu-hình-supabase-database)
6. [Triển khai lên Vercel](#6-triển-khai-lên-vercel)
7. [Tạo tài khoản Admin](#7-tạo-tài-khoản-admin)
8. [Các tính năng chính](#8-các-tính-năng-chính)
9. [Quy tắc nghiệp vụ quan trọng](#9-quy-tắc-nghiệp-vụ-quan-trọng)
10. [Cách đẩy code lên Git sau khi cập nhật](#10-cách-đẩy-code-lên-git-sau-khi-cập-nhật)
11. [Cấu trúc Database (Supabase)](#11-cấu-trúc-database-supabase)
12. [Xử lý sự cố thường gặp](#12-xử-lý-sự-cố-thường-gặp)

---

## 1. Tổng quan dự án

Hệ thống quản lý kho lưu giữ thuốc lá mẫu nội bộ dành cho bộ phận QC (Kiểm soát chất lượng). Ứng dụng giúp:

- Nhập kho / xuất kho mẫu thuốc lá theo từng lô (mẻ sợi + thùng)
- Quản lý vị trí lưu trữ trên **6 kệ kho (A–F)**, mỗi kệ **5 ô**, mỗi ô nhiều **cột** xếp chồng
- Tự động gợi ý vị trí lưu tối ưu khi nhập kho
- Quản lý yêu cầu cấp mẫu từ nhân viên (Staff) và phê duyệt từ Admin
- Tự động chuyển mẫu lẻ về **Ô 5 (Ô lẻ)** khi số lượng bao lẻ (không chia hết 10)
- Đóng thùng khi kệ quá tải, hủy mẫu đã quá 12 tháng
- Xuất QR code nhãn dán, in báo cáo PDF

---

## 2. Công nghệ sử dụng

| Thành phần | Công nghệ |
|-----------|-----------|
| Front-end | React (Vite) + Vanilla CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Email/Password) |
| Hosting | Vercel (tự động deploy từ GitHub) |
| Icon | Lucide React |
| QR Code | html5-qrcode |
| Source control | Git + GitHub |

---

## 3. Cấu trúc thư mục

```
H:\Quanlykho\
├── src\
│   ├── App.jsx              ← Toàn bộ logic + giao diện chính
│   ├── App.css              ← Style riêng của App
│   ├── index.css            ← Hệ thống CSS toàn cục (dark mode, glassmorphism...)
│   ├── main.jsx             ← Điểm khởi chạy React
│   ├── supabaseClient.js    ← Kết nối Supabase SDK
│   └── assets\              ← Hình ảnh, icon
├── public\
│   ├── favicon.svg
│   └── icons.svg
├── .env                     ← Biến môi trường (KHÔNG đẩy lên Git)
├── .gitignore               ← Bảo vệ .env, node_modules, dist
├── supabase_setup.sql       ← Script tạo bảng + nạp 350 sản phẩm
├── Danh sach.xlsx           ← File Excel danh sách sản phẩm gốc
├── Yeucau.md                ← Đặc tả yêu cầu nghiệp vụ ban đầu
├── package.json
├── vite.config.js
└── index.html
```

---

## 4. Cài đặt & Chạy Local

### Yêu cầu
- Node.js >= 18
- npm >= 9

### Các bước

```powershell
# 1. Clone repo từ GitHub
git clone https://github.com/ngocvukh/Quanlykhomau
cd Quanlykhomau

# 2. Cài đặt thư viện
npm install

# 3. Tạo file .env và điền thông tin Supabase
# (Xem mục 5 bên dưới để lấy URL và Key)
copy .env.example .env
# Sau đó mở .env và điền vào

# 4. Chạy server local
npm run dev
# Mở trình duyệt tại http://localhost:5173
```

### Nội dung file `.env`

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://obfdrpqnntylboptkwin.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZmRycHFubnR5bGJvcHRrd2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTY1NjgsImV4cCI6MjA5ODM3MjU2OH0.oTJakm0vtd6gQL-qeT1Qna5M_nKb4o1doed1OARfqdo
```

> ⚠️ **Lưu ý**: File `.env` đã được `.gitignore` bảo vệ — sẽ KHÔNG bị đẩy lên GitHub. Mỗi máy cần tự tạo file `.env` riêng.

---

## 5. Cấu hình Supabase (Database)

### Bước 1: Tạo bảng và nạp dữ liệu

1. Đăng nhập vào [Supabase Dashboard](https://supabase.com/dashboard)
2. Chọn Project → **SQL Editor** → **New Query**
3. Copy toàn bộ nội dung file `supabase_setup.sql` → Paste vào → Bấm **Run**
4. Kết quả: `Success. No rows returned` → Thành công ✅

> Script này sẽ tự động:
> - Tạo 5 bảng: `profiles`, `products`, `boxes`, `samples`, `transactions`
> - Thiết lập RLS (Row Level Security) và phân quyền
> - Nạp sẵn **350 sản phẩm thuốc lá** làm danh mục gốc

### Bước 2: Lấy thông tin kết nối

1. Supabase Dashboard → **Project Settings** (⚙️ góc dưới trái)
2. Bấm **API** → Tìm phần **Project API keys**
3. Copy:
   - **Project URL**: `https://obfdrpqnntylboptkwin.supabase.co`
   - **anon public key**: chuỗi `eyJ...` dài

---

## 6. Triển khai lên Vercel

### Lần đầu (Import project)

1. Vào [vercel.com](https://vercel.com) → Đăng nhập bằng GitHub
2. Bấm **Add New → Project**
3. Chọn repo **`Quanlykhomau`** → Bấm **Import**
4. Ở phần **Environment Variables**, thêm 2 biến:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://obfdrpqnntylboptkwin.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | *(anon key của bạn)* |

5. Bấm **Deploy** → Chờ ~30 giây → Xong ✅

### Các lần sau (Tự động)

Mỗi khi bạn đẩy code lên GitHub (`git push`), Vercel sẽ **tự động build và deploy lại** mà không cần làm thêm gì.

---

## 7. Tạo tài khoản Admin

### Bước 1: Tạo user trong Supabase Auth

1. Supabase Dashboard → **Authentication** → **Users** → **Add user** → **Create new user**
2. Nhập Email và Password → Bấm **Create User**

### Bước 2: Cấp quyền Admin

Vào **SQL Editor** → Chạy lệnh sau (thay email của bạn vào):

```sql
INSERT INTO profiles (id, full_name, employee_code, department, role)
SELECT 
  id, 
  'Tên Quản trị viên',
  'ADMIN001',
  'Quản lý kho',
  'admin'
FROM auth.users
WHERE email = 'email_cua_ban@gmail.com';
```

### Bước 3: Đăng nhập

- Mở website → Đăng nhập bằng email/password vừa tạo
- Hệ thống nhận diện `role = 'admin'` → cho phép toàn quyền quản lý kho

> **Tạo tài khoản Staff** (nhân viên): Làm tương tự nhưng đổi `'admin'` thành `'staff'` ở câu SQL trên.

---

## 8. Các tính năng chính

| Tính năng | Vai trò |
|-----------|---------|
| Tìm kiếm mẫu | Staff + Admin |
| Đăng ký yêu cầu lấy mẫu | Staff |
| Phê duyệt / Từ chối yêu cầu | Admin |
| Nhập kho mẫu mới | Admin |
| Xem sơ đồ kho trực quan | Admin |
| Xuất QR code nhãn dán | Admin |
| Đóng thùng khi kệ đầy | Admin |
| Hủy mẫu quá 12 tháng + in PDF | Admin |
| Quản lý danh mục sản phẩm gốc | Admin |
| Thêm / Sửa sản phẩm | Admin |

---

## 9. Quy tắc nghiệp vụ quan trọng

### Đơn vị tính
- **1 Cây = 10 bao lẻ**
- Nhập kho nhập theo **cây** (ví dụ: nhập 5 cây = 50 bao)
- Lấy mẫu tính theo **bao**

### Hệ tọa độ kệ kho

| Kệ số | Ký hiệu | Ô 1 (trên) | ... | Ô 5 (dưới - lẻ) |
|-------|---------|-----------|-----|-----------------|
| Kệ 1 | Kệ A | A1 | ... | A5 (Lẻ) |
| Kệ 2 | Kệ B | B1 | ... | B5 (Lẻ) |
| Kệ 3 | Kệ C | C1 | ... | C5 (Lẻ) |
| Kệ 4 | Kệ D | D1 | ... | D5 (Lẻ) |
| Kệ 5 | Kệ E | E1 | ... | E5 (Lẻ) |
| Kệ 6 | Kệ F | F1 | ... | F5 (Lẻ) |

### Quy tắc xếp cột
- Cột xếp từ **trái qua phải** (Cột 1 → Cột 2 → ...)
- Cột 1 có mẫu thì Cột 2 mới xuất hiện (không bỏ trống)
- Mỗi cột chỉ chứa **1 loại sản phẩm** duy nhất
- Chiều cao xếp tối đa: **Kingsize/Semi/Demi: 7 cây**, **Slim/SSL: 10 cây**

### Quy tắc Ô lẻ (Ô 5)
- Ô 1–4 chỉ chứa **cây nguyên** (số bao chia hết cho 10)
- Khi lấy mẫu khiến số lượng còn lại **lẻ bao** (dù lẻ 1 hay 9 gói) → hệ thống **tự động chuyển toàn bộ số bao lẻ còn lại về Ô 5 (Ô lẻ)** của cùng kệ đó

### Ngày tháng
- Khi nhập ngày dạng `20/5/23` → hệ thống tự định dạng thành `20/05/2023`

### Mẻ sợi
- Số thứ tự mẻ sợi từ **1 đến 999**
- Lưu kết hợp mẻ sợi + thùng dạng `123|15` (mẻ 123, thùng 15)

---

## 10. Cách đẩy code lên Git sau khi cập nhật

```powershell
# Từ thư mục H:\Quanlykho
git add .
git commit -m "mô tả thay đổi"
git push
```

> Sau khi `git push`, Vercel sẽ **tự động build lại** website trong ~30 giây.

### Xem lịch sử commit

```powershell
git log --oneline
```

---

## 11. Cấu trúc Database (Supabase)

### Bảng `profiles` — Thông tin người dùng

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | UUID | Liên kết với auth.users |
| full_name | TEXT | Tên đầy đủ |
| employee_code | TEXT | Mã nhân viên |
| department | TEXT | Phòng ban |
| role | TEXT | `admin` hoặc `staff` |

### Bảng `products` — Danh mục sản phẩm gốc

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | UUID | Khóa chính |
| product_name | TEXT UNIQUE | Tên sản phẩm |
| warning_code | TEXT | Mã cảnh báo sức khỏe |
| is_export | BOOLEAN | Hàng xuất khẩu? |
| format | TEXT | `Slim`, `Semi`, `Kingsize`, `SuperSlim`, `Demi` |

### Bảng `samples` — Lô mẫu thuốc lá

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | UUID | Khóa chính |
| sku | TEXT UNIQUE | Mã lô duy nhất |
| product_id | UUID | FK → products |
| blend_batch | TEXT | Mẻ sợi + thùng (ví dụ: `123\|15`) |
| blend_date | DATE | Ngày phối sợi |
| packaging_date | DATE | Ngày đóng gói |
| shelf | INTEGER | Kệ (1–6) |
| slot | INTEGER | Ô (1–5) |
| column_number | INTEGER | Cột (1–8) |
| total_qty | INTEGER | Tổng số bao ban đầu |
| available_qty | INTEGER | Số bao còn lại |
| status | TEXT | `stored`, `boxed`, `destroyed` |

### Bảng `transactions` — Lịch sử giao dịch

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | UUID | Khóa chính |
| sample_id | UUID | FK → samples |
| user_id | UUID | FK → profiles |
| type | TEXT | `import`, `export`, `take_request`, `take_approve` |
| quantity | INTEGER | Số lượng (bao) |
| status | TEXT | `pending`, `approved`, `cancelled` |

---

## 12. Xử lý sự cố thường gặp

### Lỗi: `duplicate key value violates unique constraint "products_product_name_key"`
**Nguyên nhân**: File `supabase_setup.sql` cũ chứa INSERT trùng tên sản phẩm.  
**Giải pháp**: Đã được sửa bằng cách thêm `ON CONFLICT (product_name) DO NOTHING` vào tất cả câu lệnh INSERT. Dùng file `supabase_setup.sql` mới nhất từ GitHub.

### Lỗi: App hiển thị thanh cảnh báo màu cam "Chế độ Demo"
**Nguyên nhân**: File `.env` chưa có thông tin Supabase hoặc đang dùng giá trị mẫu.  
**Giải pháp**: Điền đúng `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` vào file `.env` rồi restart server.

### Lỗi: Vercel deploy thành công nhưng app vẫn chạy Demo mode
**Nguyên nhân**: Chưa cấu hình Environment Variables trên Vercel.  
**Giải pháp**: Vào Vercel → Settings → Environment Variables → Thêm 2 biến → Redeploy.

### Lỗi: Đăng nhập thành công nhưng không có quyền Admin
**Nguyên nhân**: Chưa có bản ghi trong bảng `profiles` với `role = 'admin'`.  
**Giải pháp**: Chạy lệnh SQL INSERT vào bảng `profiles` như hướng dẫn ở mục 7.

### Lỗi: `fatal: not a git repository`
**Nguyên nhân**: Thư mục chưa được khởi tạo Git.  
**Giải pháp**:
```powershell
git init
git remote add origin https://github.com/ngocvukh/Quanlykhomau
git pull origin main
```

---

## 📞 Thông tin liên hệ hỗ trợ

- **GitHub Issues**: https://github.com/ngocvukh/Quanlykhomau/issues
- **Supabase Dashboard**: https://supabase.com/dashboard/project/obfdrpqnntylboptkwin
- **Vercel Dashboard**: https://vercel.com/dashboard

---

*Tài liệu này được tạo tự động từ quá trình phát triển dự án. Cập nhật lần cuối: 30/06/2026.*
