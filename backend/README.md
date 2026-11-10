# Backend (Supabase) — Quản Lý Kho Thuốc Lá Mẫu

Thư mục này chứa toàn bộ logic xử lý nghiệp vụ phía máy chủ (Supabase PostgreSQL RPC, Bảo mật RLS và các script quản trị).

## Cấu trúc thư mục
- **`rpc/`**
  - `supabase_rpc_functions.sql`: Các hàm Stored Procedures (`SECURITY DEFINER`) xử lý giao dịch kho nguyên khối (Atomic Transactions):
    - `rpc_approve_take_request`: Phê duyệt cấp mẫu, trừ kho, áp dụng quy tắc Ô lẻ 5, ghi thẻ hoàn tác `[RESTORE:...]`.
    - `rpc_revert_take_request`: Hoàn tác yêu cầu cấp mẫu, khôi phục tồn kho và vị trí kệ/thùng ban đầu.
    - `rpc_pack_samples_to_box`: Đóng thùng hàng loạt các mẫu quá tải kệ.
- **`security/`**
  - `supabase_security_fix.sql`: Thiết lập Row Level Security (RLS), hàm phân quyền `public.is_admin()`, chống leo thang đặc quyền (`role = 'admin'`).
- **`scripts/`**
  - Các script Node.js / Python dùng để kiểm tra, đối soát hoặc bảo trì dữ liệu định kỳ.

