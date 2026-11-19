-- =================================================================================
-- SCRIPT CẬP NHẬT BẢO MẬT TOÀN DIỆN (ROW LEVEL SECURITY & POLICIES) CHO SUPABASE
-- Hướng dẫn: Đăng nhập Supabase Dashboard -> Chọn Project -> SQL Editor -> New Query
-- Dán toàn bộ nội dung file này vào và bấm RUN (chạy một lần duy nhất).
-- =================================================================================

-- 0. Bổ sung cột quản lý tài khoản vào public.profiles & đồng bộ email
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email IS DISTINCT FROM u.email);

-- 1. HÀM KIỂM TRA QUYỀN ADMIN AN TOÀN (SECURITY DEFINER + search_path cố định chống Search Path Hijacking)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
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

-- 3. BẢO MẬT BẢNG PROFILES (Chỉ xem profile của mình hoặc Admin xem tất cả; mọi ghi/sửa/xóa bắt buộc đi qua RPC để bảo vệ Admin cuối cùng)
CREATE POLICY "Users view own profile or admin views all" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

REVOKE ALL ON public.profiles FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;

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
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('import', 'export', 'take_request', 'take_approve', 'inventory_adjust', 'take_revert', 'move', 'destroy'));
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_quantity_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_quantity_check CHECK (quantity >= 0);

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

-- 7. BẢO MẬT BẢNG BULK_IMPORT_DRAFTS (Chỉ Admin được đọc/ghi/xóa toàn bộ bản nháp và trạng thái kiểm kê)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bulk_import_drafts') THEN
    EXECUTE 'CREATE POLICY "Admin manage all drafts" ON public.bulk_import_drafts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
    EXECUTE 'REVOKE ALL ON public.bulk_import_drafts FROM PUBLIC, anon';
  END IF;
END $$;

