# Supabase Edge Function: `admin-create-user`

Edge Function tạo tài khoản người dùng an toàn ở phía server bằng `SUPABASE_SERVICE_ROLE_KEY` (thay thế hoàn toàn việc gọi `auth.signUp()` từ Frontend).

## Tính năng bảo mật
- Xác thực JWT từ header `Authorization: Bearer <token>` trước khi xử lý (trả `401` nếu thiếu/sai).
- Kiểm tra trực tiếp trên `public.profiles` rằng người gọi có `role = 'admin'` **và** `is_active = true` (trả `403` nếu không đủ quyền).
- Kiểm tra hợp lệ đầu vào (email, độ mạnh mật khẩu, họ tên, vai trò) ở phía server.
- Tự động rollback (`auth.admin.deleteUser`) nếu khởi tạo `public.profiles` thất bại để tránh tài khoản mồ côi.
- CORS kiểm tra theo allowlist `ALLOWED_ORIGINS` (không dùng `*`).

## Hướng dẫn Deploy

```bash
# 1. Đăng nhập và liên kết project Supabase
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>

# 2. Cấu hình danh sách domain được phép gọi (phân tách bằng dấu phẩy)
supabase secrets set ALLOWED_ORIGINS="https://your-production-domain.vercel.app,http://localhost:5173"

# 3. Deploy Edge Function (từ thư mục backend)
supabase functions deploy admin-create-user --project-ref <YOUR_PROJECT_REF>
```

> Lưu ý: `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` được Supabase Edge Runtime tự động nạp sẵn, không cần khai báo ở Frontend.
> Khi Edge Function chưa được deploy, Frontend sẽ tự động dùng cơ chế fallback an toàn qua RPC `rpc_admin_provision_profile`.
