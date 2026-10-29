-- =================================================================================
-- SCRIPT CẬP NHẬT BẢO MẬT (ROW LEVEL SECURITY & CONSTRAINTS) CHO SUPABASE
-- Hướng dẫn: Copy toàn bộ nội dung file này vào Supabase Dashboard -> SQL Editor -> Run
-- =================================================================================

-- 1. CẬP NHẬT RÀNG BUỘC CHO BẢNG SAMPLES & TRANSACTIONS (Khớp với tính năng mới của App)
ALTER TABLE public.samples DROP CONSTRAINT IF EXISTS samples_status_check;
ALTER TABLE public.samples ADD CONSTRAINT samples_status_check 
  CHECK (status IN ('pending', 'stored', 'boxed', 'destroyed'));

ALTER TABLE public.samples DROP CONSTRAINT IF EXISTS check_location;
ALTER TABLE public.samples ADD CONSTRAINT check_location CHECK (
  (status = 'stored' AND shelf IS NOT NULL AND slot IS NOT NULL AND column_number IS NOT NULL AND box_id IS NULL) OR
  (status = 'boxed' AND shelf IS NULL AND slot IS NULL AND column_number IS NULL AND box_id IS NOT NULL) OR
  (status IN ('pending', 'destroyed') AND shelf IS NULL AND slot IS NULL AND column_number IS NULL AND box_id IS NULL)
);

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('import', 'export', 'take_request', 'take_approve', 'move', 'destroy'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check 
  CHECK (status IN ('pending', 'approved', 'cancelled', 'completed'));

-- Cho phép user_id có thể NULL khi Khách (Guest) gửi yêu cầu lấy mẫu
ALTER TABLE public.transactions ALTER COLUMN user_id DROP NOT NULL;

-- 2. HÀM KIỂM TRA ADMIN AN TOÀN (Tránh đệ quy RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. BẬT RLS VÀ THIẾT LẬP CHÍNH SÁCH CHO TẤT CẢ CÁC BẢNG

-- 3.1. Bảng profiles (Chặn người dùng tự nâng quyền lên admin)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc profile" ON public.profiles;
DROP POLICY IF EXISTS "Người dùng tự cập nhật profile của mình" ON public.profiles;
DROP POLICY IF EXISTS "Người dùng tạo profile staff mặc định" ON public.profiles;

CREATE POLICY "Cho phép tất cả mọi người đọc profile" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Người dùng tạo profile staff mặc định" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role = 'staff');

CREATE POLICY "Người dùng tự cập nhật profile của mình" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (
    public.is_admin() OR (
      auth.uid() = id AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- 3.2. Bảng products (Mọi người được xem, chỉ Admin được thêm/sửa/xóa)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tất cả mọi người được đọc danh mục sản phẩm" ON public.products;
DROP POLICY IF EXISTS "Chỉ Admin/Thủ kho được thêm/sửa sản phẩm" ON public.products;

CREATE POLICY "Tất cả mọi người được đọc danh mục sản phẩm" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "Chỉ Admin/Thủ kho được thêm/sửa sản phẩm" ON public.products
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3.3. Bảng boxes (Mọi người được xem, chỉ Admin được thêm/sửa/xóa)
ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc thông tin Thùng" ON public.boxes;
DROP POLICY IF EXISTS "Chỉ Admin/Thủ kho được quản lý Thùng" ON public.boxes;

CREATE POLICY "Cho phép tất cả mọi người đọc thông tin Thùng" ON public.boxes
  FOR SELECT USING (true);

CREATE POLICY "Chỉ Admin/Thủ kho được quản lý Thùng" ON public.boxes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3.4. Bảng samples (Mọi người được xem để tra cứu, chỉ Admin được thêm/sửa/xóa)
ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc thông tin Mẫu" ON public.samples;
DROP POLICY IF EXISTS "Chỉ Admin/Thủ kho được thao tác sửa đổi Mẫu" ON public.samples;

CREATE POLICY "Cho phép tất cả mọi người đọc thông tin Mẫu" ON public.samples
  FOR SELECT USING (true);

CREATE POLICY "Chỉ Admin/Thủ kho được thao tác sửa đổi Mẫu" ON public.samples
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3.5. Bảng transactions (Mọi người được xem & tạo yêu cầu lấy mẫu 'take_request', chỉ Admin được duyệt/sửa/xóa)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc lịch sử giao dịch" ON public.transactions;
DROP POLICY IF EXISTS "Mọi người tự tạo giao dịch yêu cầu của mình hoặc Admin duyệt tất cả" ON public.transactions;
DROP POLICY IF EXISTS "Chỉ Admin được cập nhật trạng thái duyệt giao dịch" ON public.transactions;

CREATE POLICY "Cho phép tất cả mọi người đọc lịch sử giao dịch" ON public.transactions
  FOR SELECT USING (true);

CREATE POLICY "Mọi người tự tạo giao dịch yêu cầu của mình hoặc Admin duyệt tất cả" ON public.transactions
  FOR INSERT WITH CHECK (
    public.is_admin() OR (
      type = 'take_request' AND status = 'pending' AND (user_id IS NULL OR user_id = auth.uid())
    )
  );

CREATE POLICY "Chỉ Admin được cập nhật trạng thái duyệt giao dịch" ON public.transactions
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Chỉ Admin được xóa giao dịch" ON public.transactions
  FOR DELETE USING (public.is_admin());

-- 3.6. Bảng bulk_import_drafts (Chỉ Admin được đọc/ghi bản nháp nhập kho)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bulk_import_drafts') THEN
    EXECUTE 'ALTER TABLE public.bulk_import_drafts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow public select" ON public.bulk_import_drafts';
    EXECUTE 'DROP POLICY IF EXISTS "Allow public insert" ON public.bulk_import_drafts';
    EXECUTE 'DROP POLICY IF EXISTS "Allow public update" ON public.bulk_import_drafts';
    EXECUTE 'DROP POLICY IF EXISTS "Allow public delete" ON public.bulk_import_drafts';
    EXECUTE 'DROP POLICY IF EXISTS "Admin only bulk_import_drafts" ON public.bulk_import_drafts';
    EXECUTE 'CREATE POLICY "Admin only bulk_import_drafts" ON public.bulk_import_drafts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
END $$;

-- 3.7. Bảng slot_configs (Mọi người đọc được trạng thái kệ, chỉ Admin được sửa)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'slot_configs') THEN
    EXECUTE 'ALTER TABLE public.slot_configs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow public read slot_configs" ON public.slot_configs';
    EXECUTE 'DROP POLICY IF EXISTS "Admin manage slot_configs" ON public.slot_configs';
    EXECUTE 'CREATE POLICY "Allow public read slot_configs" ON public.slot_configs FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admin manage slot_configs" ON public.slot_configs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
END $$;

-- 3.8. Bảng destruction_logs (Chỉ Admin quản lý biên bản hủy)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'destruction_logs') THEN
    EXECUTE 'ALTER TABLE public.destruction_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow public read destruction_logs" ON public.destruction_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Admin manage destruction_logs" ON public.destruction_logs';
    EXECUTE 'CREATE POLICY "Allow public read destruction_logs" ON public.destruction_logs FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admin manage destruction_logs" ON public.destruction_logs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
END $$;

