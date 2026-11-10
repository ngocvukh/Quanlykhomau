import React from 'react';
import { GoogleIcon, FileText, Search, Loader, User } from '../GoogleIcons';
import { formatCompactDeviceName, getDisplayDeviceName } from '../utils/deviceUtils';

export default function SearchLogsTab({
  searchLogs = [],
  searchLogsLoading = false,
  logFilterStartDate = '',
  setLogFilterStartDate,
  logFilterEndDate = '',
  setLogFilterEndDate,
  searchLogsPage = 1,
  setSearchLogsPage,
  fetchSearchLogs,
  resetDevices = [],
  handleUnblockVisitor,
  handleResetVisitor,
  handleBlockVisitor,
  setRenameModalVisitor,
  setRenameNewName
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Bento KPI Mini Row */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-icon-box icon-box-blue">
            <GoogleIcon name="history" style={{ fontSize: '22px' }} />
          </div>
          <div className="metric-data">
            <div className="metric-value">{searchLogs.length} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)' }}>lượt</span></div>
            <div className="metric-label-row">
              <span className="metric-label">Tổng lượt tìm kiếm mẫu</span>
              <span className="metric-trend trend-up">Ghi nhận</span>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-box icon-box-green">
            <GoogleIcon name="date_range" style={{ fontSize: '22px' }} />
          </div>
          <div className="metric-data">
            <div className="metric-value">{logFilterStartDate ? logFilterStartDate.split('-').reverse().join('/') : 'Tất cả'} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)' }}>- {logFilterEndDate ? logFilterEndDate.split('-').reverse().join('/') : 'nay'}</span></div>
            <div className="metric-label-row">
              <span className="metric-label">Khoảng ngày lọc dữ liệu</span>
              <span className="metric-trend trend-up">Linh hoạt</span>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-box icon-box-red">
            <GoogleIcon name="device_hub" style={{ fontSize: '22px' }} />
          </div>
          <div className="metric-data">
            <div className="metric-value">{new Set(searchLogs.map(l => l.device_id).filter(Boolean)).size} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)' }}>thiết bị</span></div>
            <div className="metric-label-row">
              <span className="metric-label">Khách & nhân sự tra cứu</span>
              <span className="metric-trend trend-up">Hoạt động</span>
            </div>
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <FileText size={22} color="var(--accent-blue)" /> Nhật Ký Tìm Kiếm Mẫu
          </h2>
          
          {/* Bộ lọc khoảng ngày */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Từ ngày:</span>
              <input 
                type="date" 
                value={logFilterStartDate} 
                onChange={e => setLogFilterStartDate(e.target.value)}
                style={{ padding: '6px 12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', fontSize: '13px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Đến ngày:</span>
              <input 
                type="date" 
                value={logFilterEndDate} 
                onChange={e => setLogFilterEndDate(e.target.value)}
                style={{ padding: '6px 12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', fontSize: '13px' }}
              />
            </div>
            <button className="btn btn-primary" onClick={fetchSearchLogs} disabled={searchLogsLoading} style={{ padding: '6px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {searchLogsLoading ? <Loader size={14} className="spin" /> : <Search size={14} />} Lọc dữ liệu
            </button>
          </div>
        </div>

        {searchLogsLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <Loader size={32} className="spin" style={{ marginBottom: '12px' }} />
            <p>Đang tải nhật ký...</p>
          </div>
        ) : searchLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <FileText size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p>Chưa có nhật ký tìm kiếm nào.</p>
          </div>
        ) : (() => {
          const SEARCH_LOGS_PAGE_SIZE = 30;
          const totalLogPages = Math.max(1, Math.ceil(searchLogs.length / SEARCH_LOGS_PAGE_SIZE));
          const currentLogPage = Math.min(searchLogsPage, totalLogPages);
          const startLogIdx = (currentLogPage - 1) * SEARCH_LOGS_PAGE_SIZE;
          const paginatedLogs = searchLogs.slice(startLogIdx, startLogIdx + SEARCH_LOGS_PAGE_SIZE);

          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div>
                  Tổng cộng <strong style={{ color: 'var(--accent-blue)' }}>{searchLogs.length}</strong> lượt tìm kiếm được ghi nhận
                  {totalLogPages > 1 && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontVariantNumeric: 'tabular-nums' }}>
                      (Hiển thị {startLogIdx + 1} – {Math.min(startLogIdx + SEARCH_LOGS_PAGE_SIZE, searchLogs.length)})
                    </span>
                  )}
                </div>
                {totalLogPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '4px' }}>
                      Trang {currentLogPage} / {totalLogPages}
                    </span>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px', opacity: currentLogPage === 1 ? 0.4 : 1, cursor: currentLogPage === 1 ? 'not-allowed' : 'pointer' }}
                      disabled={currentLogPage === 1}
                      onClick={() => setSearchLogsPage(p => Math.max(1, p - 1))}
                    >
                      ← Trước
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px', opacity: currentLogPage === totalLogPages ? 0.4 : 1, cursor: currentLogPage === totalLogPages ? 'not-allowed' : 'pointer' }}
                      disabled={currentLogPage === totalLogPages}
                      onClick={() => setSearchLogsPage(p => Math.min(totalLogPages, p + 1))}
                    >
                      Sau →
                    </button>
                  </div>
                )}
              </div>
              {/* Desktop View: Bảng tra cứu tối ưu cột & không bị vỡ dòng */}
              <div className="search-logs-desktop-view">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '95px', whiteSpace: 'nowrap' }}>Thời gian</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '120px', whiteSpace: 'nowrap' }}>Tên người dùng</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '95px', whiteSpace: 'nowrap' }}>Thiết bị</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '135px', maxWidth: '135px', whiteSpace: 'nowrap' }}>Từ khóa</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '65px', whiteSpace: 'nowrap' }}>Lọc tháng</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '70px', whiteSpace: 'nowrap' }}>Kết quả</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '160px', whiteSpace: 'nowrap' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLogs.map((log, i) => {
                      const status = resetDevices.find(d => d.device_id === log.device_id);
                      const isBlocked = !!status && status.is_blocked;
                      const isPendingReset = !!status && !status.is_blocked && !status.reset_by?.startsWith('rename:');

                      return (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '11.5px', fontVariantNumeric: 'tabular-nums' }} title={new Date(log.searched_at).toLocaleString()}>
                            {(() => {
                              const d = new Date(log.searched_at);
                              const hh = String(d.getHours()).padStart(2, '0');
                              const mm = String(d.getMinutes()).padStart(2, '0');
                              const DD = String(d.getDate()).padStart(2, '0');
                              const MM = String(d.getMonth() + 1).padStart(2, '0');
                              const YY = String(d.getFullYear()).slice(-2);
                              return `${hh}:${mm} ${DD}/${MM}/${YY}`;
                            })()}
                          </td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600, maxWidth: '100%', overflow: 'hidden' }}>
                              <User size={12} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.user_name}>
                                {log.user_name}
                              </span>
                              {isBlocked && (
                                <span style={{ fontSize: '9.5px', background: 'rgba(239,68,68,0.15)', color: 'var(--status-error)', padding: '1px 4px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.3)', flexShrink: 0 }}>🚫 Chặn</span>
                              )}
                              {!isBlocked && isPendingReset && (
                                <span style={{ fontSize: '9.5px', background: 'rgba(245,158,11,0.15)', color: 'var(--status-warning)', padding: '1px 4px', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.3)', flexShrink: 0 }}>⏳ Chờ</span>
                              )}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title={`${getDisplayDeviceName(log.device_id)} (${log.device_id})`}>
                            <code style={{
                              background: 'rgba(255,255,255,0.06)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10.5px',
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                              maxWidth: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              verticalAlign: 'middle'
                            }}>
                              {formatCompactDeviceName(getDisplayDeviceName(log.device_id))}
                            </code>
                          </td>
                          <td style={{ padding: '8px 10px', width: '135px', maxWidth: '135px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            <span
                              title={log.keyword}
                              style={{
                                background: 'rgba(99,102,241,0.15)',
                                color: 'var(--accent-blue)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontWeight: 600,
                                fontSize: '11.5px',
                                display: 'inline-block',
                                maxWidth: '115px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                verticalAlign: 'middle'
                              }}
                            >
                              🔍 {log.keyword && log.keyword.length > 25 ? log.keyword.slice(0, 25) + '...' : (log.keyword || '')}
                            </span>
                          </td>
                          <td style={{ padding: '8px 6px', color: 'var(--text-muted)', fontSize: '11.5px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {log.month_filter || <span style={{ opacity: 0.4 }}>Tất cả</span>}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ 
                              fontWeight: 'bold', 
                              color: log.results_count === 0 ? 'var(--status-error)' : 'var(--status-success)',
                              background: log.results_count === 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                              padding: '2px 6px', borderRadius: '6px', fontSize: '11px',
                              whiteSpace: 'nowrap', display: 'inline-block'
                            }}>
                              {log.results_count} mẫu
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                              {isBlocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnblockVisitor(log.device_id, log.user_name)}
                                  title="Bỏ chặn thiết bị này"
                                  style={{
                                    background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                                    color: 'var(--status-success)', borderRadius: '5px',
                                    padding: '3px 7px', fontSize: '11px', cursor: 'pointer',
                                    fontWeight: 600, whiteSpace: 'nowrap'
                                  }}
                                >
                                  🟢 Gỡ chặn
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRenameModalVisitor({ deviceId: log.device_id, currentName: log.user_name });
                                      setRenameNewName(log.user_name || '');
                                    }}
                                    title="Admin trực tiếp đổi tên cho khách này"
                                    style={{
                                      background: 'rgba(201,164,106,0.12)',
                                      border: '1px solid rgba(201,164,106,0.3)',
                                      color: 'var(--bento-kraft)',
                                      borderRadius: '5px',
                                      padding: '3px 7px', fontSize: '11px', cursor: 'pointer',
                                      fontWeight: 600, whiteSpace: 'nowrap'
                                    }}
                                  >
                                    ✏️ Đổi
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResetVisitor(log.device_id, log.user_name)}
                                    title="Yêu cầu thiết bị này nhập lại tên vào lần truy cập sau"
                                    disabled={isPendingReset}
                                    style={{
                                      background: isPendingReset ? 'rgba(255,255,255,0.05)' : 'rgba(245,158,11,0.12)', 
                                      border: isPendingReset ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(245,158,11,0.3)',
                                      color: isPendingReset ? 'var(--text-muted)' : 'var(--status-warning)', 
                                      borderRadius: '5px',
                                      padding: '3px 7px', fontSize: '11px', cursor: isPendingReset ? 'not-allowed' : 'pointer',
                                      fontWeight: 600, whiteSpace: 'nowrap'
                                    }}
                                  >
                                    🔄 Khai lại
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleBlockVisitor(log.device_id, log.user_name)}
                                    title="Chặn thiết bị này truy cập hệ thống"
                                    style={{
                                      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                                      color: 'var(--status-error)', borderRadius: '5px',
                                      padding: '3px 7px', fontSize: '11px', cursor: 'pointer',
                                      fontWeight: 600, whiteSpace: 'nowrap'
                                    }}
                                  >
                                    🚫 Chặn
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile & Tablet Card View: Không cần cuộn ngang, nút bấm to rõ ràng */}
              <div className="search-logs-mobile-view">
                {paginatedLogs.map((log) => {
                  const status = resetDevices.find(d => d.device_id === log.device_id);
                  const isBlocked = !!status && status.is_blocked;
                  const isPendingReset = !!status && !status.is_blocked && !status.reset_by?.startsWith('rename:');

                  return (
                    <div key={log.id} className="search-log-card">
                      <div className="search-log-card-header">
                        <div className="search-log-card-user">
                          <User size={14} color="var(--accent-blue)" />
                          <span>{log.user_name}</span>
                          {isBlocked && (
                            <span style={{ fontSize: '10px', background: 'rgba(239,68,68,0.15)', color: 'var(--status-error)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.3)' }}>🚫 Bị chặn</span>
                          )}
                          {!isBlocked && isPendingReset && (
                            <span style={{ fontSize: '10px', background: 'rgba(245,158,11,0.15)', color: 'var(--status-warning)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.3)' }}>⏳ Chờ nhập lại</span>
                          )}
                        </div>
                        <span className="search-log-card-time">
                          {new Date(log.searched_at).toLocaleString()}
                        </span>
                      </div>

                      <div className="search-log-card-body">
                        <span style={{
                          background: 'rgba(99,102,241,0.15)',
                          color: 'var(--accent-blue)',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontWeight: 600,
                          fontSize: '12.5px',
                          maxWidth: '100%',
                          wordBreak: 'break-word'
                        }}>
                          🔍 {log.keyword && log.keyword.length > 25 ? log.keyword.slice(0, 25) + '...' : (log.keyword || '')}
                        </span>
                        <span style={{ 
                          fontWeight: 'bold', 
                          color: log.results_count === 0 ? 'var(--status-error)' : 'var(--status-success)',
                          background: log.results_count === 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                          padding: '3px 9px', borderRadius: '10px', fontSize: '11.5px'
                        }}>
                          {log.results_count} mẫu
                        </span>
                        {log.month_filter && (
                          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: '6px' }}>
                            Tháng {log.month_filter}
                          </span>
                        )}
                      </div>

                      <div className="search-log-card-meta">
                        <span>💻 {getDisplayDeviceName(log.device_id)}</span>
                      </div>

                      <div className="search-log-card-actions">
                        {isBlocked ? (
                          <button
                            type="button"
                            onClick={() => handleUnblockVisitor(log.device_id, log.user_name)}
                            style={{
                              background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                              color: 'var(--status-success)'
                            }}
                          >
                            🟢 Gỡ chặn
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setRenameModalVisitor({ deviceId: log.device_id, currentName: log.user_name });
                                setRenameNewName(log.user_name || '');
                              }}
                              style={{
                                background: 'rgba(201,164,106,0.12)',
                                border: '1px solid rgba(201,164,106,0.3)',
                                color: 'var(--bento-kraft)'
                              }}
                            >
                              ✏️ Đổi tên
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetVisitor(log.device_id, log.user_name)}
                              disabled={isPendingReset}
                              style={{
                                background: isPendingReset ? 'rgba(255,255,255,0.05)' : 'rgba(245,158,11,0.12)', 
                                border: isPendingReset ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(245,158,11,0.3)',
                                color: isPendingReset ? 'var(--text-muted)' : 'var(--status-warning)'
                              }}
                            >
                              🔄 {isPendingReset ? 'Chờ khai lại' : 'Khai lại tên'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBlockVisitor(log.device_id, log.user_name)}
                              style={{
                                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                                color: 'var(--status-error)'
                              }}
                            >
                              🚫 Chặn
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Phân trang: 30 mục / trang */}
              {totalLogPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 18px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--glass-border)', flexWrap: 'wrap', gap: '12px', fontVariantNumeric: 'tabular-nums' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Hiển thị <strong>{startLogIdx + 1}</strong> – <strong>{Math.min(startLogIdx + SEARCH_LOGS_PAGE_SIZE, searchLogs.length)}</strong> trong tổng số <strong>{searchLogs.length}</strong> lượt tìm kiếm (Trang {currentLogPage}/{totalLogPages})
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12.5px', opacity: currentLogPage === 1 ? 0.4 : 1, cursor: currentLogPage === 1 ? 'not-allowed' : 'pointer' }}
                      disabled={currentLogPage === 1}
                      onClick={() => setSearchLogsPage(p => Math.max(1, p - 1))}
                    >
                      ← Trước
                    </button>

                    {Array.from({ length: totalLogPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalLogPages || Math.abs(p - currentLogPage) <= 2)
                      .map((p, idx, arr) => {
                        const prev = arr[idx - 1];
                        return (
                          <React.Fragment key={p}>
                            {prev && p - prev > 1 && (
                              <span style={{ color: 'var(--text-muted)', padding: '0 4px', fontSize: '12px' }}>...</span>
                            )}
                            <button
                              className={`btn ${currentLogPage === p ? 'btn-primary' : 'btn-secondary'}`}
                              style={{
                                minWidth: '34px',
                                height: '32px',
                                padding: '0 8px',
                                fontSize: '12.5px',
                                fontWeight: currentLogPage === p ? 'bold' : 'normal',
                                borderColor: currentLogPage === p ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)'
                              }}
                              onClick={() => setSearchLogsPage(p)}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })}

                    <button
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12.5px', opacity: currentLogPage === totalLogPages ? 0.4 : 1, cursor: currentLogPage === totalLogPages ? 'not-allowed' : 'pointer' }}
                      disabled={currentLogPage === totalLogPages}
                      onClick={() => setSearchLogsPage(p => Math.min(totalLogPages, p + 1))}
                    >
                      Sau →
                    </button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

