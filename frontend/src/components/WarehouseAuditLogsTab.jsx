import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Download,
  Loader,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  AlertCircle,
  ShieldAlert
} from '../GoogleIcons';
import {
  fetchWarehouseAuditLogs,
  exportAuditLogsToCsv,
  isMissingAuditTableError
} from '../services/auditLogService';

const TABLE_OPTIONS = [
  { value: 'all', label: 'Tất cả đối tượng' },
  { value: 'samples', label: 'Lô mẫu' },
  { value: 'boxes', label: 'Thùng' },
  { value: 'products', label: 'Sản phẩm' },
  { value: 'slot_configs', label: 'Ô kệ' },
  { value: 'transactions', label: 'Giao dịch' }
];

const ACTION_OPTIONS = [
  { value: 'all', label: 'Tất cả thao tác' },
  { value: 'INSERT', label: 'Thêm mới' },
  { value: 'UPDATE', label: 'Cập nhật' },
  { value: 'DELETE', label: 'Xóa' }
];

const TABLE_LABEL_MAP = {
  samples: 'Lô mẫu',
  boxes: 'Thùng',
  products: 'Sản phẩm',
  slot_configs: 'Ô kệ',
  transactions: 'Giao dịch'
};

const ACTION_BADGE_MAP = {
  INSERT: {
    label: 'Thêm mới',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.28)'
  },
  UPDATE: {
    label: 'Cập nhật',
    color: '#0F87FF',
    bg: 'rgba(15, 135, 255, 0.12)',
    border: 'rgba(15, 135, 255, 0.28)'
  },
  DELETE: {
    label: 'Xóa',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.28)'
  }
};

const ROLE_LABEL_MAP = {
  admin: 'Admin',
  staff: 'Nhân viên',
  user: 'Nhân viên',
  system: 'Hệ thống',
  unknown: 'Không rõ'
};

const FIELD_LABEL_MAP = {
  id: 'Mã ID',
  product_id: 'Mã sản phẩm',
  product_name: 'Tên sản phẩm',
  sku: 'Mã SKU',
  order_number: 'Số đơn hàng',
  blend_batch: 'Lô pha chế / Kiện',
  blend_date: 'Ngày pha chế',
  packaging_date: 'Ngày đóng gói',
  sampling_time: 'Thời gian lấy mẫu',
  total_qty: 'Tổng số lượng (bao)',
  available_qty: 'Số lượng còn lại (bao)',
  shelf: 'Kệ',
  slot: 'Ô',
  column_number: 'Cột',
  box_id: 'Mã thùng',
  box_name: 'Tên thùng',
  tray_number: 'Khay chờ',
  status: 'Trạng thái',
  note: 'Ghi chú',
  is_export: 'Hàng xuất khẩu',
  warning_code: 'Mã cảnh báo',
  format: 'Định dạng bao',
  type: 'Loại giao dịch',
  quantity: 'Số lượng',
  sample_id: 'Mã mẫu',
  user_id: 'Mã người dùng',
  max_cartons: 'Sức chứa tối đa (cây)',
  created_at: 'Ngày tạo',
  updated_at: 'Cập nhật lúc'
};

const STATUS_VALUE_MAP = {
  stored: 'Đang lưu kho',
  pending: 'Chờ bố trí',
  boxed: 'Đã đóng thùng',
  destroyed: 'Đã tiêu hủy',
  approved: 'Đã duyệt',
  completed: 'Hoàn tất',
  rejected: 'Từ chối',
  active: 'Hoạt động'
};

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

