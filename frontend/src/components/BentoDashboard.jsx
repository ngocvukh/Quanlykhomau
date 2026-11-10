import React, { useState, useMemo } from 'react';
import {
  Warehouse, Search, Camera, Printer, Layers, Box, Plus,
  ArrowRightLeft, CheckSquare, Clock, ClipboardList, UploadCloud, FileText,
  User, ChevronRight, X, BarChart3, ArrowUpRight, ArrowDownRight, Eye, Trash2
} from '../GoogleIcons';

const SLOT_MAX_WIDTH_MM = 700;
const FORMAT_CAPACITIES = {
  'Kingsize': { width: 90, columns: 7, height: 6, total: 42 },
  'SuperSlim': { width: 105, columns: 6, height: 10, total: 60 },
  'Semi': { width: 98, columns: 7, height: 6, total: 42 },
  'Demi': { width: 90, columns: 7, height: 7, total: 49 },
};
const getFormatSpec = (fmt) => FORMAT_CAPACITIES[fmt] || FORMAT_CAPACITIES['Kingsize'];

export default function BentoDashboard({
  samples = [],
  products = [],
  boxes = [],
  printQueue = [],
  transactions = [],
  destructionLogs = [],
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
  const [chartFilter, setChartFilter] = useState('month');
  const [hoveredPointIndex, setHoveredPointIndex] = useState(null);

  const isAdmin = profile?.role === 'admin';
  const shelfLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

  const getProductName = (s) => {
    if (!s) return 'Mẫu thuốc lá';
    if (s.products?.product_name) return s.products.product_name;
    if (s.product_name) return s.product_name;
    const found = products.find(p => p.id === s.product_id);
    return found?.product_name || 'Mẫu thuốc lá';
  };

  // 1. Số liệu mẫu lưu trữ
  const storedSamples = samples.filter(s => s.status === 'stored' && (s.available_qty || 0) > 0);
  const totalCartons = Math.ceil(
    storedSamples
      .filter(s => s.slot !== 5)
      .reduce((sum, s) => sum + (s.available_qty || 0) / 10, 0)
  );
  const totalLoosePacks = storedSamples
    .filter(s => s.slot === 5)
    .reduce((sum, s) => sum + (s.available_qty || 0), 0);

  // 2. Yêu cầu lấy mẫu chờ duyệt
  const pendingRequests = transactions.filter(t => t.type === 'take_request' && t.status === 'pending');

  // 3. Mẫu hết hạn & sắp hết hạn 12 tháng
  const expiredSamplesList = getExpiredSamples ? getExpiredSamples() : [];
  const approachingSamplesList = getApproachingExpiredSamples ? getApproachingExpiredSamples() : [];
  const alertSamplesList = [...expiredSamplesList, ...approachingSamplesList];

  // 4. Mức lấp đầy 6 kệ A -> F
  const shelfStats = shelfLetters.map((letter, idx) => {
    const shelfNum = idx + 1;
    let totalShelfUtilization = 0;

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

      totalShelfUtilization += pct;

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
    const avgPct = Math.round(totalShelfUtilization / 4);

    return {
      letter,
      shelfNum,
      avgPct,
      slotStats,
      loosePacks,
      looseCount: looseSamples.length,
      fullSlotsCount: slotStats.filter(sl => sl.pct >= 90 || sl.isMarkedFull).length
    };
  });

  const overallPct = Math.min(
    100,
    Math.round(shelfStats.reduce((acc, s) => acc + s.avgPct, 0) / (shelfStats.length || 1))
  );

  // 5. Thống kê Nhập vs Hủy theo chartFilter (day: 7 ngày, month: 6 tháng, year: 4 năm)
  const chartData = useMemo(() => {
    const now = new Date();
    let points = [];

    if (chartFilter === 'day') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        const label = `${day}/${m}`;
        points.push({ key, label, title: `Ngày ${day}/${m}/${y}`, imported: 0, destroyed: 0 });
      }

      (samples || []).forEach(s => {
        const dateStr = s.created_at || s.sampling_date;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        const p = points.find(pt => pt.key === key);
        if (p) p.imported += 1;
      });

      (destructionLogs || []).forEach(l => {
        const dateStr = l.created_at || l.destruction_date;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        const p = points.find(pt => pt.key === key);
        if (p) p.destroyed += (l.num_samples_destroyed || 0);
      });
    } else if (chartFilter === 'year') {
      const currentYear = now.getFullYear();
      for (let y = currentYear - 3; y <= currentYear; y++) {
        points.push({ key: String(y), label: `Năm ${y}`, title: `Năm ${y}`, imported: 0, destroyed: 0 });
      }

      (samples || []).forEach(s => {
        const dateStr = s.created_at || s.sampling_date;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const y = String(d.getFullYear());
        const p = points.find(pt => pt.key === y);
        if (p) p.imported += 1;
      });

      (destructionLogs || []).forEach(l => {
        const dateStr = l.created_at || l.destruction_date;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const y = String(d.getFullYear());
        const p = points.find(pt => pt.key === y);
        if (p) p.destroyed += (l.num_samples_destroyed || 0);
      });
    } else {
      // month (6 tháng gần nhất)
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${y}-${m}`;
        const label = `T${d.getMonth() + 1}/${String(y).slice(-2)}`;
        points.push({ key, label, title: `Tháng ${m}/${y}`, imported: 0, destroyed: 0 });
      }

      (samples || []).forEach(s => {
        const dateStr = s.created_at || s.sampling_date;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${y}-${m}`;
        const p = points.find(pt => pt.key === key);
        if (p) p.imported += 1;
      });

      (destructionLogs || []).forEach(l => {
        const dateStr = l.created_at || l.destruction_date;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${y}-${m}`;
        const p = points.find(pt => pt.key === key);
        if (p) p.destroyed += (l.num_samples_destroyed || 0);
      });
    }

    const maxVal = Math.max(10, ...points.map(p => Math.max(p.imported, p.destroyed)));
    const n = points.length;
    const startX = 50;
    const endX = 650;
    const stepX = n > 1 ? (endX - startX) / (n - 1) : 0;
    const topY = 30;
    const bottomY = 170;
    const usableH = bottomY - topY;

    const mappedPoints = points.map((p, idx) => {
      const x = Math.round(startX + idx * stepX);
      const yImport = Math.round(bottomY - (p.imported / maxVal) * usableH);
      const yDestroy = Math.round(bottomY - (p.destroyed / maxVal) * usableH);
      return {
        ...p,
        x,
        yImport,
        yDestroy
      };
    });

    const makePath = (pts, valKey) => {
      if (pts.length === 0) return '';
      if (pts.length === 1) return `M ${pts[0].x} ${pts[0][valKey]}`;
      let d = `M ${pts[0].x},${pts[0][valKey]}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const cp1x = p0.x + (p1.x - p0.x) / 2;
        const cp1y = p0[valKey];
        const cp2x = cp1x;
        const cp2y = p1[valKey];
        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1[valKey]}`;
      }
      return d;
    };

    const importPath = makePath(mappedPoints, 'yImport');
    const destroyPath = makePath(mappedPoints, 'yDestroy');

    return {
      points: mappedPoints,
      importPath,
      destroyPath,
      maxVal
    };
  }, [samples, destructionLogs, chartFilter]);

  return (
    <div className="dashboard-grid">
      
      {/* ════════ CỘT TRÁI (Biểu đồ Spline + 3 KPI Cards + Bảng Kệ) ════════ */}
      <div className="content-left">
        
        {/* 1. Spline Chart Card */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title-area">
              <h2>Lưu Chuyển Nhập Kho & Tiêu Hủy</h2>
            </div>
            
            <div className="chart-legend-pills">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#E056FD' }}></span>
                <span>Mẫu nhập mới</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#0F87FF' }}></span>
                <span>Mẫu tiêu hủy hết hạn</span>
              </div>
              <div className="chart-filters">
                <button
                  className={`filter-btn ${chartFilter === 'day' ? 'active' : ''}`}
                  onClick={() => setChartFilter('day')}
                >
                  Ngày
                </button>
                <button
                  className={`filter-btn ${chartFilter === 'month' ? 'active' : ''}`}
                  onClick={() => setChartFilter('month')}
                >
                  Tháng
                </button>
                <button
                  className={`filter-btn ${chartFilter === 'year' ? 'active' : ''}`}
                  onClick={() => setChartFilter('year')}
                >
                  Năm
                </button>
              </div>
            </div>
          </div>

          {/* SVG Smooth Curve Lines (Spline) */}
          <div className="svg-chart-container" style={{ position: 'relative' }}>
            <svg viewBox="0 0 700 210" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <defs>
                <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E056FD" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#E056FD" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F87FF" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#0F87FF" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Trục hoành mờ */}
              <line x1="40" y1="30" x2="660" y2="30" stroke="var(--border-color)" strokeDasharray="4 4" />
              <line x1="40" y1="100" x2="660" y2="100" stroke="var(--border-color)" strokeDasharray="4 4" />
              <line x1="40" y1="170" x2="660" y2="170" stroke="var(--border-color)" />

              {/* Đường cong Tím (Mẫu nhập) */}
              {chartData.importPath && (
                <path
                  d={chartData.importPath} 
                  fill="none"
                  stroke="#E056FD"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              )}

              {/* Đường cong Xanh (Mẫu tiêu hủy) */}
              {chartData.destroyPath && (
                <path
                  d={chartData.destroyPath} 
                  fill="none"
                  stroke="#0F87FF"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              )}

              {/* Các điểm tròn dữ liệu trên đồ thị */}
              {chartData.points.map((pt, idx) => {
                const isHovered = hoveredPointIndex === idx || (hoveredPointIndex === null && idx === chartData.points.length - 1);
                return (
                  <g key={pt.key}>
                    {/* Nhãn trục X */}
                    <text 
                      x={pt.x} 
                      y="195" 
                      textAnchor="middle" 
                      fontSize="11" 
                      fontWeight={isHovered ? '700' : '500'} 
                      fill={isHovered ? '#1E293B' : '#94A3B8'}
                    >
                      {pt.label}
                    </text>

                    {/* Điểm nhập */}
                    <circle 
                      cx={pt.x} 
                      cy={pt.yImport} 
                      r={isHovered ? 6 : 4} 
                      fill="#fff" 
                      stroke="#E056FD" 
                      strokeWidth="3" 
                      style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                      onMouseEnter={() => setHoveredPointIndex(idx)}
                    />

                    {/* Điểm hủy */}
                    <circle 
                      cx={pt.x} 
                      cy={pt.yDestroy} 
                      r={isHovered ? 5 : 3.5} 
                      fill="#fff" 
                      stroke="#0F87FF" 
                      strokeWidth="2.5" 
                      style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                      onMouseEnter={() => setHoveredPointIndex(idx)}
                    />

                    {/* Vùng cảm ứng hover mở rộng */}
                    <rect 
                      x={pt.x - 25} 
                      y="10" 
                      width="50" 
                      height="180" 
                      fill="transparent" 
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredPointIndex(idx)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Dynamic Floating Dark Tooltip */}
            {(() => {
              const activeIdx = hoveredPointIndex !== null ? hoveredPointIndex : chartData.points.length - 1;
              const activePt = chartData.points[activeIdx] || chartData.points[0];
              if (!activePt) return null;

              const leftPct = ((activePt.x - 40) / (660 - 40)) * 100;
              const boundedPct = Math.max(12, Math.min(88, leftPct));

              return (
                <div 
                  className="floating-tooltip" 
                  style={{ 
                    left: `${boundedPct}%`, 
                    transform: 'translateX(-50%)',
                    transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)' 
                  }}
                >
                  <span className="tooltip-date">{activePt.title}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                    <span className="tooltip-value" style={{ color: '#F472B6', fontSize: '12px' }}>
                      ● +{activePt.imported} Mẫu Nhập
                    </span>
                    <span className="tooltip-value" style={{ color: '#60A5FA', fontSize: '12px' }}>
                      ● -{activePt.destroyed} Mẫu Hủy
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* 2. Hàng 3 KPI Cards */}
        <div className="metrics-row">
          <div className="metric-card" onClick={() => { if (setMobileShelfFilter) setMobileShelfFilter(0); setActiveTab('shelves'); }}>
            <div className="metric-icon-box icon-box-green">
              <ArrowUpRight size={22} />
            </div>
            <div className="metric-data">
              <div className="metric-value">{totalCartons} cây</div>
              <div className="metric-label-row">
                <span className="metric-label">Tổng tồn kệ chính</span>
                <span className="metric-trend trend-up">+{storedSamples.length} mẫu</span>
              </div>
            </div>
          </div>

          <div className="metric-card" onClick={() => setActiveTab('archives')}>
            <div className="metric-icon-box icon-box-red">
              <ArrowDownRight size={22} />
            </div>
            <div className="metric-data">
              <div className="metric-value">{alertSamplesList.length} mẫu</div>
              <div className="metric-label-row">
                <span className="metric-label">Sắp tới hạn 12T</span>
                <span className="metric-trend trend-down">
                  {expiredSamplesList.length > 0 ? `${expiredSamplesList.length} quá hạn` : 'Cần hủy'}
                </span>
              </div>
            </div>
          </div>

          <div className="metric-card" onClick={() => setActiveTab('requests')}>
            <div className="metric-icon-box icon-box-blue">
              <ArrowRightLeft size={22} />
            </div>
            <div className="metric-data">
              <div className="metric-value">{pendingRequests.length} phiếu</div>
              <div className="metric-label-row">
                <span className="metric-label">Chờ duyệt lấy mẫu</span>
                <span className="metric-trend trend-up">
                  {pendingRequests.length > 0 ? 'Cần duyệt' : 'Đã xong'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Data Table (Chi tiết 6 Kệ Kho A - F) */}
        <div className="table-card">
          <div className="table-header">
            <h2>Trạng Thái Sử Dụng 6 Kệ Kho (A – F)</h2>
            <div className="dropdown-pill" onClick={() => { if (setMobileShelfFilter) setMobileShelfFilter(0); setActiveTab('shelves'); }}>
              <span>Tất cả kệ</span>
              <ChevronRight size={14} />
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Tên Kệ</th>
                <th>Số Ô Đầy (1-4)</th>
                <th>Bao Lẻ (Ô 5)</th>
                <th>Mức Lấp Đầy</th>
                <th>Hành Động</th>
              </tr>
            </thead>
            <tbody>
              {shelfStats.map((st) => (
                <tr key={st.letter} style={{ cursor: 'pointer' }} onClick={() => setSelectedShelfSheet(st)}>
                  <td>
                    <span className="shelf-tag">{st.letter}</span>
                    <b>Kệ {st.letter}</b>
                  </td>
                  <td>
                    {st.fullSlotsCount > 0 ? (
                      <span style={{ color: 'var(--status-warning)', fontWeight: 600 }}>
                        {st.fullSlotsCount} ô đầy / {4 - st.fullSlotsCount} ô thoáng
                      </span>
                    ) : (
                      <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>0 ô đầy / 4 ô thoáng</span>
                    )}
                  </td>
                  <td>{st.loosePacks > 0 ? `${st.loosePacks} bao` : 'Trống lẻ'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="progress-pill-track">
                        <div
                          className="progress-pill-fill"
                          style={{
                            width: `${st.avgPct}%`,
                            background: st.avgPct >= 90
                              ? 'linear-gradient(90deg, #F59E0B 0%, #EF4444 100%)'
                              : 'linear-gradient(90deg, #0F87FF 0%, #00D2D3 100%)'
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: st.avgPct >= 90 ? 'var(--status-error)' : 'var(--primary)' }}>
                        {st.avgPct}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <button
                      className="action-pill-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedShelfSheet(st);
                      }}
                    >
                      Chi tiết <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {/* ════════ CỘT PHẢI (Donut Target + Weekly Summary Dark + Yêu Cầu Gần Đây) ════════ */}
      <div className="content-right">
        
        {/* 1. Target Donut Chart Widget */}
        <div className="donut-widget">
          <div className="widget-top-row">
            <h3>Dung Lượng Sử Dụng</h3>
            <span className="material-symbols-outlined" style={{ color: 'var(--text-sub)', cursor: 'pointer' }}>more_horiz</span>
          </div>

          <div className="donut-circle-wrap">
            <svg viewBox="0 0 160 160" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="80" cy="80" r="64" fill="none" stroke="var(--border-color)" strokeWidth="12" />
              <circle
                cx="80"
                cy="80"
                r="64"
                fill="none"
                stroke="url(#donutGradMain)"
                strokeWidth="12"
                strokeDasharray="402"
                strokeDashoffset={402 - (402 * overallPct) / 100}
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="donutGradMain" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0F87FF" />
                  <stop offset="100%" stopColor="#686DE0" />
                </linearGradient>
              </defs>
            </svg>
            <div className="donut-inner-text">
              <span className="donut-number">{overallPct}%</span>
              <span className="donut-sub">
                <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#10B981' }}>trending_up</span>
                Đang lưu
              </span>
            </div>
          </div>

          <div className="donut-footer-stat">
            <div>
              <div className="val">{totalCartons} cây</div>
              <div className="lbl">Đang lưu trữ trên 6 kệ</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="shelf-tag" style={{ width: 'auto', padding: '4px 8px', borderRadius: '6px' }}>
                {overallPct >= 90 ? 'Gần đầy' : overallPct >= 70 ? 'Khá đầy' : 'Ổn định'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Dark Weekly Summary Widget */}
        <div className="dark-summary-widget" onClick={() => { if (setMobileShelfFilter) setMobileShelfFilter(0); setActiveTab('shelves'); }} style={{ cursor: 'pointer' }}>
          <div className="widget-top-row">
            <h3>Tần Suất 6 Kệ Kho</h3>
            <span className="material-symbols-outlined" style={{ color: '#64748B', cursor: 'pointer' }}>more_horiz</span>
          </div>

          <div className="bars-stack-row">
            {shelfStats.map((st) => (
              <div key={st.letter} className="bar-col">
                <div className="bar-tube">
                  <div className="bar-fill-inner" style={{ height: `${Math.max(12, st.avgPct)}%` }}></div>
                </div>
                <span className="bar-day-name">Kệ {st.letter}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Mẫu Cần Chú Ý */}
        <div className="list-widget">
          <div className="widget-top-row">
            <h3>Mẫu Sắp Tới Hạn 12T</h3>
            <span className="material-symbols-outlined" style={{ color: 'var(--text-sub)', cursor: 'pointer' }} onClick={() => setActiveTab('archives')}>more_horiz</span>
          </div>

          <div className="recent-items-list">
            {alertSamplesList.length > 0 ? (
              alertSamplesList.slice(0, 3).map((exp, idx) => {
                const pName = getProductName(exp);
                const locLabel = exp.shelf
                  ? `Kệ ${shelfLetters[(exp.shelf || 1) - 1] || exp.shelf}${exp.slot}`
                  : 'Thùng lưu';
                const initials = pName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                const bgColors = ['#F59E0B', '#EF4444', '#0F87FF', '#E056FD'];

                return (
                  <div key={exp.id || idx} className="recent-row">
                    <div className="mini-avatar" style={{ background: bgColors[idx % bgColors.length] }}>
                      {initials || 'QC'}
                    </div>
                    <div className="recent-info">
                      <div className="recent-name">{pName}</div>
                      <div className="recent-meta">{locLabel} · Tồn {exp.available_qty || 0} bao</div>
                    </div>
                    <div className="recent-actions">
                      <button className="icon-mini-btn" onClick={() => setActiveTab('archives')} title="Xem chi tiết">
                        <Eye size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Tất cả các mẫu đều trong hạn lưu trữ an toàn.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── BOTTOM SHEET CHI TIẾT KHI BẤM KỆ ── */}
      {selectedShelfSheet && (
        <div className="bento-sheet-overlay" onClick={() => setSelectedShelfSheet(null)}>
          <div className="bento-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bento-sheet-drag-handle" />
            
            <div className="bento-sheet-header">
              <div className="bento-sheet-title">
                <Warehouse size={18} className="bento-icon-kraft" />
                <span>Chi tiết Kệ {selectedShelfSheet.letter} (Kho Mẫu)</span>
              </div>
              <button className="bento-sheet-close-btn" onClick={() => setSelectedShelfSheet(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {shelfStats.map(st => (
                <button
                  key={st.letter}
                  onClick={() => setSelectedShelfSheet(st)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: '10px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: st.letter === selectedShelfSheet.letter ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    background: st.letter === selectedShelfSheet.letter ? 'var(--primary)' : 'var(--bg-subtle)',
                    color: st.letter === selectedShelfSheet.letter ? '#FFFFFF' : 'var(--text-muted)',
                    transition: 'all 0.15s ease'
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
                            <span>Đang xếp: <b>{slot.cartons} cây</b> ({slotSamples.length} mẫu)</span>
                            <div className="bento-sheet-sample-names">
                              {uniqueNames.slice(0, 3).map((name, idx) => (
                                <small key={idx}>• {name}</small>
                              ))}
                              {uniqueNames.length > 3 && <small>...và {uniqueNames.length - 3} sản phẩm khác</small>}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Ô đang trống — Bấm để xem chi tiết</span>
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
                    <b style={{ color: 'var(--primary)' }}>Ô {selectedShelfSheet.letter}5 (Bao lẻ)</b>
                    <span className="bento-slot-pct-tag tag-kraft">
                      {selectedShelfSheet.loosePacks} bao
                    </span>
                  </div>
                  <div className="bento-sheet-slot-desc">
                    <span>Đang chứa {selectedShelfSheet.looseCount} mẫu bóc lẻ · Bấm để mở ô</span>
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
