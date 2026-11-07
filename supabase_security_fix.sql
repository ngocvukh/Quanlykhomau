-- =================================================================================
-- SCRIPT CẬP NHẬT BẢO MẬT TOÀN DIỆN (ROW LEVEL SECURITY & POLICIES) CHO SUPABASE
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

-- 2. TỰ ĐỘNG DỌN DẸP SẠCH SẼ TẤT CẢ CÁC POLICY CŨ (Tránh xung đột chính sách lỏng lẻo cũ)
DO $$
DECLARE
  pol record;
  tbl text;
  tables text[] := ARRAY[
    'profiles',
    'products',
    'boxes',
    'samples',
    'transactions',
    'search_logs',
    'destruction_logs',
    'destruction_reports',
    'visitor_resets',
    'slot_configs',
    'bulk_import_drafts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      FOR pol IN 
        SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 3. BẢO MẬT BẢNG PROFILES (Chặn khách lạ đọc dữ liệu nhân viên, Chặn tự nâng quyền Admin)
CREATE POLICY "Authenticated users view profiles" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated' OR public.is_admin());

CREATE POLICY "Users insert default staff profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role = 'staff');

CREATE POLICY "Allow user update profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (
    public.is_admin() OR (auth.uid() = id AND role <> 'admin')
  );

-- 4. BẢO MẬT BẢNG PRODUCTS, BOXES, SAMPLES
CREATE POLICY "Tất cả mọi người được đọc danh mục sản phẩm" ON public.products
  FOR SELECT USING (true);
CREATE POLICY "Chỉ Admin/Thủ kho được thêm/sửa sản phẩm" ON public.products
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Cho phép tất cả mọi người đọc thông tin Thùng" ON public.boxes
  FOR SELECT USING (true);
CREATE POLICY "Chỉ Admin/Thủ kho được quản lý Thùng" ON public.boxes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Cho phép tất cả mọi người đọc thông tin Mẫu" ON public.samples
  FOR SELECT USING (true);
CREATE POLICY "Chỉ Admin/Thủ kho được thao tác sửa đổi Mẫu" ON public.samples
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. BẢO MẬT BẢNG TRANSACTIONS (Quy trình xuất mượn & Chặn duyệt khống)
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

-- 6. BẢO MẬT BẢNG SEARCH_LOGS (Nhật ký tìm kiếm - Chỉ Admin mới xem được)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_logs') THEN
    EXECUTE 'CREATE POLICY "Allow insert search logs" ON public.search_logs FOR INSERT WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow admin read search logs" ON public.search_logs FOR SELECT USING (public.is_admin())';
    EXECUTE 'CREATE POLICY "Allow admin delete search logs" ON public.search_logs FOR DELETE USING (public.is_admin())';
  END IF;
END $$;

-- 7. BẢO MẬT BẢNG BULK_IMPORT_DRAFTS (Bản nháp nhập kho & Trạng thái điều phối)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bulk_import_drafts') THEN
    EXECUTE 'CREATE POLICY "Anyone read drafts" ON public.bulk_import_drafts FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admin manage all drafts" ON public.bulk_import_drafts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Users write own device draft" ON public.bulk_import_drafts FOR INSERT WITH CHECK (id NOT LIKE ''global-%'')';
    EXECUTE 'CREATE POLICY "Users update own device draft" ON public.bulk_import_drafts FOR UPDATE USING (id NOT LIKE ''global-%'') WITH CHECK (id NOT LIKE ''global-%'')';
    EXECUTE 'CREATE POLICY "Users delete own device draft" ON public.bulk_import_drafts FOR DELETE USING (id NOT LIKE ''global-%'')';
  END IF;
END $$;

-- 8. BẢO MẬT BẢNG VISITOR_RESETS (Chặn / Mở chặn thiết bị & Reset tên khách)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'visitor_resets') THEN
    EXECUTE 'CREATE POLICY "Allow read visitor_resets" ON public.visitor_resets FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admin manage visitor_resets" ON public.visitor_resets FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Allow device consume reset" ON public.visitor_resets FOR DELETE USING (is_blocked = false)';
  END IF;
END $$;

-- 9. BẢO MẬT BẢNG SLOT_CONFIGS, DESTRUCTION_LOGS, DESTRUCTION_REPORTS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'destruction_logs') THEN
    EXECUTE 'CREATE POLICY "Allow read destruction_logs" ON public.destruction_logs FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admin manage destruction_logs" ON public.destruction_logs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'destruction_reports') THEN
    EXECUTE 'CREATE POLICY "Allow read destruction_reports" ON public.destruction_reports FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admin manage destruction_reports" ON public.destruction_reports FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'slot_configs') THEN
    EXECUTE 'CREATE POLICY "Allow read slot_configs" ON public.slot_configs FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admin manage slot_configs" ON public.slot_configs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
END $$;

-- =================================================================================
-- HOÀN TẤT THIẾT LẬP BẢO MẬT SUPABASE
-- =================================================================================