-- 8. BẢO MẬT BẢNG VISITOR_RESETS (Chỉ Admin được đọc/quản lý bảng; thiết bị khách kiểm tra & tiêu thụ lệnh reset của chính mình qua RPC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'visitor_resets') THEN
    EXECUTE 'CREATE POLICY "Admin manage visitor_resets" ON public.visitor_resets FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())';
    EXECUTE 'REVOKE ALL ON public.visitor_resets FROM PUBLIC, anon';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_check_and_consume_visitor_reset(
  p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_did TEXT := trim(COALESCE(p_device_id, ''));
  v_row RECORD;
BEGIN
  IF length(v_did) < 4 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF to_regclass('public.visitor_resets') IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT device_id, is_blocked, reset_by
  INTO v_row
  FROM public.visitor_resets
  WHERE device_id = v_did
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_row.is_blocked THEN
    RETURN jsonb_build_object(
      'found', true,
      'is_blocked', true,
      'reset_by', NULL
    );
  END IF;

  DELETE FROM public.visitor_resets
  WHERE device_id = v_did
    AND is_blocked = false;

  RETURN jsonb_build_object(
    'found', true,
    'is_blocked', false,
    'reset_by', v_row.reset_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_check_and_consume_visitor_reset(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_check_and_consume_visitor_reset(TEXT) TO anon, authenticated;

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
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Cấp tài khoản ' || COALESCE(NULLIF(trim(v_ref->>'full_name'), ''), v_ref->>'email', v_record_id)
        || COALESCE(' (' || NULLIF(trim(v_ref->>'email'), '') || ')', '')
        || ' - Vai trò: ' || COALESCE(v_ref->>'role', 'staff')
      WHEN 'UPDATE' THEN 'Cập nhật tài khoản ' || COALESCE(NULLIF(trim(v_ref->>'full_name'), ''), v_ref->>'email', v_record_id)
        || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa tài khoản ' || COALESCE(NULLIF(trim(v_ref->>'full_name'), ''), v_ref->>'email', v_record_id)
        || COALESCE(' (' || NULLIF(trim(v_ref->>'email'), '') || ')', '')
    END;
  ELSE
    v_summary := TG_OP || ' ' || TG_TABLE_NAME || ' (' || v_record_id || ')';
  END IF;

  IF to_regclass('public.warehouse_audit_logs') IS NOT NULL THEN
    INSERT INTO public.warehouse_audit_logs (
      table_name, record_id, action, actor_id, actor_name, actor_role,
      old_data, new_data, changed_fields, summary
    ) VALUES (
      TG_TABLE_NAME, v_record_id, TG_OP, v_actor_id, v_actor_name, v_actor_role,
      v_old, v_new, v_changed_fields, v_summary
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  tbl TEXT;
  audited_tables TEXT[] := ARRAY['samples', 'boxes', 'products', 'slot_configs', 'transactions', 'profiles'];
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

-- 12. RPC QUẢN LÝ TÀI KHOẢN & ĐỒNG BỘ EMAIL (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.rpc_admin_provision_profile(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_employee_code TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'staff'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_email TEXT;
  v_email TEXT;
  v_full_name TEXT;
  v_employee_code TEXT;
  v_department TEXT;
  v_role TEXT;
  v_existing public.profiles;
  v_active_admin_count INTEGER;
  v_profile public.profiles;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Chỉ Admin mới được phép cấp tài khoản';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu user_id của tài khoản';
  END IF;

  SELECT u.email INTO v_auth_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản xác thực tương ứng';
  END IF;

  v_full_name := NULLIF(trim(p_full_name), '');
  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'Họ và tên không được để trống';
  END IF;

  v_role := COALESCE(NULLIF(trim(lower(p_role)), ''), 'staff');
  IF v_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Vai trò không hợp lệ (chỉ chấp nhận admin hoặc staff)';
  END IF;

  -- Guardrail bảo vệ Admin cuối cùng nếu tài khoản đã tồn tại profile
  SELECT * INTO v_existing
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_user_id = auth.uid() AND v_existing.role = 'admin' AND v_role <> 'admin' THEN
      RAISE EXCEPTION 'Không thể tự hạ quyền Admin của chính mình';
    END IF;

    IF v_existing.role = 'admin' AND v_existing.is_active = true AND v_role <> 'admin' THEN
      SELECT count(*) INTO v_active_admin_count
      FROM public.profiles
      WHERE role = 'admin'
        AND is_active = true
        AND id <> p_user_id;

      IF v_active_admin_count = 0 THEN
        RAISE EXCEPTION 'Không thể hạ quyền Admin đang hoạt động cuối cùng trong hệ thống';
      END IF;
    END IF;
  END IF;

  -- Luôn ưu tiên email xác thực từ auth.users (không tin cậy tham số client)
  v_email := v_auth_email;
  v_employee_code := NULLIF(trim(p_employee_code), '');
  v_department := NULLIF(trim(p_department), '');

  INSERT INTO public.profiles (
    id, email, full_name, employee_code, department, role, is_active, updated_at
  ) VALUES (
    p_user_id, v_email, v_full_name, v_employee_code, v_department, v_role, true, timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    employee_code = EXCLUDED.employee_code,
    department = EXCLUDED.department,
    role = EXCLUDED.role,
    updated_at = timezone('utc'::text, now())
  RETURNING * INTO v_profile;

  BEGIN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc'::text, now()))
    WHERE id = p_user_id AND email_confirmed_at IS NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_provision_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_provision_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_account(
  p_target_id UUID,
  p_full_name TEXT,
  p_employee_code TEXT,
  p_department TEXT,
  p_role TEXT,
  p_is_active BOOLEAN
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.profiles;
  v_updated public.profiles;
  v_full_name TEXT;
  v_employee_code TEXT;
  v_department TEXT;
  v_role TEXT;
  v_is_active BOOLEAN;
  v_active_admin_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Chỉ Admin mới được phép cập nhật tài khoản';
  END IF;

  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã tài khoản cần cập nhật';
  END IF;

  SELECT * INTO v_existing
  FROM public.profiles
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ tài khoản';
  END IF;

  v_full_name := COALESCE(NULLIF(trim(p_full_name), ''), v_existing.full_name);
  v_employee_code := NULLIF(trim(p_employee_code), '');
  v_department := NULLIF(trim(p_department), '');
  v_role := COALESCE(NULLIF(trim(lower(p_role)), ''), v_existing.role);
  v_is_active := COALESCE(p_is_active, v_existing.is_active);

  IF v_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Vai trò không hợp lệ (chỉ chấp nhận admin hoặc staff)';
  END IF;

  IF p_target_id = auth.uid() AND v_is_active = false THEN
    RAISE EXCEPTION 'Không thể tự khóa tài khoản của chính mình';
  END IF;

  IF p_target_id = auth.uid() AND v_existing.role = 'admin' AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'Không thể tự hạ quyền Admin của chính mình';
  END IF;

  IF v_existing.role = 'admin' AND v_existing.is_active = true AND (v_role <> 'admin' OR v_is_active = false) THEN
    SELECT count(*) INTO v_active_admin_count
    FROM public.profiles
    WHERE role = 'admin'
      AND is_active = true
      AND id <> p_target_id;

    IF v_active_admin_count = 0 THEN
      RAISE EXCEPTION 'Không thể khóa hoặc hạ quyền Admin đang hoạt động cuối cùng trong hệ thống';
    END IF;
  END IF;

  UPDATE public.profiles
  SET full_name = v_full_name,
      employee_code = v_employee_code,
      department = v_department,
      role = v_role,
      is_active = v_is_active,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_target_id
  RETURNING * INTO v_updated;

  -- Đồng bộ trạng thái khóa/mở khóa sang auth.users.banned_until và thu hồi phiên hiện tại khi khóa
  BEGIN
    IF v_is_active = false THEN
      UPDATE auth.users
      SET banned_until = '2999-12-31 23:59:59+00'::timestamptz
      WHERE id = p_target_id;

      DELETE FROM auth.sessions WHERE user_id = p_target_id;
    ELSE
      UPDATE auth.users
      SET banned_until = NULL
      WHERE id = p_target_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_update_account(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_account(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_account(
  p_target_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.profiles;
  v_remaining_admin_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Chỉ Admin mới được phép xóa tài khoản';
  END IF;

  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã tài khoản cần xóa';
  END IF;

  IF p_target_id = auth.uid() THEN
    RAISE EXCEPTION 'Không thể tự xóa tài khoản của chính mình';
  END IF;

  SELECT * INTO v_existing
  FROM public.profiles
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ tài khoản cần xóa';
  END IF;

  IF v_existing.role = 'admin' THEN
    SELECT count(*) INTO v_remaining_admin_count
    FROM public.profiles
    WHERE role = 'admin'
      AND is_active = true
      AND id <> p_target_id;

    IF v_remaining_admin_count = 0 THEN
      RAISE EXCEPTION 'Không thể xóa Admin đang hoạt động cuối cùng trong hệ thống';
    END IF;
  END IF;

  DELETE FROM auth.users WHERE id = p_target_id;
  DELETE FROM public.profiles WHERE id = p_target_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_delete_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_account(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_sync_my_email()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Cần đăng nhập để đồng bộ email';
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản xác thực';
  END IF;

  UPDATE public.profiles
  SET email = v_email,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_uid
    AND email IS DISTINCT FROM v_email;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_sync_my_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_sync_my_email() TO authenticated;

-- Đồng bộ trạng thái khóa hiện có từ public.profiles sang auth.users.banned_until
DO $$
BEGIN
  UPDATE auth.users u
  SET banned_until = '2999-12-31 23:59:59+00'::timestamptz
  FROM public.profiles p
  WHERE u.id = p.id
    AND p.is_active = false
    AND (u.banned_until IS NULL OR u.banned_until < timezone('utc'::text, now()));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';

-- =================================================================================
-- HOÀN TẤT THIẾT LẬP BẢO MẬT SUPABASE
-- =================================================================================
