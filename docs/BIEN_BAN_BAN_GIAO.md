# Biên Bản Bàn Giao Công Việc — Dự Án Quản Lý Kho Mẫu (`Quanlykho`)

**Ngày cập nhật:** 19/11/2026  
**Nhánh Git chính (`main`):** Đã đồng bộ lên commit mới nhất `114925b`

---

## 1. Cấu Trúc Thư Mục Hiện Tại

Dự án đã được quy hoạch tách biệt rõ 4 phần ở thư mục gốc:
- **`frontend/`**: Giao diện React + Vite (`index.html`, `vite.config.js`, `src/App.jsx`, `src/components/*`, `src/services/*`, `src/utils/*`).
  - `build.outDir` trỏ ra `../dist` và `build.sourcemap: false` (đồng bộ với `vercel.json`).
- **`backend/`**:
  - `backend/rpc/supabase_rpc_functions.sql`: Các hàm RPC nghiệp vụ kho (`rpc_approve_take_request`, `rpc_revert_take_request`, `rpc_pack_samples_to_box`).
  - `backend/security/supabase_security_fix.sql`: Script thiết lập RLS tổng thể cho các bảng.
  - `backend/security/warehouse_audit_logs.sql`: Bảng `warehouse_audit_logs`, trigger tự động và `rpc_set_audit_reason`.
  - `backend/security/auth_account_management.sql`: Mở rộng `profiles`, `is_admin()`, và các RPC quản trị tài khoản.
  - `backend/supabase/functions/admin-create-user/`: Edge Function mẫu cho việc cấp tài khoản phía server bằng `service_role`.
  - `backend/scripts/`: Các script bảo trì/khôi phục dữ liệu.
- **`database/`**:
  - `database/schema/supabase_setup.sql`: Schema khởi tạo đầy đủ + dữ liệu gốc `products`.
  - `database/seeds/`: `seed_products_only.sql`, `Danh sach.xlsx`.
- **`docs/`**: Tài liệu dự án (`HUONG_DAN_DU_AN.md`, `LO_TRINH_TACH_FE_BE.md`, `Yeucau.md`, `BIEN_BAN_BAN_GIAO.md`, `demo/`).

---

## 2. Các Công Việc Đã Hoàn Thành & Đẩy Lên Git (`main`)

| Commit | Nội dung chính |
| :--- | :--- |
| **`c3d973e`** | Tách cấu trúc `frontend/`, `backend/`, `database/`, `docs/`; chuyển nghiệp vụ sang Supabase RPC; tối ưu tìm kiếm (gõ phím chỉ hiện danh sách sản phẩm gợi ý, nhấn **Enter / Tìm kiếm** mới lọc mẫu trong kho); lazy-load các tab nặng. |
| **`ee16abd`** | - Thêm **Bảng cập nhật & kiểm kê Ô 5 (Hàng lẻ)** (`loose_pack_audits`) + nút **Hoàn tác / Khôi phục** 1 chạm khi lỡ báo hết về `0 bao` (giải quyết trường hợp mất dấu vết như mẫu *Báo Leopard Slim Dâu*).<br>- Thêm **Nhật ký thay đổi kho** (`WarehouseAuditLogsTab.jsx`, `auditLogService.js`, `warehouse_audit_logs.sql`): Trigger DB ghi lại mọi `INSERT/UPDATE/DELETE` trên 5 bảng (`samples`, `boxes`, `products`, `slot_configs`, `transactions`), chỉ Admin/Thủ kho xem, hỗ trợ lọc & xuất CSV.<br>- Chuẩn hóa Security Headers (CSP) trong `vercel.json`. |
| **`99d5f69`** | - Tắt tab **Đăng ký** công khai trên màn hình đăng nhập; thêm **Quên mật khẩu** (`resetPasswordForEmail`) & luồng `PASSWORD_RECOVERY`.<br>- Thêm `AccountModal.jsx`: user đang đăng nhập tự **Đổi mật khẩu** (bắt buộc nhập mật khẩu cũ, kiểm tra `>= 8` ký tự gồm chữ + số) và **chỉ tự đổi Email**; Họ tên, Mã NV, Phòng ban, Vai trò chỉ Admin sửa.<br>- Nâng cấp `UserVisitorManagerTab.jsx`: Admin cấp tài khoản mới trực tiếp trên UI (tự xác nhận `email_confirmed_at`), Khóa/Mở khóa (`is_active`), Đặt lại mật khẩu, lọc/tìm kiếm, chặn tự khóa/xóa Admin cuối cùng.<br>- Đồng bộ giao diện Sáng / Tối cho khung Nhật ký thao tác trong `UserVisitorManagerTab.jsx`. |
| **`114925b`** | Vá toàn diện theo `Security-check/AGENTS.md`:<br>- Thu hồi quyền bảng `profiles` khỏi `anon` & quyền ghi trực tiếp khỏi `authenticated`; tách query Khách ở `warehouseService.js` không join `profiles(*)`.<br>- Siết `bulk_import_drafts` & gỡ bản sao `global-loose-pack-audits`; đồng nhất `is_active = true` trong `public.is_admin()` ở tất cả file SQL; chuyển kiểm tra session sang **fail-closed** (`getSession()` chỉ set `user` sau khi xác minh profile hợp lệ).<br>- RPC kho (`supabase_rpc_functions.sql`): thêm `REVOKE PUBLIC`, ép `auth.uid()`, kiểm tra `v_tx.type = 'take_request'` khi hoàn tác.<br>- Bỏ inline `<script>window.print();</script>` (tránh xung đột CSP trên Vercel), dùng `onafterprint` + `escapeHtml()` đầy đủ khi in tem; dùng chung `sanitizeCsvCell` & `isSafeHttpsUrl`; khai báo tường minh `dompurify` trong `package.json` & `package-lock.json`.<br>- Bổ sung `'destroy'` vào `transactions_type_check` để tương thích 21 bản ghi tiêu hủy cũ trên DB. |