function formatFieldValue(field, val) {
  if (val === null || val === undefined || val === '') return '(Trống)';
  if (typeof val === 'boolean') return val ? 'Có' : 'Không';
  if (field === 'status' && STATUS_VALUE_MAP[val]) return STATUS_VALUE_MAP[val];
  if ((field === 'sampling_time' || field === 'created_at' || field === 'updated_at') && typeof val === 'string') {
    return formatDateTime(val);
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function getDiffEntries(log) {
  const oldData = log?.old_data || {};
  const newData = log?.new_data || {};

  if (log.action === 'UPDATE') {
    const fields = Array.isArray(log.changed_fields) && log.changed_fields.length > 0
      ? log.changed_fields
      : Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)])).filter(
          (k) => k !== 'updated_at' && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])
        );
    return fields.map((field) => ({
      field,
      label: FIELD_LABEL_MAP[field] || field,
      oldVal: formatFieldValue(field, oldData[field]),
      newVal: formatFieldValue(field, newData[field])
    }));
  }

  if (log.action === 'INSERT') {
    const keys = Object.keys(newData).filter(
      (k) => k !== 'id' && k !== 'created_at' && k !== 'updated_at' && newData[k] !== null && newData[k] !== ''
    );
    return keys.map((field) => ({
      field,
      label: FIELD_LABEL_MAP[field] || field,
      oldVal: '(Chưa có)',
      newVal: formatFieldValue(field, newData[field])
    }));
  }

  if (log.action === 'DELETE') {
    const keys = Object.keys(oldData).filter(
      (k) => k !== 'created_at' && k !== 'updated_at' && oldData[k] !== null && oldData[k] !== ''
    );
    return keys.map((field) => ({
      field,
      label: FIELD_LABEL_MAP[field] || field,
      oldVal: formatFieldValue(field, oldData[field]),
      newVal: '(Đã xóa)'
    }));
  }

  return [];
}

const PAGE_SIZE = 30;

