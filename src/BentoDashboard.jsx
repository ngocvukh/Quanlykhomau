import React, { useState } from 'react';
import {
  Warehouse, Search, Camera, Printer, Layers, Box, Plus,
  ArrowRightLeft, CheckSquare, Clock, ClipboardList, UploadCloud, FileText,
  User, ChevronRight, X
} from 'lucide-react';

const SLOT_MAX_WIDTH_MM = 700;
const FORMAT_CAPACITIES = {
  'Kingsize': { width: 90, columns: 7, height: 6, total: 42 },
  'SuperSlim': { width: 105, columns: 6, height: 10, total: 60 },
  'Semi': { width: 98, columns: 7, height: 6, total: 42 },
  'Demi': { width: 90, columns: 7, height: 7, total: 49 },
};
const getFormatSpec = (fmt) => FORMAT_CAPACITIES[fmt] || FORMAT_CAPACITIES['Kingsize'];

const parseRequesterFromNote = (note, profileName) => {
  if (profileName) return profileName;
  const raw = (note || '').trim();
  const m = raw.match(/^\[Khách:\s*([^\]]+)\]\s*(.*)$/i);
  if (m) return m[1].trim();
  return raw || 'Nhân viên QC';
};

export default function BentoDashboard({
  samples = [],
  products = [],
  boxes = [],
  printQueue = [],
  transactions = [],
  getExpiredSamples = () => [],
  getApproachingExpiredSamples = () => [],
  slotConfigs = [],
  setActiveTab,
  setMobileShelfFilter,
  setSelectedSlot,
  handleSearchInputChange = () => {},
  setPreviousTabBeforeSearch = () => {},
  profile = null,
  fetchSearchLogs = () => {},
  fetchUsersAndVisitors = () => {}
}) {
  const [selectedShelfSheet, setSelectedShelfSheet] = useState(null);
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  const isAdmin = profile?.role === 'admin';
  const shelfLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

  const getProductName = (s) => {
    if (!s) return 'Mẫu thuốc lá';
    if (s.products?.product_name) return s.products.product_name;
    if (s.product_name) return s.product_name;
    const found = products.find(p => p.id === s.product_id);
    return found?.product_name || 'Mẫu thuốc lá';
  };

  // ── 1. Số liệu mẫu đang lưu trên 6 kệ ──
  const storedSamples = samples.filter(s => s.status === 'stored' && (s.available_qty || 0) > 0);
  const totalCartons = Math.ceil(
    storedSamples
      .filter(s => s.slot !== 5)
      .reduce((sum, s) => sum + (s.available_qty || 0) / 10, 0)
  );
  const totalLoosePacks = storedSamples
    .filter(s => s.slot === 5)
    .reduce((sum, s) => sum + (s.available_qty || 0), 0);

  // ── 2. Yêu cầu lấy mẫu chờ duyệt (đúng chuẩn schema transactions) ──
  const pendingRequests = transactions.filter(t => t.type === 'take_request' && t.status === 'pending');

  // ── 3. Mẫu quá hạn & sắp hết hạn 12 tháng ──
  const expiredSamplesList = getExpiredSamples ? getExpiredSamples() : [];
  const approachingSamplesList = getApproachingExpiredSamples ? getApproachingExpiredSamples() : [];
  const alertSamplesList = [...expiredSamplesList, ...approachingSamplesList];

  // ── 4. Tính toán tỉ lệ đầy thực tế cho 6 kệ A -> F (khớp 100% logic tab Sơ đồ kệ) ──
  const shelfStats = shelfLetters.map((letter, idx) => {
    const shelfNum = idx + 1;
    const slotStats = [1, 2, 3, 4].map(slot => {
      const slotSamples = storedSamples.filter(s => s.shelf === shelfNum && s.slot === slot);
      const config = slotConfigs.find(
        c => c.shelf === shelfNum && c.slot === slot && (c.column_number === 0 || !c.column_number)
      );
      const isMarkedFull = config?.is_full || false;

      let cartonsInSlot = 0;
      let utilization = 0;
      slotSamples.forEach(s => {
        const p = s.products || products.find(pr => pr.id === s.product_id);
        const format = p?.format || 'Kingsize';
        const spec = getFormatSpec(format);
        cartonsInSlot += (s.available_qty || 0) / 10;
        utilization += (((s.available_qty || 0) / 10) / spec.height) * (spec.width / SLOT_MAX_WIDTH_MM);
      });

      let pct = isMarkedFull ? 100 : Math.min(Math.round(utilization * 100), 100);
      if (pct === 0 && slotSamples.length > 0) pct = 12;

      return {
        slot,
        pct,
        isMarkedFull,
        sampleCount: slotSamples.length,
        cartons: Math.ceil(cartonsInSlot),
        note: config?.note || ''
      };
    });

    const looseSamples = storedSamples.filter(s => s.shelf === shelfNum && s.slot === 5);
    const loosePacks = looseSamples.reduce((sum, s) => sum + (s.available_qty || 0), 0);

    return {
      letter,
      shelfNum,
      slotStats,
      loosePacks,
      looseCount: looseSamples.length
    };
  });

  // ── 5. Hàng đợi in tem Tommy 135 (21 tem / trang A4) ──
  const readyStickersCount = printQueue
    .filter(s => s.status !== 'pending' && (s.shelf || s.box_id))
    .reduce((sum, s) => sum + Math.max(1, Math.floor((s.available_qty || 10) / 10)), 0);
  const fullSheets = Math.floor(readyStickersCount / 21);
  const remainderStickers = readyStickersCount % 21;
  const totalSheetsNeeded = Math.ceil(readyStickersCount / 21) || 0;

  const handleQuickSearchSubmit = (e) => {
    e.preventDefault();
    if (localSearchQuery.trim()) {
      handleSearchInputChange(localSearchQuery.trim());
      setPreviousTabBeforeSearch('dashboard');
      setActiveTab('search');
    } else {
      setActiveTab('search');
    }
  };

  return (
    <div className="bento-dashboard-wrap">
      
      {/* ── TOP ACTION BAR: TÌM KIẾM NHANH & QUÉT QR ── */}
      <div className="bento-top-bar">
        <form onSubmit={handleQuickSearchSubmit} className="bento-search-box">
          <Search size={16} className="bento-search-icon" />
          <input
            type="text"
            placeholder="Tìm nhanh tên mẫu thuốc lá, mã SKU, mẻ sợi, đơn hàng..."
            value={localSearchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setLocalSearchQuery(val);
              if (val.trim().length >= 2) {
                handleSearchInputChange(val);
                setPreviousTabBeforeSearch('dashboard');
                setActiveTab('search');
              }
            }}
          />
          <button type="submit" className="bento-search-submit-btn">
            Tra cứu
          </button>
        </form>

        {isAdmin && (
          <button 
            className="bento-scan-cta-btn"
            onClick={() => setActiveTab('audit')}
            title="Bật camera quét mã QR kiểm kê liên tục"
          >
            <Camera size={16} />
            <span>Quét QR</span>
          </button>
        )}
      </div>

      {/* ══════════════ LƯỚI BENTO CHÍNH ══════════════ */}
      <div className="bento-grid">
        
        {/* ── HERO TILE: SƠ ĐỒ 6 KỆ KHO A - F (CHIẾM 2 CỘT DESKTOP / 2 CỘT MOBILE) ── */}
        <div
          className={`bento-tile bento-tile-shelf-hero ${!isAdmin ? 'bento-hero-full' : ''}`}
          onClick={() => setSelectedShelfSheet(shelfStats[0])}
        >
          <div className="bento-tile-header">
            <div className="bento-tile-title">
              <Warehouse size={18} className="bento-icon-kraft" />
              <div>
                <h3>Sơ đồ 6 kệ kho A – F</h3>
                <span className="bento-tile-subtitle">
                  {totalCartons} cây nguyên · {totalLoosePacks} bao lẻ · {storedSamples.length} lô mẫu đang lưu
                </span>
              </div>
            </div>
            <button 
              className="bento-pill-link"
              onClick={(e) => {
                e.stopPropagation();
                if (setMobileShelfFilter) setMobileShelfFilter(0);
                setActiveTab('shelves');
              }}
            >
              <span>Mở sơ đồ đầy đủ</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* 6 KỆ A - F */}
          <div className="bento-shelves-row">
            {shelfStats.map((s) => (
              <div 
                key={s.letter} 
                className="bento-shelf-card"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedShelfSheet(s);
                }}
              >
                <div className="bento-shelf-label">Kệ {s.letter}</div>
                
                <div className="bento-slots-stack">
                  {s.slotStats.map((slot) => {
                    const isFull = slot.pct >= 100 || slot.isMarkedFull;
                    const isWarn = slot.pct >= 75 && !isFull;
                    return (
                      <div 
                        key={slot.slot} 
                        className={`bento-slot-bar ${isFull ? 'full' : isWarn ? 'warn' : ''}`}
                        title={`Kệ ${s.letter}${slot.slot}: ${slot.pct}% (${slot.cartons} cây)`}
                      >
                        <div className="bento-slot-fill" style={{ width: `${slot.pct}%` }} />
                        <span className="bento-slot-num">{slot.slot}</span>
                      </div>
                    );
                  })}

                  {/* Ô 5 lẻ */}
                  <div 
                    className="bento-slot-bar slot-loose"
                    title={`Kệ ${s.letter}5 (Lẻ): ${s.loosePacks} bao (${s.looseCount} mẫu)`}
                  >
                    <span className="bento-slot-num loose-tag">5 lẻ</span>
                  </div>
                </div>

                <div className="bento-shelf-status-text">
                  {s.loosePacks > 0 ? `${s.loosePacks} bao lẻ` : 'Trống lẻ'}
                </div>
              </div>
            ))}
          </div>

          <div className="bento-shelf-legend">
            <span className="legend-item"><i className="dot dot-ok" /> Còn chỗ</span>
            <span className="legend-item"><i className="dot dot-warn" /> Gần đầy (&ge;75%)</span>
            <span className="legend-item"><i className="dot dot-full" /> Đầy (100%)</span>
            <span className="legend-item"><i className="dot dot-loose" /> Ô 5 (Mẫu lẻ)</span>
            <span className="legend-hint">Chạm vào từng kệ để soi nhanh các ô</span>
          </div>
        </div>

        {isAdmin ? (
          <>
            {/* ── TILE 2: YÊU CẦU LẤY MẪU ── */}
            <div className="bento-tile bento-tile-requests" onClick={() => setActiveTab('requests')}>
              <div className="bento-tile-header">
                <div className="bento-tile-title">
                  <ArrowRightLeft size={17} className="bento-icon-kraft" />
                  <h3>Yêu cầu lấy mẫu</h3>
                </div>
                {pendingRequests.length > 0 ? (
                  <span className="bento-badge-warn">{pendingRequests.length} chờ duyệt</span>
                ) : (
                  <span className="bento-badge-ok">Đã duyệt hết</span>
                )}
              </div>

              <div className="bento-requests-preview">
                {pendingRequests.length > 0 ? (
                  pendingRequests.slice(0, 2).map((req, i) => {
                    const sample = samples.find(s => s.id === req.sample_id) || req.samples;
                    const prodName = getProductName(sample);
                    const requester = parseRequesterFromNote(req.note, req.profiles?.full_name);
                    const locStr = sample?.shelf
                      ? `Kệ ${shelfLetters[(sample.shelf || 1) - 1] || sample.shelf}${sample.slot}`
                      : 'Kho';
                    return (
                      <div key={req.id || i} className="bento-req-row">
                        <div className="bento-req-info">
                          <b className="bento-req-prod">{prodName}</b>
                          <span className="bento-req-sub">
                            {requester} · {req.quantity || 1} bao · {locStr}
                          </span>
                        </div>
                        <span className="bento-req-tag">Chờ</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="bento-empty-text">
                    Hiện không có yêu cầu lấy mẫu nào chờ duyệt.
                  </div>
                )}
              </div>

              <button className="bento-tile-action-btn btn-kraft-soft">
                <span>{pendingRequests.length > 0 ? `Duyệt ngay (${pendingRequests.length})` : 'Xem lịch sử cấp mẫu'}</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* ── TILE 3: IN NHÃN TOMMY 135 ── */}
            <div className="bento-tile bento-tile-print" onClick={() => setActiveTab('labels')}>
              <div className="bento-tile-header">
                <div className="bento-tile-title">
                  <Printer size={17} className="bento-icon-kraft" />
                  <h3>In nhãn Tommy 135</h3>
                </div>
                <span className="bento-badge-kraft">{readyStickersCount} tem</span>
              </div>

              <div className="bento-sheets-visual">
                {[0, 1, 2, 3, 4, 5].map((sheetIdx) => {
                  const sheetStart = sheetIdx * 21;
                  const isFilledSheet = readyStickersCount > sheetStart;
                  return (
                    <div key={sheetIdx} className={`bento-mini-sheet ${isFilledSheet ? 'has-stickers' : ''}`}>
                      {Array.from({ length: 21 }).map((_, cellIdx) => {
                        const globalIdx = sheetStart + cellIdx;
                        const isCellFilled = globalIdx < readyStickersCount;
                        return (
                          <i key={cellIdx} className={isCellFilled ? 'filled' : 'blank'} />
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="bento-print-note">
                {readyStickersCount > 0 
                  ? `${totalSheetsNeeded} trang A4 (${fullSheets} trang đầy${remainderStickers ? `, lẻ ${remainderStickers} tem` : ''})`
                  : 'Khay in đang trống. Bấm để nạp hoặc chọn mẫu in.'}
              </div>

              <button className="bento-tile-action-btn btn-kraft-primary">
                <span>Mở khay in ({printQueue.length} lô)</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* ── TILE 4: KIỂM KÊ KHO (QR SCANNER) ── */}
            <div className="bento-tile bento-tile-audit" onClick={() => setActiveTab('audit')}>
              <div className="bento-tile-header">
                <div className="bento-tile-title">
                  <CheckSquare size={17} className="bento-icon-emerald" />
                  <h3>Kiểm kê kho QR</h3>
                </div>
                <span className="bento-badge-emerald">Zoom 2.5x</span>
              </div>

              <div className="bento-audit-stats">
                <div className="bento-audit-big-stat">
                  <span className="bento-audit-num">{storedSamples.filter(s => s.slot !== 5).length}</span>
                  <span className="bento-audit-unit">lô mẫu kệ chính</span>
                </div>
                <span className="bento-audit-desc">
                  Quét mã QR liên tục trên kệ (tự động bỏ qua ô 5 lẻ), phát hiện mẫu lệch vị trí.
                </span>
              </div>

              <button className="bento-tile-action-btn btn-emerald-soft">
                <Camera size={14} />
                <span>Bật máy quét kiểm kê</span>
              </button>
            </div>

            {/* ── TILE 5: HẠN LƯU TRỮ 12 THÁNG ── */}
            <div className="bento-tile bento-tile-expired" onClick={() => setActiveTab('archives')}>
              <div className="bento-tile-header">
                <div className="bento-tile-title">
                  <Clock size={17} className="bento-icon-warn" />
                  <h3>Hạn lưu trữ 12T</h3>
                </div>
                <span className="bento-badge-warn">
                  {expiredSamplesList.length > 0
                    ? `${expiredSamplesList.length} quá hạn`
                    : `${approachingSamplesList.length} sắp tới hạn`}
                </span>
              </div>

              <div className="bento-expired-preview">
                {alertSamplesList.length > 0 ? (
                  alertSamplesList.slice(0, 2).map((exp, i) => {
                    const pName = getProductName(exp);
                    const locLabel = exp.shelf
                      ? `Kệ ${shelfLetters[(exp.shelf || 1) - 1] || exp.shelf}${exp.slot}`
                      : 'Thùng';
                    return (
                      <div key={exp.id || i} className="bento-exp-row">
                        <span className="bento-exp-name">{pName}</span>
                        <span className="bento-exp-loc">{locLabel}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="bento-empty-text">
                    Tất cả các mẫu đều trong hạn lưu trữ 12 tháng.
                  </div>
                )}
              </div>

              <button className="bento-tile-action-btn btn-warn-soft">
                <span>Đóng thùng & Tiêu hủy</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* ── TILE 6: NHẬP KHO MẪU ── */}
            <div className="bento-tile bento-tile-action-compact" onClick={() => setActiveTab('import')}>
              <div className="bento-action-icon-circle">
                <Plus size={18} />
              </div>
              <div className="bento-action-text-group">
                <div className="bento-action-label">Nhập kho mẫu mới</div>
                <div className="bento-action-sub">Tự động gợi ý kệ, ô & cột tối ưu</div>
              </div>
              <ChevronRight size={16} className="bento-action-arrow" />
            </div>

            {/* ── TILE 7: ĐÓNG THÙNG LƯU TRỮ ── */}
            <div className="bento-tile bento-tile-action-compact" onClick={() => setActiveTab('archives')}>
              <div className="bento-action-icon-circle">
                <Box size={18} />
              </div>
              <div className="bento-action-text-group">
                <div className="bento-action-label">Đóng thùng lưu trữ</div>
                <div className="bento-action-sub">{boxes.length} thùng giấy đang quản lý</div>
              </div>
              <ChevronRight size={16} className="bento-action-arrow" />
            </div>

            {/* ── QUẢN TRỊ & DANH MỤC: BENTO TILE TIÊU CHUẨN ── */}
            <div className="bento-tile bento-tile-utilities">
              <div className="bento-tile-header">
                <div className="bento-tile-title">
                  <ClipboardList size={17} className="bento-icon-kraft" />
                  <div>
                    <h3>Quản trị hệ thống & Danh mục</h3>
                    <span className="bento-tile-subtitle">
                      Danh mục {products.length} sản phẩm · Nhập dữ liệu Excel · Nhật ký tra cứu · Phân quyền
                    </span>
                  </div>
                </div>
                <span className="bento-badge-kraft">4 công cụ</span>
              </div>

              <div className="bento-utilities-grid">
                <button className="bento-util-card" onClick={() => setActiveTab('catalog')}>
                  <div className="bento-util-icon">
                    <ClipboardList size={17} />
                  </div>
                  <div className="bento-util-body">
                    <b>Danh mục gốc</b>
                    <span>{products.length} sản phẩm tiêu chuẩn</span>
                  </div>
                  <ChevronRight size={14} className="bento-util-arrow" />
                </button>

                <button className="bento-util-card" onClick={() => setActiveTab('bulk_import')}>
                  <div className="bento-util-icon">
                    <UploadCloud size={17} />
                  </div>
                  <div className="bento-util-body">
                    <b>Nhập hàng loạt</b>
                    <span>Nạp file Excel danh sách mẫu</span>
                  </div>
                  <ChevronRight size={14} className="bento-util-arrow" />
                </button>

                <button className="bento-util-card" onClick={() => { setActiveTab('search_logs'); if (fetchSearchLogs) fetchSearchLogs(); }}>
                  <div className="bento-util-icon">
                    <FileText size={17} />
                  </div>
                  <div className="bento-util-body">
                    <b>Nhật ký tìm kiếm</b>
                    <span>Lịch sử tra cứu của NV</span>
                  </div>
                  <ChevronRight size={14} className="bento-util-arrow" />
                </button>

                <button className="bento-util-card" onClick={() => { setActiveTab('users'); if (fetchUsersAndVisitors) fetchUsersAndVisitors(); }}>
                  <div className="bento-util-icon">
                    <User size={17} />
                  </div>
                  <div className="bento-util-body">
                    <b>Tài khoản & Khách</b>
                    <span>Quản lý phân quyền & khách</span>
                  </div>
                  <ChevronRight size={14} className="bento-util-arrow" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ── GIAO DIỆN CHO NHÂN VIÊN (STAFF / KHÁCH TRA CỨU) ── */
          <>
            <div className="bento-tile bento-tile-action-compact" onClick={() => setActiveTab('search')}>
              <div className="bento-action-icon-circle">
                <Search size={18} />
              </div>
              <div className="bento-action-text-group">
                <div className="bento-action-label">Tra cứu & Yêu cầu lấy mẫu</div>
                <div className="bento-action-sub">Tìm vị trí mẫu trên kệ hoặc trong thùng lưu trữ</div>
              </div>
              <ChevronRight size={16} className="bento-action-arrow" />
            </div>

            <div className="bento-tile bento-tile-action-compact" onClick={() => setActiveTab('shelves')}>
              <div className="bento-action-icon-circle">
                <Warehouse size={18} />
              </div>
              <div className="bento-action-text-group">
                <div className="bento-action-label">Xem sơ đồ chi tiết 6 kệ</div>
                <div className="bento-action-sub">Soi từng cột thuốc và số bao tồn thực tế</div>
              </div>
              <ChevronRight size={16} className="bento-action-arrow" />
            </div>
          </>
        )}

      </div>

      {/* ── BOTTOM THUMB DOCK (CỐ ĐỊNH TRÊN MOBILE VIEWPORT) ── */}
      <div className={`bento-mobile-thumb-dock ${!isAdmin ? 'dock-guest' : ''}`}>
        <button 
          className="dock-item active"
          onClick={() => setActiveTab('dashboard')}
        >
          <Layers size={19} />
          <span>Tổng quan</span>
        </button>

        <button 
          className="dock-item"
          onClick={() => {
            if (setMobileShelfFilter) setMobileShelfFilter(0);
            setActiveTab('shelves');
          }}
        >
          <Warehouse size={19} />
          <span>Sơ đồ kệ</span>
        </button>

        {isAdmin ? (
          <>
            <button 
              className="dock-item dock-item-scan"
              onClick={() => setActiveTab('audit')}
            >
              <div className="dock-scan-btn-bubble">
                <Camera size={16} />
              </div>
              <span>Quét QR</span>
            </button>

            <button 
              className="dock-item"
              onClick={() => setActiveTab('requests')}
            >
              <div className="dock-badge-rel">
                <ArrowRightLeft size={19} />
                {pendingRequests.length > 0 && <span className="dock-dot" />}
              </div>
              <span>Yêu cầu</span>
            </button>
          </>
        ) : (
          <button 
            className="dock-item"
            onClick={() => setActiveTab('search')}
          >
            <Search size={19} />
            <span>Tra cứu</span>
          </button>
        )}
      </div>

      {/* ── BOTTOM SHEET / DRAWER CHI TIẾT KHI CHẠM KỆ ── */}
      {selectedShelfSheet && (
        <div className="bento-sheet-overlay" onClick={() => setSelectedShelfSheet(null)}>
          <div className="bento-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bento-sheet-drag-handle" />
            
            <div className="bento-sheet-header">
              <div className="bento-sheet-title">
                <Warehouse size={18} className="bento-icon-kraft" />
                <span>Chi tiết Kệ {selectedShelfSheet.letter} (Kho Mẫu)</span>
              </div>
              <button 
                className="bento-sheet-close-btn"
                onClick={() => setSelectedShelfSheet(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Chọn nhanh các kệ A - F ngay trong Sheet */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {shelfStats.map(st => (
                <button
                  key={st.letter}
                  onClick={() => setSelectedShelfSheet(st)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: st.letter === selectedShelfSheet.letter ? '1px solid var(--bento-kraft)' : '1px solid var(--bento-line)',
                    background: st.letter === selectedShelfSheet.letter ? 'var(--bento-kraft)' : 'rgba(255,255,255,0.04)',
                    color: st.letter === selectedShelfSheet.letter ? '#121A15' : 'var(--bento-text-2)'
                  }}
                >
                  Kệ {st.letter}
                </button>
              ))}
            </div>

            <div className="bento-sheet-body">
              <div className="bento-sheet-slots-grid">
                {selectedShelfSheet.slotStats.map((slot) => {
                  const slotSamples = storedSamples.filter(
                    s => s.shelf === selectedShelfSheet.shelfNum && s.slot === slot.slot
                  );
                  const uniqueNames = Array.from(new Set(slotSamples.map(s => getProductName(s))));
                  return (
                    <div 
                      key={slot.slot} 
                      className="bento-sheet-slot-card"
                      onClick={() => {
                        setSelectedShelfSheet(null);
                        if (setSelectedSlot) {
                          setSelectedSlot({ shelf: selectedShelfSheet.shelfNum, slot: slot.slot });
                        }
                      }}
                    >
                      <div className="bento-sheet-slot-head">
                        <b>Ô {selectedShelfSheet.letter}{slot.slot}</b>
                        <span className={`bento-slot-pct-tag ${slot.pct >= 100 ? 'tag-full' : slot.pct >= 75 ? 'tag-warn' : 'tag-ok'}`}>
                          {slot.isMarkedFull ? 'BÁO ĐẦY' : `${slot.pct}%`}
                        </span>
                      </div>
                      <div className="bento-sheet-slot-desc">
                        {slotSamples.length > 0 ? (
                          <>
                            <span>Đang xếp: <b>{slot.cartons} cây</b> ({slotSamples.length} lô mẫu)</span>
                            <div className="bento-sheet-sample-names">
                              {uniqueNames.slice(0, 3).map((name, idx) => (
                                <small key={idx}>• {name}</small>
                              ))}
                              {uniqueNames.length > 3 && <small>...và {uniqueNames.length - 3} sản phẩm khác</small>}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--bento-text-3)' }}>Ô đang trống — Bấm để xem chi tiết</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Ô 5 lẻ */}
                <div 
                  className="bento-sheet-slot-card slot-loose-card"
                  onClick={() => {
                    setSelectedShelfSheet(null);
                    if (setSelectedSlot) {
                      setSelectedSlot({ shelf: selectedShelfSheet.shelfNum, slot: 5 });
                    }
                  }}
                >
                  <div className="bento-sheet-slot-head">
                    <b style={{ color: 'var(--bento-kraft)' }}>Ô {selectedShelfSheet.letter}5 (Bao lẻ)</b>
                    <span className="bento-slot-pct-tag tag-kraft">
                      {selectedShelfSheet.loosePacks} bao
                    </span>
                  </div>
                  <div className="bento-sheet-slot-desc">
                    <span>Đang chứa {selectedShelfSheet.looseCount} lô mẫu bóc lẻ · Bấm để mở ô</span>
                  </div>
                </div>
              </div>

              <button 
                className="bento-sheet-jump-btn"
                onClick={() => {
                  const targetShelf = selectedShelfSheet.shelfNum;
                  setSelectedShelfSheet(null);
                  if (setMobileShelfFilter) setMobileShelfFilter(targetShelf);
                  setActiveTab('shelves');
                }}
              >
                <span>Mở toàn bộ Kệ {selectedShelfSheet.letter} trên Sơ đồ lớn</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
