import React from 'react';
import { GoogleIcon, User, Loader } from '../GoogleIcons';
import { formatCompactDeviceName, getDisplayDeviceName } from '../utils/deviceUtils';

export default function UserVisitorManagerTab({
  profilesList = [],
  allVisitorLogs = [],
  resetDevices = [],
  userMgmtSubTab = 'accounts',
  setUserMgmtSubTab,
  fetchUsersAndVisitors,
  usersLoading = false,
  editingProfileId = null,
  setEditingProfileId,
  editProfileName = '',
  setEditProfileName,
  editProfileCode = '',
  setEditProfileCode,
  editProfileDept = '',
  setEditProfileDept,
  editProfileRole = 'staff',
  setEditProfileRole,
  expandedUserHistoryId = null,
  setExpandedUserHistoryId,
  expandedVisitorHistoryId = null,
  setExpandedVisitorHistoryId,
  transactions = [],
  user = null,
  handleUpdateUserProfile,
  handleDeleteUserProfile,
  handleUnblockVisitor,
  handleResetVisitor,
  handleBlockVisitor,
  handleDeleteSavedVisitor,
  setRenameModalVisitor,
  setRenameNewName
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Bento KPI Mini Row */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-icon-box icon-box-blue">
            <GoogleIcon name="badge" style={{ fontSize: '22px' }} />
          </div>
          <div className="metric-data">
            <div className="metric-value">{profilesList.length} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)' }}>nhân sự</span></div>
            <div className="metric-label-row">
              <span className="metric-label">Tài khoản hệ thống nội bộ</span>
              <span className="metric-trend trend-up">Đã kích hoạt</span>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-box icon-box-green">
            <GoogleIcon name="admin_panel_settings" style={{ fontSize: '22px' }} />
          </div>
          <div className="metric-data">
            <div className="metric-value">{profilesList.filter(p => p.role === 'admin').length} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)' }}>tài khoản</span></div>
            <div className="metric-label-row">
              <span className="metric-label">Phân quyền Thủ kho (Admin)</span>
              <span className="metric-trend trend-up">Toàn quyền</span>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-box icon-box-red">
            <GoogleIcon name="devices" style={{ fontSize: '22px' }} />
          </div>
          <div className="metric-data">
            <div className="metric-value">{(() => {
              const map = new Map();
              allVisitorLogs.forEach(l => { if (l.device_id && !map.has(l.device_id)) map.set(l.device_id, l); });
              resetDevices.forEach(r => { if (r.device_id && !map.has(r.device_id)) map.set(r.device_id, { device_id: r.device_id, user_name: 'Thiết bị chưa rõ tên', searched_at: null }); });
              return map.size;
            })()} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)' }}>thiết bị</span></div>
            <div className="metric-label-row">
              <span className="metric-label">Khách quét mã QR tra cứu</span>
              <span className="metric-trend trend-up">Lưu vết</span>
            </div>
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <User size={22} color="#10b981" /> Quản Lý Tài Khoản & Khách Đã Lưu
          </h2>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`btn ${userMgmtSubTab === 'accounts' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setUserMgmtSubTab('accounts')}
              style={{ padding: '7px 16px', fontSize: '13px' }}
            >
              👤 Tài khoản hệ thống ({profilesList.length})
            </button>
            <button
              className={`btn ${userMgmtSubTab === 'visitors' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setUserMgmtSubTab('visitors')}
              style={{ padding: '7px 16px', fontSize: '13px' }}
            >
              📱 Khách & Thiết bị đã lưu ({(() => {
                const map = new Map();
                allVisitorLogs.forEach(l => { if (l.device_id && !map.has(l.device_id)) map.set(l.device_id, l); });
                resetDevices.forEach(r => { if (r.device_id && !map.has(r.device_id)) map.set(r.device_id, { device_id: r.device_id, user_name: 'Thiết bị chưa rõ tên', searched_at: null }); });
                return map.size;
              })()})
            </button>
            <button className="btn btn-secondary" onClick={fetchUsersAndVisitors} disabled={usersLoading} style={{ padding: '7px 14px', fontSize: '13px' }}>
              {usersLoading ? <Loader size={14} className="spin" /> : '🔄 Làm mới'}
            </button>
          </div>
        </div>

        {userMgmtSubTab === 'accounts' ? (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Danh sách các tài khoản đã đăng ký trong hệ thống (bảng <code>profiles</code>). Bạn có thể chỉnh sửa tên, mã nhân viên, phòng ban và phân quyền <strong>Thủ kho (Admin)</strong> hoặc <strong>Nhân viên (Staff)</strong>.
            </p>
            {profilesList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                Chưa có tài khoản nào được lưu trong bảng profiles.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '130px', whiteSpace: 'nowrap' }}>Họ và tên</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '80px', whiteSpace: 'nowrap' }}>Mã NV</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '95px', whiteSpace: 'nowrap' }}>Phòng ban</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '135px', whiteSpace: 'nowrap' }}>Vai trò (Quyền)</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '130px', whiteSpace: 'nowrap' }}>Hoạt động</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '80px', whiteSpace: 'nowrap' }}>Ngày tạo</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '175px', whiteSpace: 'nowrap' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profilesList.map((p, idx) => {
                      const isEditing = editingProfileId === p.id;
                      const isHistoryOpen = expandedUserHistoryId === p.id;
                      const userTxs = transactions.filter(t => t.user_id === p.id);
                      const userSearchItems = allVisitorLogs.filter(l => l.user_name === p.full_name && l.keyword !== '[Khai báo tên]');
                      const totalActions = userTxs.length + userSearchItems.length;

                      return (
                        <React.Fragment key={p.id}>
                          <tr style={{ borderBottom: isHistoryOpen ? 'none' : '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600, width: '130px', maxWidth: '130px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <input className="form-input" style={{ padding: '4px 7px', fontSize: '12px', width: '100%' }} value={editProfileName} onChange={e => setEditProfileName(e.target.value)} />
                              ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '100%' }}>
                                  <User size={13} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.full_name}>
                                    {p.full_name}
                                  </span>
                                  {p.id === user?.id && <span style={{ fontSize: '9.5px', background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '1px 4px', borderRadius: '4px', flexShrink: 0 }}>Bạn</span>}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', width: '80px', maxWidth: '80px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <input className="form-input" style={{ padding: '4px 7px', fontSize: '12px', width: '100%' }} value={editProfileCode} onChange={e => setEditProfileCode(e.target.value)} placeholder="Mã NV" />
                              ) : (
                                <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 5px', borderRadius: '4px', fontSize: '11px', display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.employee_code || '—'}</code>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', width: '95px', maxWidth: '95px', overflow: 'hidden', whiteSpace: 'nowrap' }} title={p.department || ''}>
                              {isEditing ? (
                                <input className="form-input" style={{ padding: '4px 7px', fontSize: '12px', width: '100%' }} value={editProfileDept} onChange={e => setEditProfileDept(e.target.value)} placeholder="Phòng ban" />
                              ) : (
                                <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.department || '—'}</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', width: '135px', maxWidth: '135px', whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <select className="form-select" style={{ padding: '4px 7px', fontSize: '12px', width: '100%' }} value={editProfileRole} onChange={e => setEditProfileRole(e.target.value)}>
                                  <option value="staff">Nhân viên (Staff)</option>
                                  <option value="admin">Thủ kho (Admin)</option>
                                </select>
                              ) : (
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  background: p.role === 'admin' ? 'rgba(15, 135, 255, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                                  color: p.role === 'admin' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                                  border: p.role === 'admin' ? '1px solid rgba(15, 135, 255, 0.3)' : '1px solid var(--glass-border)',
                                  display: 'inline-block',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}>
                                  {p.role === 'admin' ? '👑 Thủ kho' : '👤 Nhân viên'}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', width: '130px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'nowrap', fontSize: '11px' }}>
                                <span style={{ background: 'rgba(5, 150, 105, 0.12)', color: 'var(--status-success)', padding: '2px 6px', borderRadius: '5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {userTxs.length} GD
                                </span>
                                <span style={{ background: 'rgba(15, 135, 255, 0.12)', color: 'var(--accent-blue)', padding: '2px 6px', borderRadius: '5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {userSearchItems.length} tra cứu
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '11.5px', textAlign: 'center', width: '80px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }} title={p.created_at ? new Date(p.created_at).toLocaleString() : ''}>
                              {(() => {
                                if (!p.created_at) return '—';
                                const d = new Date(p.created_at);
                                const DD = String(d.getDate()).padStart(2, '0');
                                const MM = String(d.getMonth() + 1).padStart(2, '0');
                                const YY = String(d.getFullYear()).slice(-2);
                                return `${DD}/${MM}/${YY}`;
                              })()}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', width: '175px', whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <div style={{ display: 'inline-flex', gap: '4px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                                  <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '5px' }} onClick={() => handleUpdateUserProfile(p.id)}>
                                    Lưu
                                  </button>
                                  <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '5px' }} onClick={() => setEditingProfileId(null)}>
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'inline-flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                                  <button
                                    className="btn btn-secondary"
                                    style={{
                                      padding: '3px 7px',
                                      fontSize: '11px',
                                      borderRadius: '5px',
                                      color: isHistoryOpen ? '#fff' : 'var(--accent-blue)',
                                      background: isHistoryOpen ? 'var(--accent-blue)' : 'transparent',
                                      borderColor: 'var(--accent-blue)',
                                      whiteSpace: 'nowrap'
                                    }}
                                    onClick={() => setExpandedUserHistoryId(isHistoryOpen ? null : p.id)}
                                    title={`Xem lịch sử (${totalActions})`}
                                  >
                                    📜 Lịch sử
                                  </button>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '3px 7px', fontSize: '11px', borderRadius: '5px', color: '#7DBEFF', borderColor: 'rgba(125, 190, 255, 0.3)', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                      setEditingProfileId(p.id);
                                      setEditProfileName(p.full_name || '');
                                      setEditProfileCode(p.employee_code || '');
                                      setEditProfileDept(p.department || '');
                                      setEditProfileRole(p.role || 'staff');
                                    }}
                                  >
                                    ✏️ Sửa
                                  </button>
                                  {p.id !== user?.id && (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ padding: '3px 7px', fontSize: '11px', borderRadius: '5px', color: 'var(--status-error)', borderColor: 'rgba(239,68,68,0.3)', whiteSpace: 'nowrap' }}
                                      onClick={() => handleDeleteUserProfile(p)}
                                    >
                                      🗑️ Xóa
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                          {isHistoryOpen && (
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,23,42,0.5)' }}>
                              <td colSpan={7} style={{ padding: '14px 20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                  <strong style={{ fontSize: '13px', color: 'var(--accent-blue)' }}>
                                    📜 Nhật ký thao tác của tài khoản: {p.full_name} ({p.employee_code || 'Không mã NV'})
                                  </strong>
                                  <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setExpandedUserHistoryId(null)}>
                                    Đóng ×
                                  </button>
                                </div>
                                {(() => {
                                  const combined = [
                                    ...userTxs.map(t => ({
                                      id: `tx-${t.id}`,
                                      time: t.created_at,
                                      category: t.type === 'import' ? 'Nhập kho' : t.type === 'move' ? 'Di chuyển' : t.type === 'take_request' ? 'Đăng ký lấy mẫu' : t.type === 'take_approve' ? 'Duyệt cấp mẫu' : t.type === 'destroy' ? 'Hủy mẫu' : t.type,
                                      badgeColor: t.type === 'import' ? 'var(--status-success)' : t.type === 'move' ? '#7DBEFF' : t.type === 'take_request' ? 'var(--status-warning)' : t.type === 'take_approve' ? 'var(--accent-blue)' : 'var(--status-error)',
                                      product: t.samples?.products?.product_name || t.samples?.product_name || '—',
                                      qty: `${t.quantity || 0} bao`,
                                      detail: t.note || (t.status === 'pending' ? 'Đang chờ duyệt' : t.status === 'approved' ? 'Đã duyệt' : '')
                                    })),
                                    ...userSearchItems.map(s => ({
                                      id: `sr-${s.id}`,
                                      time: s.searched_at,
                                      category: 'Tra cứu',
                                      badgeColor: 'var(--accent-blue)',
                                      product: `Từ khóa: "${s.keyword}"`,
                                      qty: `${s.results_count} kết quả`,
                                      detail: s.month_filter ? `Lọc tháng: ${s.month_filter} • Thiết bị: ${getDisplayDeviceName(s.device_id)}` : `Thiết bị: ${getDisplayDeviceName(s.device_id)}`
                                    }))
                                  ].sort((a, b) => new Date(b.time) - new Date(a.time));

                                  if (combined.length === 0) {
                                    return (
                                      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                                        Tài khoản này chưa có lịch sử thao tác hoặc tra cứu nào.
                                      </div>
                                    );
                                  }

                                  return (
                                    <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                        <thead>
                                          <tr style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0 }}>
                                            <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Thời gian</th>
                                            <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Loại thao tác</th>
                                            <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Sản phẩm / Từ khóa</th>
                                            <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Số lượng / KQ</th>
                                            <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Chi tiết / Ghi chú</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {combined.slice(0, 100).map(item => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                              <td style={{ padding: '6px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {(() => {
                                                  if (!item.time) return '—';
                                                  const d = new Date(item.time);
                                                  const hh = String(d.getHours()).padStart(2, '0');
                                                  const mm = String(d.getMinutes()).padStart(2, '0');
                                                  const DD = String(d.getDate()).padStart(2, '0');
                                                  const MM = String(d.getMonth() + 1).padStart(2, '0');
                                                  const YY = String(d.getFullYear()).slice(-2);
                                                  return `${hh}:${mm} ${DD}/${MM}/${YY}`;
                                                })()}
                                              </td>
                                              <td style={{ padding: '6px 12px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: `${item.badgeColor}22`, color: item.badgeColor }}>
                                                  {item.category}
                                                </span>
                                              </td>
                                              <td style={{ padding: '6px 12px', fontWeight: 500 }}>{item.product}</td>
                                              <td style={{ padding: '6px 12px', fontWeight: 600 }}>{item.qty}</td>
                                              <td style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>{item.detail}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Danh sách các khách truy cập & thiết bị đã khai báo tên trên hệ thống. Bạn có thể yêu cầu khách khai báo lại tên, chặn truy cập thiết bị hoặc xóa khỏi danh sách.
            </p>
            {(() => {
              const visitorMap = new Map();
              allVisitorLogs.forEach(log => {
                if (!log.device_id) return;
                if (!visitorMap.has(log.device_id)) {
                  visitorMap.set(log.device_id, {
                    device_id: log.device_id,
                    user_name: log.user_name || 'Khách ẩn danh',
                    last_active: log.searched_at,
                    search_count: log.keyword === '[Khai báo tên]' ? 0 : 1,
                    last_keyword: log.keyword
                  });
                } else {
                  const entry = visitorMap.get(log.device_id);
                  if (log.keyword !== '[Khai báo tên]') entry.search_count += 1;
                  if ((entry.user_name === 'Khách ẩn danh' || entry.user_name === 'Thiết bị bị chặn') && log.user_name && log.user_name !== 'Khách ẩn danh') {
                    entry.user_name = log.user_name;
                  }
                }
              });
              resetDevices.forEach(r => {
                // Chỉ hiển thị thiết bị chưa có log nếu đang bị chặn để admin có thể gỡ chặn
                if (r.device_id && !visitorMap.has(r.device_id) && r.is_blocked) {
                  visitorMap.set(r.device_id, {
                    device_id: r.device_id,
                    user_name: 'Thiết bị bị chặn',
                    last_active: null,
                    search_count: 0,
                    last_keyword: '—'
                  });
                }
              });
              const visitorsList = Array.from(visitorMap.values());

              if (visitorsList.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Chưa có khách hoặc thiết bị nào được lưu.
                  </div>
                );
              }

              return (
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <th style={{ padding: '8px 8px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '115px', whiteSpace: 'nowrap' }}>Tên khách</th>
                        <th style={{ padding: '8px 8px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '85px', whiteSpace: 'nowrap' }}>Thiết bị</th>
                        <th style={{ padding: '8px 8px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '95px', whiteSpace: 'nowrap' }}>Lượt hoạt động</th>
                        <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '85px', whiteSpace: 'nowrap' }}>Gần nhất</th>
                        <th style={{ padding: '8px 8px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '75px', whiteSpace: 'nowrap' }}>Trạng thái</th>
                        <th style={{ padding: '8px 8px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, width: '285px', whiteSpace: 'nowrap' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visitorsList.map((v, idx) => {
                        const status = resetDevices.find(d => d.device_id === v.device_id);
                        const isBlocked = !!status && status.is_blocked;
                        const isPendingReset = !!status && !status.is_blocked && !status.reset_by?.startsWith('rename:');
                        const isVHistoryOpen = expandedVisitorHistoryId === v.device_id;
                        const vLogs = allVisitorLogs.filter(l => l.device_id === v.device_id && l.keyword !== '[Khai báo tên]');
                        const vTxs = transactions.filter(t => !t.user_id && t.note && t.note.includes(`[Khách: ${v.user_name}]`));
                        const totalVActions = vLogs.length + vTxs.length;

                        return (
                          <React.Fragment key={v.device_id}>
                            <tr style={{ borderBottom: isVHistoryOpen ? 'none' : '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                              <td style={{ padding: '8px 8px', fontWeight: 600, width: '115px', maxWidth: '115px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '100%' }}>
                                  <User size={13} color="#10b981" style={{ flexShrink: 0 }} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.user_name}>
                                    {v.user_name}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '8px 8px', color: 'var(--text-secondary)', width: '85px', maxWidth: '85px', overflow: 'hidden', whiteSpace: 'nowrap' }} title={`${getDisplayDeviceName(v.device_id)} (${v.device_id})`}>
                                <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: '4px', fontSize: '10.5px', display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle' }}>
                                  {formatCompactDeviceName(getDisplayDeviceName(v.device_id))}
                                </code>
                              </td>
                              <td style={{ padding: '8px 8px', width: '95px', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'nowrap' }}>
                                  <span style={{ background: 'rgba(15, 135, 255, 0.12)', color: 'var(--accent-blue)', padding: '2px 5px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {v.search_count} tra cứu
                                  </span>
                                  {vTxs.length > 0 && (
                                    <span style={{ background: 'rgba(125, 190, 255, 0.12)', color: '#7DBEFF', padding: '2px 5px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                      {vTxs.length} mẫu
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '8px 8px', color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', width: '85px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }} title={v.last_active ? new Date(v.last_active).toLocaleString() : ''}>
                                {(() => {
                                  if (!v.last_active) return '—';
                                  const d = new Date(v.last_active);
                                  const hh = String(d.getHours()).padStart(2, '0');
                                  const mm = String(d.getMinutes()).padStart(2, '0');
                                  const DD = String(d.getDate()).padStart(2, '0');
                                  const MM = String(d.getMonth() + 1).padStart(2, '0');
                                  const YY = String(d.getFullYear()).slice(-2);
                                  return `${hh}:${mm} ${DD}/${MM}/${YY}`;
                                })()}
                              </td>
                              <td style={{ padding: '8px 8px', textAlign: 'center', width: '75px', whiteSpace: 'nowrap' }}>
                                {isBlocked ? (
                                  <span style={{ fontSize: '10px', background: 'rgba(239,68,68,0.15)', color: 'var(--status-error)', padding: '2px 4px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap' }}>🚫 Bị chặn</span>
                                ) : isPendingReset ? (
                                  <span style={{ fontSize: '10px', background: 'rgba(245,158,11,0.15)', color: 'var(--status-warning)', padding: '2px 4px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap' }}>⏳ Chờ</span>
                                ) : (
                                  <span style={{ fontSize: '10px', background: 'rgba(16,185,129,0.12)', color: '#10b981', padding: '2px 4px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Tốt</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 8px', textAlign: 'right', width: '285px', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: '3px', justifyContent: 'flex-end', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedVisitorHistoryId(isVHistoryOpen ? null : v.device_id)}
                                    title={`Xem lịch sử thao tác (${totalVActions})`}
                                    style={{
                                      background: isVHistoryOpen ? 'var(--accent-blue)' : 'rgba(59,130,246,0.12)',
                                      border: '1px solid var(--accent-blue)',
                                      color: isVHistoryOpen ? '#fff' : 'var(--accent-blue)',
                                      borderRadius: '5px',
                                      padding: '2.5px 5.5px',
                                      fontSize: '10.5px',
                                      cursor: 'pointer',
                                      fontWeight: 600,
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    📜 Lịch sử
                                  </button>
                                  {isBlocked ? (
                                    <button
                                      type="button"
                                      onClick={() => handleUnblockVisitor(v.device_id, v.user_name)}
                                      style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--status-success)', borderRadius: '5px', padding: '2.5px 5.5px', fontSize: '10.5px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                                    >
                                      🟢 Gỡ
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRenameModalVisitor({ deviceId: v.device_id, currentName: v.user_name });
                                          setRenameNewName(v.user_name || '');
                                        }}
                                        title="Admin trực tiếp đổi tên cho khách này"
                                        style={{
                                          background: 'rgba(201,164,106,0.12)',
                                          border: '1px solid rgba(201,164,106,0.35)',
                                          color: 'var(--bento-kraft)',
                                          borderRadius: '5px',
                                          padding: '2.5px 5.5px',
                                          fontSize: '10.5px',
                                          cursor: 'pointer',
                                          fontWeight: 600,
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        ✏️ Đổi
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleResetVisitor(v.device_id, v.user_name)}
                                        disabled={isPendingReset}
                                        title="Bắt buộc thiết bị này phải khai lại tên vào lần truy cập sau"
                                        style={{
                                          background: isPendingReset ? 'rgba(255,255,255,0.05)' : 'rgba(245,158,11,0.12)',
                                          border: isPendingReset ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(245,158,11,0.3)',
                                          color: isPendingReset ? 'var(--text-muted)' : 'var(--status-warning)',
                                          borderRadius: '5px',
                                          padding: '2.5px 5.5px',
                                          fontSize: '10.5px',
                                          cursor: isPendingReset ? 'not-allowed' : 'pointer',
                                          fontWeight: 600,
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        🔄 Khai lại
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleBlockVisitor(v.device_id, v.user_name)}
                                        title="Chặn thiết bị này truy cập"
                                        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--status-error)', borderRadius: '5px', padding: '2.5px 5.5px', fontSize: '10.5px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                                      >
                                        🚫 Chặn
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSavedVisitor(v.device_id, v.user_name)}
                                    title="Xóa khách này khỏi danh sách đã lưu"
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', borderRadius: '5px', padding: '2.5px 5.5px', fontSize: '10.5px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                  >
                                    🗑️ Xóa
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isVHistoryOpen && (
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,23,42,0.5)' }}>
                                <td colSpan={6} style={{ padding: '14px 20px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <strong style={{ fontSize: '13px', color: '#10b981' }}>
                                      📜 Lịch sử tra cứu & đăng ký lấy mẫu của khách: {v.user_name} ({getDisplayDeviceName(v.device_id)})
                                    </strong>
                                    <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setExpandedVisitorHistoryId(null)}>
                                      Đóng ×
                                    </button>
                                  </div>
                                  {(() => {
                                    const combinedV = [
                                      ...vTxs.map(t => ({
                                        id: `vtx-${t.id}`,
                                        time: t.created_at,
                                        category: 'Đăng ký lấy mẫu',
                                        badgeColor: '#f59e0b',
                                        target: t.samples?.products?.product_name || t.samples?.product_name || '—',
                                        qty: `${t.quantity || 0} bao`,
                                        detail: `${t.status === 'pending' ? '⏳ Chờ duyệt' : t.status === 'approved' ? '✅ Đã cấp' : t.status} • ${t.note || ''}`
                                      })),
                                      ...vLogs.map(l => ({
                                        id: `vl-${l.id}`,
                                        time: l.searched_at,
                                        category: l.keyword === '[Truy cập bị chặn]' ? 'Bị chặn truy cập' : 'Tra cứu',
                                        badgeColor: l.keyword === '[Truy cập bị chặn]' ? '#ef4444' : '#0ea5e9',
                                        target: `Từ khóa: "${l.keyword}"`,
                                        qty: `${l.results_count} kết quả`,
                                        detail: l.month_filter ? `Lọc tháng: ${l.month_filter}` : 'Tất cả các tháng'
                                      }))
                                    ].sort((a, b) => new Date(b.time) - new Date(a.time));

                                    if (combinedV.length === 0) {
                                      return (
                                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                                          Thiết bị này mới khai báo tên, chưa thực hiện lượt tra cứu hoặc đăng ký lấy mẫu nào.
                                        </div>
                                      );
                                    }

                                    return (
                                      <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                          <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0 }}>
                                              <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Thời gian</th>
                                              <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Loại thao tác</th>
                                              <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Sản phẩm / Từ khóa</th>
                                              <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Số lượng / KQ</th>
                                              <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>Chi tiết</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {combinedV.slice(0, 100).map(item => (
                                              <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <td style={{ padding: '6px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                  {item.time ? new Date(item.time).toLocaleString() : '—'}
                                                </td>
                                                <td style={{ padding: '6px 12px' }}>
                                                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: `${item.badgeColor}22`, color: item.badgeColor }}>
                                                    {item.category}
                                                  </span>
                                                </td>
                                                <td style={{ padding: '6px 12px', fontWeight: 500, whiteSpace: 'nowrap' }} title={item.target}>
                                                  {item.target && item.target.length > 25 ? item.target.slice(0, 25) + '...' : (item.target || '—')}
                                                </td>
                                                <td style={{ padding: '6px 12px', fontWeight: 600 }}>{item.qty}</td>
                                                <td style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>{item.detail}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