export default function WarehouseAuditLogsTab({ isAdmin = false, isDemoMode = false }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isMissingTableError, setIsMissingTableError] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tableName, setTableName] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)').matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const loadLogs = useCallback(async () => {
    if (!isAdmin) return;
    if (isDemoMode) {
      setLogs([]);
      setErrorMsg('');
      setIsMissingTableError(false);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setIsMissingTableError(false);
    try {
      const data = await fetchWarehouseAuditLogs({
        startDate,
        endDate,
        tableName,
        action: actionFilter,
        limit: 500
      });
      setLogs(data);
      setCurrentPage(1);
    } catch (err) {
      setLogs([]);
      setIsMissingTableError(isMissingAuditTableError(err));
      setErrorMsg(err?.message || 'Không thể tải nhật ký thay đổi kho.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isDemoMode, startDate, endDate, tableName, actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((row) => {
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
  }, [logs, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const paginatedLogs = filteredLogs.slice(startIdx, startIdx + PAGE_SIZE);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isAdmin) {
    return (
      <div className="table-card" style={{ textAlign: 'center', padding: '48px 20px' }}>
        <ShieldAlert size={40} color="var(--status-error)" style={{ marginBottom: '12px' }} />
        <h3 style={{ margin: '0 0 6px 0', color: 'var(--text-main)' }}>Không có quyền truy cập</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
          Chỉ Quản trị viên (Admin) mới được phép xem Nhật ký thay đổi kho.
        </p>
      </div>
    );
  }

  const inputStyle = {
    padding: '7px 11px',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '13px',
    minHeight: '36px'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="table-card">
        {/* Header */}
        <div
          className="table-header"
          style={{
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '16px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div>
            <h2 style={{ fontSize: '19px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-main)' }}>
              <FileText size={21} color="var(--accent-blue)" />
              Nhật Ký Thay Đổi Kho
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Ghi nhận tự động mọi thao tác thêm, cập nhật và xóa dữ liệu kho theo thời gian thực.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadLogs}
              disabled={loading}
              style={{ padding: '7px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {loading ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}
              Làm mới
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => exportAuditLogsToCsv(filteredLogs)}
              disabled={loading || filteredLogs.length === 0}
              style={{ padding: '7px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} />
              Xuất CSV
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: '10px',
            marginBottom: '16px',
            alignItems: 'end'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Từ ngày</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Đến ngày</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Đối tượng</label>
            <select
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              style={inputStyle}
            >
              {TABLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Loại thao tác</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={inputStyle}
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: isMobile ? 'span 1' : 'span 2' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Tìm kiếm</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                size={15}
                style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tên người sửa, nội dung, mã SKU, lý do..."
                style={{ ...inputStyle, width: '100%', paddingLeft: '32px' }}
              />
            </div>
          </div>
        </div>

        {/* Status / Error */}
        {errorMsg && (
          <div
            style={{
              padding: isMissingTableError ? '14px 16px' : '12px 14px',
              borderRadius: '8px',
              background: isMissingTableError ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: isMissingTableError ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(239, 68, 68, 0.3)',
              color: isMissingTableError ? 'var(--text-main)' : 'var(--status-error)',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: isMissingTableError ? 600 : 400, color: isMissingTableError ? '#D97706' : 'var(--status-error)' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
            {isMissingTableError && (
              <div style={{ paddingLeft: '24px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                <div>Để kích hoạt tính năng Nhật ký thay đổi kho trên Supabase thật, Quản trị viên cần:</div>
                <ol style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
                  <li>Mở <strong>Supabase Dashboard → SQL Editor → New Query</strong>.</li>
                  <li>Chạy toàn bộ nội dung file <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>backend/security/warehouse_audit_logs.sql</code>.</li>
                  <li>Nếu vừa chạy xong mà vẫn báo lỗi schema cache, chạy thêm lệnh <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>NOTIFY pgrst, &apos;reload schema&apos;;</code> (hoặc vào <strong>Settings → API → Reload schema cache</strong>), sau đó bấm nút <strong>Làm mới</strong> ở góc trên.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Loading / Empty / List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '44px 16px', color: 'var(--text-muted)' }}>
            <Loader size={30} className="spin" style={{ marginBottom: '10px' }} />
            <p style={{ margin: 0, fontSize: '13.5px' }}>Đang tải nhật ký thay đổi kho...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          !errorMsg && (
            <div style={{ textAlign: 'center', padding: '44px 16px', color: 'var(--text-muted)' }}>
              <FileText size={42} style={{ opacity: 0.3, marginBottom: '10px' }} />
              <p style={{ margin: 0, fontSize: '13.5px' }}>
                {isDemoMode
                  ? 'Chế độ Demo không kết nối bảng nhật ký Supabase.'
                  : 'Chưa có bản ghi thay đổi nào khớp với bộ lọc hiện tại.'}
              </p>
            </div>
          )
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                fontSize: '12.5px',
                color: 'var(--text-secondary)',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div>
                Hiển thị <strong style={{ color: 'var(--accent-blue)' }}>{filteredLogs.length}</strong> bản ghi
                {totalPages > 1 && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: '6px', fontVariantNumeric: 'tabular-nums' }}>
                    ({startIdx + 1} – {Math.min(startIdx + PAGE_SIZE, filteredLogs.length)})
                  </span>
                )}
              </div>
            </div>

            {!isMobile ? (
              /* PC Table View */
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', width: '160px' }}>Thời gian</th>
                      <th style={{ textAlign: 'left', width: '170px' }}>Người thay đổi</th>
                      <th style={{ textAlign: 'left', width: '110px' }}>Thao tác</th>
                      <th style={{ textAlign: 'left', width: '110px' }}>Đối tượng</th>
                      <th style={{ textAlign: 'left' }}>Nội dung tóm tắt & Lý do</th>
                      <th style={{ textAlign: 'right', width: '125px' }}>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLogs.map((log) => {
                      const badge = ACTION_BADGE_MAP[log.action] || {
                        label: log.action,
                        color: 'var(--text-secondary)',
                        bg: 'var(--bg-subtle)',
                        border: 'var(--border-color)'
                      };
                      const isExpanded = expandedIds.has(log.id);
                      const diffs = isExpanded ? getDiffEntries(log) : [];

                      return (
                        <React.Fragment key={log.id}>
                          <tr>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {formatDateTime(log.created_at)}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
                                {log.actor_name || 'Hệ thống'}
                              </div>
                              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                {ROLE_LABEL_MAP[log.actor_role] || log.actor_role || 'Không rõ'}
                              </div>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '3px 9px',
                                  borderRadius: '9999px',
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  color: badge.color,
                                  background: badge.bg,
                                  border: `1px solid ${badge.border}`,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                              {TABLE_LABEL_MAP[log.table_name] || log.table_name}
                            </td>
                            <td>
                              <div style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.45 }}>
                                {log.summary || '—'}
                              </div>
                              {log.reason && (
                                <div
                                  style={{
                                    marginTop: '4px',
                                    fontSize: '12px',
                                    color: 'var(--accent-blue)',
                                    background: 'rgba(15, 135, 255, 0.08)',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-block'
                                  }}
                                >
                                  Lý do: {log.reason}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => toggleExpand(log.id)}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '12px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                {isExpanded ? 'Ẩn' : 'Xem Diff'}
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={6} style={{ background: 'var(--bg-subtle)', padding: '12px 16px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                                  ID bản ghi: {log.record_id}
                                </div>
                                {diffs.length === 0 ? (
                                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                                    Không có chi tiết trường thay đổi.
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {diffs.map((d) => (
                                      <div
                                        key={d.field}
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: '180px 1fr 24px 1fr',
                                          gap: '8px',
                                          alignItems: 'center',
                                          padding: '6px 10px',
                                          borderRadius: '6px',
                                          background: 'var(--bg-card)',
                                          border: '1px solid var(--border-color)',
                                          fontSize: '12.5px'
                                        }}
                                      >
                                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{d.label}</span>
                                        <span
                                          style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            color: '#EF4444',
                                            wordBreak: 'break-word'
                                          }}
                                        >
                                          {d.oldVal}
                                        </span>
                                        <ArrowRight size={14} color="var(--text-muted)" />
                                        <span
                                          style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            color: '#10B981',
                                            wordBreak: 'break-word'
                                          }}
                                        >
                                          {d.newVal}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Mobile Card View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {paginatedLogs.map((log) => {
                  const badge = ACTION_BADGE_MAP[log.action] || {
                    label: log.action,
                    color: 'var(--text-secondary)',
                    bg: 'var(--bg-subtle)',
                    border: 'var(--border-color)'
                  };
                  const isExpanded = expandedIds.has(log.id);
                  const diffs = isExpanded ? getDiffEntries(log) : [];

                  return (
                    <div
                      key={log.id}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: badge.color,
                              background: badge.bg,
                              border: `1px solid ${badge.border}`
                            }}
                          >
                            {badge.label}
                          </span>
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                            {TABLE_LABEL_MAP[log.table_name] || log.table_name}
                          </span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>

                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-main)' }}>{log.actor_name || 'Hệ thống'}</strong>{' '}
                        <span>({ROLE_LABEL_MAP[log.actor_role] || log.actor_role || 'Không rõ'})</span>
                      </div>

                      <div style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.45 }}>
                        {log.summary || '—'}
                      </div>

                      {log.reason && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--accent-blue)',
                            background: 'rgba(15, 135, 255, 0.08)',
                            padding: '4px 8px',
                            borderRadius: '6px'
                          }}
                        >
                          Lý do: {log.reason}
                        </div>
                      )}

                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => toggleExpand(log.id)}
                        style={{
                          alignSelf: 'flex-start',
                          padding: '5px 10px',
                          fontSize: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {isExpanded ? 'Ẩn chi tiết' : 'Xem chi tiết Diff'}
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      {isExpanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px', borderTop: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            ID: {log.record_id}
                          </div>
                          {diffs.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Không có chi tiết thay đổi.</div>
                          ) : (
                            diffs.map((d) => (
                              <div
                                key={d.field}
                                style={{
                                  padding: '8px',
                                  borderRadius: '6px',
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--border-color)',
                                  fontSize: '12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px'
                                }}
                              >
                                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{d.label}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
                                    {d.oldVal}
                                  </span>
                                  <ArrowRight size={13} color="var(--text-muted)" />
                                  <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
                                    {d.newVal}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '16px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-color)'
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '6px 12px', fontSize: '12.5px' }}
                >
                  Trang trước
                </button>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  Trang {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: '6px 12px', fontSize: '12.5px' }}
                >
                  Trang sau
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
