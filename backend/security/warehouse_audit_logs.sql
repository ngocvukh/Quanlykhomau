-- =================================================================================
-- HỆ THỐNG AUDIT LOGS TỰ ĐỘNG CHO KHO MẪU (APPEND-ONLY + TRIGGER + RPC)
-- Chạy idempotent trên Supabase SQL Editor.
-- =================================================================================

-- 0. Đảm bảo hàm kiểm tra Admin tồn tại và an toàn (SECURITY DEFINER + search_path cố định + is_active = true)
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

-- 1. Tạo bảng public.warehouse_audit_logs (append-only, chỉ Admin được SELECT)
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

-- 2. Trigger function ghi nhận mọi thay đổi INSERT / UPDATE / DELETE
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
  -- Tra thông tin người thao tác từ public.profiles
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

  -- Xác định record_id an toàn (kể cả bảng không có cột id như slot_configs)
  v_record_id := COALESCE(
    v_ref->>'id',
    CASE
      WHEN TG_TABLE_NAME = 'slot_configs' THEN concat_ws('-', v_ref->>'shelf', v_ref->>'slot', v_ref->>'column_number')
      ELSE NULL
    END,
    'unknown'
  );

  -- Tính changed_fields khi UPDATE (bỏ qua updated_at; nếu chỉ đổi updated_at thì không ghi log)
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

  -- Tạo summary tiếng Việt dễ hiểu (kèm tên sản phẩm / SKU cho samples và transactions)
  IF TG_TABLE_NAME = 'samples' THEN
    v_sku := v_ref->>'sku';
    IF (v_ref->>'product_id') IS NOT NULL THEN
      SELECT pr.product_name
      INTO v_product_name
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
    table_name,
    record_id,
    action,
    actor_id,
    actor_name,
    actor_role,
    old_data,
    new_data,
    changed_fields,
    summary
  ) VALUES (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_actor_id,
    v_actor_name,
    v_actor_role,
    v_old,
    v_new,
    v_changed_fields,
    v_summary
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Gắn trigger AFTER INSERT OR UPDATE OR DELETE lên 5 bảng (idempotent)
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

-- 4. RPC cập nhật lý do (reason) cho bản ghi log mới nhất trong 60 giây (chỉ Admin)
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

-- 5. RLS cho warehouse_audit_logs: Append-only tuyệt đối, CHỈ Admin được SELECT
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

-- 6. Siết RLS bảng loose_pack_audits: chỉ Admin được SELECT (thay USING (true))
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loose_pack_audits') THEN
    EXECUTE 'ALTER TABLE public.loose_pack_audits ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow read loose_pack_audits" ON public.loose_pack_audits';
    EXECUTE 'CREATE POLICY "Allow read loose_pack_audits" ON public.loose_pack_audits FOR SELECT USING (public.is_admin())';
  END IF;
END $$;

-- 7. Làm mới schema cache của PostgREST ngay lập tức để API nhận diện bảng & RPC mới
NOTIFY pgrst, 'reload schema';
