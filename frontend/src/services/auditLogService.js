import { supabase } from '../supabaseClient';

/**
 * Kiểm tra lỗi có phải do bảng `public.warehouse_audit_logs` chưa được tạo trên Supabase
 * hoặc PostgREST chưa làm mới schema cache hay không.
 */
export function isMissingAuditTableError(error) {
  if (!error) return false;
  const code = typeof error === 'object' ? String(error.code || '') : '';
  const msg = typeof error === 'string'
    ? error
    : [error.message, error.details, error.hint].filter(Boolean).join(' ');
  return (
    (typeof error === 'object' && error.isMissingAuditTable === true) ||
    code === 'PGRST205' ||
    code === '42P01' ||
    /could not find the table.*warehouse_audit_logs|warehouse_audit_logs.*(schema cache|does not exist)/i.test(msg)
  );
}

/**
 * Truy vấn nhật ký thay đổi kho từ bảng `warehouse_audit_logs`.
 * Chỉ gọi khi người dùng hiện tại là admin (RLS trên DB cũng chặn non-admin).
 */
export async function fetchWarehouseAuditLogs({
  startDate = '',
  endDate = '',
  tableName = 'all',
  action = 'all',
  actorQuery = '',
  limit = 500
} = {}) {
  let query = supabase
    .from('warehouse_audit_logs')
    .select('id, table_name, record_id, action, actor_id, actor_name, actor_role, reason, old_data, new_data, changed_fields, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (startDate) {
    const startDt = new Date(`${startDate}T00:00:00`);
    if (!Number.isNaN(startDt.getTime())) {
      query = query.gte('created_at', startDt.toISOString());
    }
  }

  if (endDate) {
    const endDt = new Date(`${endDate}T23:59:59.999`);
    if (!Number.isNaN(endDt.getTime())) {
      query = query.lte('created_at', endDt.toISOString());
    }
  }

  if (tableName && tableName !== 'all') {
    query = query.eq('table_name', tableName);
  }

  if (action && action !== 'all') {
    query = query.eq('action', action);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingAuditTableError(error)) {
      const setupErr = new Error(
        "Bảng 'public.warehouse_audit_logs' chưa được khởi tạo trên Supabase hoặc schema cache chưa được làm mới."
      );
      setupErr.code = error.code;
      setupErr.isMissingAuditTable = true;
      setupErr.originalMessage = error.message;
      throw setupErr;
    }
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const q = actorQuery.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((row) => {
    const actor = (row.actor_name || '').toLowerCase();
    const summary = (row.summary || '').toLowerCase();
    const reason = (row.reason || '').toLowerCase();
    const recordId = (row.record_id || '').toLowerCase();
    const newSku = (row.new_data?.sku || '').toLowerCase();
    const oldSku = (row.old_data?.sku || '').toLowerCase();
    return (
      actor.includes(q) ||
      summary.includes(q) ||
      reason.includes(q) ||
      recordId.includes(q) ||
      newSku.includes(q) ||
      oldSku.includes(q)
    );
  });
}

/**
 * Gắn lý do thao tác (reason) vào bản ghi audit log mới nhất trong 60s qua RPC.
 * Bọc trong try/catch để im lặng bỏ qua nếu RPC chưa được nạp trên DB,
 * tuyệt đối không làm gián đoạn luồng nghiệp vụ chính.
 */
export async function attachAuditReason(tableName, recordId, reason) {
  if (!tableName || !recordId || !reason || !String(reason).trim()) return false;
  try {
    const { data, error } = await supabase.rpc('rpc_set_audit_reason', {
      p_table_name: String(tableName),
      p_record_id: String(recordId),
      p_reason: String(reason).trim()
    });
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * Chống CSV / Formula Injection:
 * Nếu chuỗi bắt đầu bằng =, +, -, @, \t, \r (kể cả sau khoảng trắng đầu),
 * thêm dấu nháy đơn (') ở đầu trước khi bọc dấu ngoặc kép CSV.
 */
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  let str = typeof value === 'string' ? value : String(value);
  if (/^[\t\r\n ]*[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

const TABLE_LABELS = {
  samples: 'Lô mẫu',
  boxes: 'Thùng',
  products: 'Sản phẩm',
  slot_configs: 'Ô kệ',
  transactions: 'Giao dịch'
};

const ACTION_LABELS = {
  INSERT: 'Thêm mới',
  UPDATE: 'Cập nhật',
  DELETE: 'Xóa'
};

/**
 * Xuất danh sách nhật ký thay đổi kho ra file CSV (UTF-8 BOM, chống Formula Injection).
 */
export function exportAuditLogsToCsv(logs = []) {
  if (!Array.isArray(logs) || logs.length === 0) return;

  const headers = [
    'Thời gian',
    'Người thay đổi',
    'Vai trò',
    'Thao tác',
    'Đối tượng',
    'Mã bản ghi',
    'Nội dung tóm tắt',
    'Lý do',
    'Trường thay đổi'
  ];

  const rows = logs.map((log) => {
    const timeStr = log.created_at
      ? new Date(log.created_at).toLocaleString('vi-VN')
      : '';
    const changedStr = Array.isArray(log.changed_fields)
      ? log.changed_fields.join(', ')
      : '';

    return [
      sanitizeCsvCell(timeStr),
      sanitizeCsvCell(log.actor_name || 'Hệ thống'),
      sanitizeCsvCell(log.actor_role || ''),
      sanitizeCsvCell(ACTION_LABELS[log.action] || log.action || ''),
      sanitizeCsvCell(TABLE_LABELS[log.table_name] || log.table_name || ''),
      sanitizeCsvCell(log.record_id || ''),
      sanitizeCsvCell(log.summary || ''),
      sanitizeCsvCell(log.reason || ''),
      sanitizeCsvCell(changedStr)
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(sanitizeCsvCell).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `nhat-ky-thay-doi-kho-${dateTag}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
