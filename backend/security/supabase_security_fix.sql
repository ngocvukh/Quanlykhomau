-- =================================================================================
-- SCRIPT CẬP NHẬT BẢO MẬT TOÀN DIỆN (ROW LEVEL SECURITY & POLICIES) CHO SUPABASE
-- Hướng dẫn: Đăng nhập Supabase Dashboard -> Chọn Project -> SQL Editor -> New Query
-- Dán toàn bộ nội dung file này vào và bấm RUN (chạy một lần duy nhất).
-- =================================================================================

-- 1. HÀM KIỂM TRA QUYỀN ADMIN AN TOÀN (SECURITY DEFINER + search_path cố định chống Search Path Hijacking)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

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
    'bulk_import_drafts',
    'loose_pack_audits'
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
-- Mở rộng CHECK constraint cho type và quantity để hỗ trợ kiểm kê Ô 5 & hoàn tác
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('import', 'export', 'take_request', 'take_approve', 'inventory_adjust', 'take_revert', 'move'));
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_quantity_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_quantity_check
  CHECK (quantity >= 0);

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

-- 6. BẢO MẬT BẢNG SEARCH_LOGS (Nhật ký tìm kiếm - Chỉ Admin mới xem và cập nhật gỡ thiết bị)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_logs') THEN
    EXECUTE 'CREATE POLICY "Allow insert search logs" ON public.search_logs FOR INSERT WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow admin read search logs" ON public.search_logs FOR SELECT USING (public.is_admin())';
    EXECUTE 'CREATE POLICY "Allow admin update search logs" ON public.search_logs FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Allow admin delete search logs" ON public.search_logs FOR DELETE USING (public.is_admin())';
  END IF;
END $$;

-- 7. BẢO MẬT BẢNG BULK_IMPORT_DRAFTS (Bản nháp nhập kho & Đồng bộ trạng thái kiểm tra kệ lẻ 5)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bulk_import_drafts') THEN
    EXECUTE 'CREATE POLICY "Anyone read drafts" ON public.bulk_import_drafts FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "Admin manage all drafts" ON public.bulk_import_drafts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
    -- Cho phép ghi/sửa nháp của thiết bị cá nhân HOẶC đồng bộ trạng thái kiểm tra kệ lẻ 5
    EXECUTE 'CREATE POLICY "Users write own device draft" ON public.bulk_import_drafts FOR INSERT WITH CHECK (id NOT LIKE ''global-%'' OR id = ''global-checked-loose-samples'')';
    EXECUTE 'CREATE POLICY "Users update own device draft" ON public.bulk_import_drafts FOR UPDATE USING (id NOT LIKE ''global-%'' OR id = ''global-checked-loose-samples'') WITH CHECK (id NOT LIKE ''global-%'' OR id = ''global-checked-loose-samples'')';
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

-- 10. BẢNG LỊCH SỬ KIỂM KÊ RIÊNG CHO Ô 5 (HÀNG LẺ)
CREATE TABLE IF NOT EXISTS public.loose_pack_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID REFERENCES public.samples(id) ON DELETE CASCADE,
  sku TEXT,
  product_name TEXT NOT NULL,
  blend_batch TEXT,
  packaging_date DATE,
  shelf INTEGER NOT NULL CHECK (shelf BETWEEN 1 AND 6),
  slot INTEGER NOT NULL DEFAULT 5,
  action_type TEXT NOT NULL CHECK (action_type IN ('check', 'uncheck', 'adjust_qty', 'deplete', 'restore', 'reset_slot')),
  old_qty INTEGER,
  new_qty INTEGER,
  actor_name TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.loose_pack_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read loose_pack_audits" ON public.loose_pack_audits;
DROP POLICY IF EXISTS "Allow admin manage loose_pack_audits" ON public.loose_pack_audits;
CREATE POLICY "Allow read loose_pack_audits" ON public.loose_pack_audits FOR SELECT USING (public.is_admin());
CREATE POLICY "Allow admin manage loose_pack_audits" ON public.loose_pack_audits FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 11. HỆ THỐNG AUDIT LOGS TỰ ĐỘNG (APPEND-ONLY + TRIGGER + RPC)
CREATE TABLE IF NOT EXISTS public.warehouse_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  actor_id UUID,
  actor_name TEXT,
  actor_role TEXT,
  reason TEXT,
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warehouse_audit_logs_created_at
  ON public.warehouse_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_audit_logs_table_record
  ON public.warehouse_audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_audit_logs_actor_id
  ON public.warehouse_audit_logs (actor_id);

CREATE OR REPLACE FUNCTION public.fn_audit_warehouse_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_ref JSONB := COALESCE(v_new, v_old);
  v_record_id TEXT;
  v_changed_fields TEXT[] := '{}';
  v_summary TEXT := '';
  v_product_name TEXT;
  v_sku TEXT;
