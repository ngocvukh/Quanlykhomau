-- =================================================================================
-- SUPABASE BACKEND STORED PROCEDURES (RPC) CHO QUẢN LÝ KHO THUỐC LÁ MẪU
-- Đảm bảo giao dịch kho nguyên khối (Atomic Transaction), chống lệch kho.
-- Hướng dẫn: Mở Supabase Dashboard -> SQL Editor -> Dán toàn bộ file này -> Bấm RUN.
-- =================================================================================

-- 1. HÀM PHÊ DUYỆT CẤP MẪU (DUYỆT YÊU CẦU + TRỪ KHO + Ô LẺ 5 + THẺ HOÀN TÁC)
CREATE OR REPLACE FUNCTION public.rpc_approve_take_request(
  p_tx_id UUID,
  p_custom_qty INT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_sample RECORD;
  v_qty INT;
  v_new_qty INT;
  v_next_shelf INT;
  v_next_slot INT;
  v_next_col INT;
  v_new_status TEXT;
  v_has_other_pending BOOLEAN;
  v_note_suffix TEXT := '';
  v_restore_tag TEXT;
  v_old_loc TEXT;
  v_new_loc TEXT;
  v_shelf_letters TEXT[] := ARRAY['', 'A', 'B', 'C', 'D', 'E', 'F'];
BEGIN
  -- 1. Kiểm tra quyền admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ Quản trị viên / Thủ kho mới có quyền phê duyệt cấp mẫu!';
  END IF;

  -- 2. Khóa dòng giao dịch yêu cầu
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy giao dịch yêu cầu có mã %', p_tx_id;
  END IF;

  IF v_tx.status <> 'pending' THEN
    RAISE EXCEPTION 'Giao dịch không ở trạng thái Chờ duyệt (trạng thái hiện tại: %)', v_tx.status;
  END IF;

  -- 3. Khóa dòng mẫu tương ứng trong kho
  SELECT * INTO v_sample FROM public.samples WHERE id = v_tx.sample_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy mẫu thuốc lá trong kho!';
  END IF;

  -- 4. Xác định số lượng cấp
  v_qty := COALESCE(p_custom_qty, v_tx.quantity);
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Số lượng bao cấp phải lớn hơn 0!';
  END IF;

  IF v_qty > v_sample.available_qty THEN
    RAISE EXCEPTION 'Số lượng mẫu trong kho không đủ để cấp % bao! Hiện chỉ còn % bao.', v_qty, v_sample.available_qty;
  END IF;

  v_new_qty := v_sample.available_qty - v_qty;
  v_next_shelf := v_sample.shelf;
  v_next_slot := v_sample.slot;
  v_next_col := v_sample.column_number;
  v_new_status := COALESCE(v_sample.status, 'stored');

  -- 5. Quy tắc Ô lẻ 5 (Loose Pack Rule): Nếu còn lẻ không chia hết cho 10 và đang ở ô 1-4 -> chuyển sang ô 5 cột 1
  IF v_sample.shelf IS NOT NULL AND v_sample.slot <= 4 AND (v_new_qty % 10) <> 0 AND v_new_qty > 0 THEN
    v_next_slot := 5;
    v_next_col := 1;
  END IF;

  -- 6. Nếu hết mẫu (new_qty = 0) và không còn đơn pending nào khác cùng mẫu
  IF v_new_qty = 0 THEN
    SELECT EXISTS(
      SELECT 1 FROM public.transactions 
      WHERE id <> p_tx_id AND sample_id = v_sample.id AND status = 'pending'
    ) INTO v_has_other_pending;

    IF NOT v_has_other_pending THEN
      v_next_shelf := NULL;
      v_next_slot := NULL;
      v_next_col := NULL;
      v_new_status := 'destroyed';
    END IF;
  END IF;

  -- 7. Cập nhật bảng samples
  UPDATE public.samples SET
    available_qty = v_new_qty,
    shelf = v_next_shelf,
    slot = v_next_slot,
    column_number = v_next_col,
    status = v_new_status,
    updated_at = now()
  WHERE id = v_sample.id;

  -- 8. Cập nhật dòng transactions yêu cầu gốc
  IF v_qty <> v_tx.quantity THEN
    v_note_suffix := ' (Đã chỉnh số lượng từ ' || v_tx.quantity || ' bao)';
  END IF;

  UPDATE public.transactions SET
    status = 'approved',
    quantity = v_qty,
    note = CASE 
      WHEN v_qty <> v_tx.quantity THEN COALESCE(NULLIF(v_tx.note, ''), 'Đã duyệt cấp ' || v_qty || ' bao') || v_note_suffix 
      ELSE note 
    END
  WHERE id = p_tx_id;

  -- 9. Ghi nhận giao dịch take_approve kèm vị trí cũ/mới và thẻ [RESTORE:...] để phục vụ hoàn tác
  IF v_sample.shelf IS NOT NULL AND v_sample.slot IS NOT NULL THEN
    v_old_loc := COALESCE(v_shelf_letters[v_sample.shelf + 1], 'Kệ ' || v_sample.shelf) || v_sample.slot ||
                 COALESCE(' - Cột ' || v_sample.column_number, '') ||
                 CASE WHEN v_sample.slot = 5 THEN ' (Lẻ)' ELSE '' END;
  ELSIF v_sample.box_id IS NOT NULL THEN
    v_old_loc := 'Thùng';
  ELSE
    v_old_loc := 'Chưa có';
  END IF;

  IF v_new_qty = 0 THEN
    v_new_loc := 'Hết mẫu';
  ELSIF v_next_shelf IS NOT NULL AND v_next_slot IS NOT NULL THEN
    v_new_loc := COALESCE(v_shelf_letters[v_next_shelf + 1], 'Kệ ' || v_next_shelf) || v_next_slot ||
                 COALESCE(' - Cột ' || v_next_col, '') ||
                 CASE WHEN v_next_slot = 5 THEN ' (Lẻ)' ELSE '' END;
  ELSE
    v_new_loc := 'Thùng';
  END IF;

  v_restore_tag := '[RESTORE:' || 
    COALESCE(v_sample.shelf::text, '') || '|' || 
    COALESCE(v_sample.slot::text, '') || '|' || 
    COALESCE(v_sample.column_number::text, '') || '|' || 
    COALESCE(v_sample.box_id::text, '') || '|' || 
    COALESCE(v_sample.status, 'stored') || ']';

  INSERT INTO public.transactions (
    sample_id,
    user_id,
    type,
    quantity,
    status,
    note,
    created_at
  ) VALUES (
    v_sample.id,
    COALESCE(p_admin_id, auth.uid()),
    'take_approve',
    v_qty,
    'approved',
    'Đã duyệt cấp ' || v_qty || ' bao' || v_note_suffix || '. Vị trí cũ: ' || v_old_loc || '. Vị trí mới: ' || v_new_loc || ' ' || v_restore_tag,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_qty', v_new_qty,
    'shelf', v_next_shelf,
    'slot', v_next_slot,
    'column_number', v_next_col,
    'status', v_new_status
  );
END;
$$;


-- 2. HÀM HOÀN TÁC GIAO DỊCH CẤP MẪU (KHÔI PHỤC VỊ TRÍ & SỐ LƯỢNG KHO)
CREATE OR REPLACE FUNCTION public.rpc_revert_take_request(
  p_tx_id UUID,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_approve_tx RECORD;
  v_sample RECORD;
  v_parts TEXT[];
  v_tag TEXT;
  v_restored_qty INT;
  v_restored_shelf INT;
  v_restored_slot INT;
  v_restored_col INT;
  v_restored_box UUID;
  v_restored_status TEXT := 'stored';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ Quản trị viên / Thủ kho mới có quyền hoàn tác giao dịch!';
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy giao dịch có mã %', p_tx_id;
  END IF;

  SELECT * INTO v_sample FROM public.samples WHERE id = v_tx.sample_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy mẫu tương ứng trong kho!';
  END IF;

  IF v_tx.status = 'approved' THEN
    -- Tìm giao dịch take_approve tương ứng
    SELECT * INTO v_approve_tx FROM public.transactions 
    WHERE type = 'take_approve' AND sample_id = v_tx.sample_id 
    ORDER BY created_at DESC LIMIT 1;

    -- Cộng trả lại số lượng bao đã trừ khi duyệt (giới hạn không vượt quá total_qty)
    v_restored_qty := COALESCE(v_sample.available_qty, 0) + COALESCE(v_tx.quantity, 0);
    IF v_sample.total_qty IS NOT NULL AND v_sample.total_qty > 0 AND v_restored_qty > v_sample.total_qty THEN
      v_restored_qty := v_sample.total_qty;
    END IF;

    v_restored_shelf := v_sample.shelf;
    v_restored_slot := v_sample.slot;
    v_restored_col := v_sample.column_number;
    v_restored_box := v_sample.box_id;
    v_restored_status := v_sample.status;

    -- Đọc thẻ [RESTORE:shelf|slot|col|box_id|status]
    IF v_approve_tx.note IS NOT NULL AND v_approve_tx.note ~ '\[RESTORE:[^\]]*\]' THEN
      v_tag := substring(v_approve_tx.note from '\[RESTORE:([^\]]*)\]');
      v_parts := string_to_array(v_tag, '|');
      IF array_length(v_parts, 1) >= 5 THEN
        IF (v_restored_shelf IS NULL AND v_restored_box IS NULL) OR (v_sample.slot = 5 AND v_sample.shelf IS NOT NULL) THEN
          IF v_parts[1] <> '' THEN v_restored_shelf := v_parts[1]::INT; END IF;
          IF v_parts[2] <> '' THEN v_restored_slot := v_parts[2]::INT; END IF;
          IF v_parts[3] <> '' THEN v_restored_col := v_parts[3]::INT; END IF;
          IF v_parts[4] <> '' THEN v_restored_box := v_parts[4]::UUID; ELSE v_restored_box := NULL; END IF;
          IF v_parts[5] <> '' THEN v_restored_status := v_parts[5]; END IF;
        END IF;
      END IF;
    END IF;

    -- Fallback nếu mẫu từng bị xóa khỏi kệ mà không có thẻ RESTORE
    IF v_restored_shelf IS NULL AND v_restored_box IS NULL THEN
      v_restored_shelf := 2;
      v_restored_slot := 1;
      v_restored_col := 1;
      v_restored_status := 'stored';
    END IF;

    -- Cập nhật lại kho cho mẫu (bao gồm cả available_qty và vị trí)
    UPDATE public.samples SET
      available_qty = v_restored_qty,
      shelf = v_restored_shelf,
      slot = v_restored_slot,
      column_number = v_restored_col,
      box_id = v_restored_box,
      status = CASE WHEN v_restored_box IS NOT NULL THEN 'boxed' ELSE 'stored' END,
      updated_at = now()
    WHERE id = v_sample.id;

    -- Xóa transaction take_approve
    IF v_approve_tx.id IS NOT NULL THEN
      DELETE FROM public.transactions WHERE id = v_approve_tx.id;
    END IF;

    -- Tạo transaction ghi nhận hoàn tác (bọc BEGIN..EXCEPTION để an toàn nếu bảng giới hạn CHECK constraint trên cột type)
    BEGIN
      INSERT INTO public.transactions (
        sample_id,
        user_id,
        type,
        quantity,
        status,
        note,
        created_at
      ) VALUES (
        v_tx.sample_id,
        COALESCE(p_admin_id, auth.uid()),
        'take_revert',
        v_tx.quantity,
        'approved',
        'Hoàn tác cấp mẫu về chờ duyệt',
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Đổi trạng thái yêu cầu về 'pending'
  UPDATE public.transactions SET status = 'pending' WHERE id = p_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'restored_qty', v_restored_qty,
    'restored_shelf', v_restored_shelf,
    'restored_slot', v_restored_slot
  );
END;
$$;


-- 3. HÀM ĐÓNG THÙNG MẪU QUÁ TẢI KỆ HÀNG LOẠT
CREATE OR REPLACE FUNCTION public.rpc_pack_samples_to_box(
  p_box_name TEXT,
  p_alt_box_name TEXT,
  p_sample_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_id UUID;
  v_actual_box_name TEXT;
  v_box_name TEXT := TRIM(p_box_name);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ Quản trị viên / Thủ kho mới có quyền đóng thùng mẫu!';
  END IF;

  IF p_sample_ids IS NULL OR array_length(p_sample_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Danh sách mẫu cần đóng thùng không được để trống!';
  END IF;

  -- Tìm thùng đã có sẵn
  SELECT id, box_name INTO v_box_id, v_actual_box_name FROM public.boxes 
  WHERE box_name = v_box_name OR box_name = TRIM(p_alt_box_name) 
  LIMIT 1;

  -- Nếu chưa có thùng thì tạo mới
  IF v_box_id IS NULL THEN
    INSERT INTO public.boxes (box_name, status, created_at)
    VALUES (v_box_name, 'stored', now())
    RETURNING id, box_name INTO v_box_id, v_actual_box_name;
  END IF;

  -- Cập nhật toàn bộ mẫu sang trạng thái đóng thùng
  UPDATE public.samples SET
    shelf = NULL,
    slot = NULL,
    column_number = NULL,
    box_id = v_box_id,
    status = 'boxed',
    updated_at = now()
  WHERE id = ANY(p_sample_ids);

  RETURN jsonb_build_object(
    'success', true,
    'box_id', v_box_id,
    'box_name', COALESCE(v_actual_box_name, v_box_name),
    'count', array_length(p_sample_ids, 1)
  );
END;
$$;