---

## 3. Danh Sách & Thứ Tự Chạy SQL Trên Supabase (Nếu Chưa Chạy Hoặc Khi Dựng DB Mới)

Vào **Supabase Dashboard → SQL Editor → New Query**, chạy lần lượt 4 file sau (đều đã viết idempotent và có `NOTIFY pgrst, 'reload schema';`):
1. `backend/security/supabase_security_fix.sql`
2. `backend/security/auth_account_management.sql`
3. `backend/security/warehouse_audit_logs.sql`
4. `backend/rpc/supabase_rpc_functions.sql`

---

## 4. Các Việc Cần Lưu Ý / Tiếp Tục Ở Lần Sau

1. **Cấu hình trên Supabase Dashboard (Production):**
   - Kiểm tra đã chạy đủ 4 file SQL ở Mục 3 trên DB thật chưa (đặc biệt để `rpc_admin_provision_profile`, `warehouse_audit_logs`, và `transactions_type_check` có `'destroy'` hoạt động đồng bộ).
   - Nếu muốn chặn hoàn toàn người ngoài tự gọi API `signUp`: deploy Edge Function `backend/supabase/functions/admin-create-user/index.ts` (xem hướng dẫn trong `backend/supabase/functions/admin-create-user/README.md`), sau đó **tắt Public Sign-ups** tại **Authentication → Providers → Email**.
   - Bật **Auth Rate Limits** và **CAPTCHA** trên Supabase Dashboard để chống brute-force ở tầng server.
   - *(Tùy chọn nâng cao)* Chuyển Storage bucket `destruction_reports` sang **private** kèm Signed URL nếu muốn bảo mật riêng các file PDF biên bản tiêu hủy.
2. **Kiểm thử thực tế trên Local / Vercel Production:**
   - Test 3 vai trò (**Khách**, **Nhân viên**, **Admin/Thủ kho**): Khách vẫn xem Sơ đồ kệ, Tra cứu và gửi yêu cầu lấy mẫu bình thường; tài khoản bị Admin khóa bị đăng xuất ngay; in tem nhãn Tommy 135 hoạt động bình thường dưới CSP header của Vercel.
3. **Kiểm thử thực tế trên Local / Vercel Production:**
   - Test 3 vai trò (**Khách**, **Nhân viên**, **Admin/Thủ kho**): Khách vẫn xem Sơ đồ kệ, Tra cứu và gửi yêu cầu lấy mẫu bình thường; tài khoản bị Admin khóa bị đăng xuất ngay; in tem nhãn Tommy 135 hoạt động bình thường dưới CSP header của Vercel.

---

## 5. Lệnh Vận Hành Nhanh Tại Local

- **Chạy dev server:** `npm run dev -- --host` (truy cập `http://localhost:5173/`)
- **Kiểm tra lint:** `npm run lint`
- **Build production:** `npm run build`
