-- =================================================================================
-- SCRIPT CẬP NHẬT BẢO MẬT TOÀN DIỆN (ROW LEVEL SECURITY & CONSTRAINTS) CHO SUPABASE
-- Hướng dẫn: Đăng nhập Supabase Dashboard -> Chọn Project -> SQL Editor -> New Query
-- Dán toàn bộ nội dung file này vào và bấm RUN (chạy một lần duy nhất).
-- =================================================================================

-- 1. HÀM KIỂM TRA QUYỀN ADMIN AN TOÀN (SECURITY DEFINER để tránh đệ quy RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. BẢO MẬT BẢNG PROFILES (Chặn khách lạ đọc dữ liệu nhân viên, Chặn tự nâng quyền Admin)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc profile" ON public.profiles;
DROP POLICY IF EXISTS "Người dùng tự cập nhật profile của mình" ON public.profiles;
DROP POLICY IF EXISTS "Người dùng tạo profile staff mặc định" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow user update profile" ON public.profiles;

-- Chỉ người dùng đã đăng nhập mới được xem danh sách nhân viên
CREATE POLICY "Authenticated users view profiles" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated' OR public.is_admin());

-- Người dùng mới đăng ký tự tạo profile với role mặc định là 'staff'
CREATE POLICY "Users insert default staff profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role = 'staff');

-- Người dùng tự cập nhật thông tin cá nhân nhưng KHÔNG ĐƯỢC tự đổi role thành admin (chỉ Admin mới đổi được)
CREATE POLICY "Allow user update profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (
    public.is_admin() OR (
      auth.uid() = id AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- 3. BẢO MẬT BẢNG SEARCH_LOGS (Nhật ký tìm kiếm)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_logs') THEN
    EXECUTE 'ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow insert search logs" ON public.search_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Allow admin read search logs" ON public.search_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Allow admin delete search logs" ON public.search_logs';

    -- Cho phép ghi log tìm kiếm
    EXECUTE 'CREATE POLICY "Allow insert search logs" ON public.search_logs FOR INSERT WITH CHECK (true)';
    
    -- Chỉ Admin mới có quyền xem nhật ký tìm kiếm
    EXECUTE 'CREATE POLICY "Allow admin read search logs" ON public.search_logs FOR SELECT USING (public.is_admin())';
    
    -- Chỉ Admin mới có quyền dọn dẹp nhật ký
    EXECUTE 'CREATE POLICY "Allow admin delete search logs" ON public.search_logs FOR DELETE USING (public.is_admin())';
  END IF;
END $$;

-- 4. BẢO MẬT BẢNG DESTRUCTION_LOGS (Biên bản tiêu hủy)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'destruction_logs') THEN
    EXECUTE 'ALTER TABLE public.destruction_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow read destruction_logs" ON public.destruction_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Admin manage destruction_logs" ON public.destruction_logs';

    -- Mọi người được xem biên bản hủy để đối chiếu pháp lý
    EXECUTE 'CREATE POLICY "Allow read destruction_logs" ON public.destruction_logs FOR SELECT USING (true)';
    
    -- Chỉ Admin mới được tạo và quản lý biên bản hủy
    EXECUTE 'CREATE POLICY "Admin manage destruction_logs" ON public.destruction_logs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
END $$;

-- 5. BẢO MẬT BẢNG SAMPLES, PRODUCTS, BOXES, TRANSACTIONS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tất cả mọi người được đọc danh mục sản phẩm" ON public.products;
DROP POLICY IF EXISTS "Chỉ Admin/Thủ kho được thêm/sửa sản phẩm" ON public.products;
CREATE POLICY "Tất cả mọi người được đọc danh mục sản phẩm" ON public.products FOR SELECT USING (true);
CREATE POLICY "Chỉ Admin/Thủ kho được thêm/sửa sản phẩm" ON public.products FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc thông tin Thùng" ON public.boxes;
DROP POLICY IF EXISTS "Chỉ Admin/Thủ kho được quản lý Thùng" ON public.boxes;
CREATE POLICY "Cho phép tất cả mọi người đọc thông tin Thùng" ON public.boxes FOR SELECT USING (true);
CREATE POLICY "Chỉ Admin/Thủ kho được quản lý Thùng" ON public.boxes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc thông tin Mẫu" ON public.samples;
DROP POLICY IF EXISTS "Chỉ Admin/Thủ kho được thao tác sửa đổi Mẫu" ON public.samples;
CREATE POLICY "Cho phép tất cả mọi người đọc thông tin Mẫu" ON public.samples FOR SELECT USING (true);
CREATE POLICY "Chỉ Admin/Thủ kho được thao tác sửa đổi Mẫu" ON public.samples FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc lịch sử giao dịch" ON public.transactions;
DROP POLICY IF EXISTS "Mọi người tự tạo giao dịch yêu cầu của mình hoặc Admin duyệt tất cả" ON public.transactions;
DROP POLICY IF EXISTS "Chỉ Admin được cập nhật trạng thái duyệt giao dịch" ON public.transactions;
DROP POLICY IF EXISTS "Chỉ Admin được xóa giao dịch" ON public.transactions;

CREATE POLICY "Cho phép tất cả mọi người đọc lịch sử giao dịch" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Mọi người tự tạo giao dịch yêu cầu của mình hoặc Admin duyệt tất cả" ON public.transactions
  FOR INSERT WITH CHECK (
    public.is_admin() OR (
      type = 'take_request' AND status = 'pending' AND (user_id IS NULL OR user_id = auth.uid())
    )
  );
CREATE POLICY "Chỉ Admin được cập nhật trạng thái duyệt giao dịch" ON public.transactions FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Chỉ Admin được xóa giao dịch" ON public.transactions FOR DELETE USING (public.is_admin());

-- =================================================================================
-- HOÀN TẤT THIẾT LẬP BẢO MẬT SUPABASE
-- =================================================================================