BEGIN
  IF v_actor_id IS NOT NULL THEN
    SELECT p.full_name, p.role
    INTO v_actor_name, v_actor_role
    FROM public.profiles p
    WHERE p.id = v_actor_id;
  END IF;

  v_actor_name := COALESCE(
    NULLIF(trim(v_actor_name), ''),
    CASE WHEN v_actor_id IS NULL THEN 'Hệ thống' ELSE 'Không rõ' END
  );
  v_actor_role := COALESCE(
    v_actor_role,
    CASE WHEN v_actor_id IS NULL THEN 'system' ELSE 'unknown' END
  );

  v_record_id := COALESCE(
    v_ref->>'id',
    CASE
      WHEN TG_TABLE_NAME = 'slot_configs' THEN concat_ws('-', v_ref->>'shelf', v_ref->>'slot', v_ref->>'column_number')
      ELSE NULL
    END,
    'unknown'
  );

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(t.k ORDER BY t.k), '{}')
    INTO v_changed_fields
    FROM jsonb_object_keys(v_old || v_new) AS t(k)
    WHERE t.k <> 'updated_at'
      AND (v_old -> t.k) IS DISTINCT FROM (v_new -> t.k);

    IF array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'samples' THEN
    v_sku := v_ref->>'sku';
    IF (v_ref->>'product_id') IS NOT NULL THEN
      SELECT pr.product_name INTO v_product_name
      FROM public.products pr
      WHERE pr.id = (v_ref->>'product_id')::UUID;
    END IF;

    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Thêm mẫu ' || COALESCE(v_product_name, 'Không rõ') || COALESCE(' (SKU: ' || v_sku || ')', '') || ' - SL: ' || COALESCE(v_ref->>'available_qty', '0')
      WHEN 'UPDATE' THEN 'Cập nhật mẫu ' || COALESCE(v_product_name, 'Không rõ') || COALESCE(' (SKU: ' || v_sku || ')', '') || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa mẫu ' || COALESCE(v_product_name, 'Không rõ') || COALESCE(' (SKU: ' || v_sku || ')', '')
    END;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF (v_ref->>'sample_id') IS NOT NULL THEN
      SELECT s.sku, pr.product_name
      INTO v_sku, v_product_name
      FROM public.samples s
      LEFT JOIN public.products pr ON pr.id = s.product_id
      WHERE s.id = (v_ref->>'sample_id')::UUID;
    END IF;

    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Tạo giao dịch (' || COALESCE(v_ref->>'type', '') || ') ' || COALESCE(v_product_name, 'Mẫu') || COALESCE(' (SKU: ' || v_sku || ')', '') || ' - SL: ' || COALESCE(v_ref->>'quantity', '0')
      WHEN 'UPDATE' THEN 'Cập nhật giao dịch (' || COALESCE(v_ref->>'type', '') || ') ' || COALESCE(v_product_name, 'Mẫu') || COALESCE(' (SKU: ' || v_sku || ')', '') || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa giao dịch (' || COALESCE(v_ref->>'type', '') || ') ' || COALESCE(v_product_name, 'Mẫu') || COALESCE(' (SKU: ' || v_sku || ')', '')
    END;
  ELSIF TG_TABLE_NAME = 'boxes' THEN
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Tạo thùng ' || COALESCE(v_ref->>'box_name', v_record_id)
      WHEN 'UPDATE' THEN 'Cập nhật thùng ' || COALESCE(v_ref->>'box_name', v_record_id) || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa thùng ' || COALESCE(v_ref->>'box_name', v_record_id)
    END;
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Thêm sản phẩm ' || COALESCE(v_ref->>'product_name', v_record_id)
      WHEN 'UPDATE' THEN 'Cập nhật sản phẩm ' || COALESCE(v_ref->>'product_name', v_record_id) || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa sản phẩm ' || COALESCE(v_ref->>'product_name', v_record_id)
    END;
  ELSIF TG_TABLE_NAME = 'slot_configs' THEN
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Cấu hình ô Kệ ' || COALESCE(v_ref->>'shelf', '?') || ' - Ô ' || COALESCE(v_ref->>'slot', '?')
      WHEN 'UPDATE' THEN 'Cập nhật cấu hình Kệ ' || COALESCE(v_ref->>'shelf', '?') || ' - Ô ' || COALESCE(v_ref->>'slot', '?') || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa cấu hình Kệ ' || COALESCE(v_ref->>'shelf', '?') || ' - Ô ' || COALESCE(v_ref->>'slot', '?')
    END;
  ELSE
    v_summary := TG_OP || ' ' || TG_TABLE_NAME || ' (' || v_record_id || ')';
  END IF;

  INSERT INTO public.warehouse_audit_logs (
    table_name, record_id, action, actor_id, actor_name, actor_role,
    old_data, new_data, changed_fields, summary
  ) VALUES (
    TG_TABLE_NAME, v_record_id, TG_OP, v_actor_id, v_actor_name, v_actor_role,
    v_old, v_new, v_changed_fields, v_summary
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  tbl TEXT;
  audited_tables TEXT[] := ARRAY['samples', 'boxes', 'products', 'slot_configs', 'transactions'];
BEGIN
  FOREACH tbl IN ARRAY audited_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_warehouse_changes()',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_set_audit_reason(
  p_table_name TEXT,
  p_record_id TEXT,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Chỉ Admin mới được phép cập nhật lý do audit';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN false;
  END IF;

  SELECT id INTO v_target_id
  FROM public.warehouse_audit_logs
  WHERE table_name = p_table_name
    AND record_id = p_record_id
    AND actor_id = auth.uid()
    AND reason IS NULL
    AND created_at >= timezone('utc'::text, now()) - INTERVAL '60 seconds'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.warehouse_audit_logs
  SET reason = trim(p_reason)
  WHERE id = v_target_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_audit_reason(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_audit_reason(TEXT, TEXT, TEXT) TO authenticated;

ALTER TABLE public.warehouse_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_audit_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.warehouse_audit_logs', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Admin read warehouse_audit_logs" ON public.warehouse_audit_logs
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON public.warehouse_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.warehouse_audit_logs TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- =================================================================================
-- HOÀN TẤT THIẾT LẬP BẢO MẬT SUPABASE
-- =================================================================================
