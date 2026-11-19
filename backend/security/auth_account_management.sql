-- =================================================================================
-- QUẢN LÝ TÀI KHOẢN, PHÂN QUYỀN & BẢO MẬT PROFILES (IDEMPOTENT)
-- Chạy trên Supabase SQL Editor.
-- =================================================================================

-- 1. Bổ sung cột email, is_active, updated_at vào public.profiles (nếu chưa có)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Backfill email từ auth.users cho các profile hiện có
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email IS DISTINCT FROM u.email);

-- 2. Cập nhật hàm public.is_admin() kiểm tra role = 'admin' AND is_active = true
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

-- 3. Cập nhật hàm trigger audit để hỗ trợ định dạng summary tiếng Việt cho bảng profiles
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

-- Gắn trigger audit lên public.profiles
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_warehouse_changes();

-- 4. RPC quản trị tài khoản (SECURITY DEFINER SET search_path = public)

-- 4.1. Cấp/liên kết profile sau khi Admin tạo user qua Auth
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

  -- Tự động xác nhận email để tài khoản do Admin cấp có thể đăng nhập ngay
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

-- 4.2. Cập nhật thông tin/vai trò/trạng thái tài khoản (chống tự khóa, tự hạ quyền, xóa/khóa Admin cuối cùng)
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

-- 4.3. Xóa tài khoản (chống tự xóa chính mình hoặc xóa Admin cuối cùng)
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

-- 4.4. Đồng bộ email từ auth.users sang public.profiles cho chính user đang đăng nhập
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

-- 5. Siết chặt RLS trên public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users view own profile or admin views all" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

-- Thu hồi quyền ghi trực tiếp lên public.profiles từ authenticated/anon (mọi thay đổi bắt buộc qua RPC để bảo vệ Admin cuối cùng)
REVOKE ALL ON public.profiles FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- Tự động xác nhận email cho các tài khoản đã được Admin cấp profile trước đó và đồng bộ trạng thái khóa sang auth.users
DO $$
BEGIN
  UPDATE auth.users u
  SET email_confirmed_at = timezone('utc'::text, now())
  WHERE u.email_confirmed_at IS NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

  UPDATE auth.users u
  SET banned_until = '2999-12-31 23:59:59+00'::timestamptz
  FROM public.profiles p
  WHERE u.id = p.id
    AND p.is_active = false
    AND (u.banned_until IS NULL OR u.banned_until < timezone('utc'::text, now()));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 6. Làm mới schema cache của PostgREST
NOTIFY pgrst, 'reload schema';
