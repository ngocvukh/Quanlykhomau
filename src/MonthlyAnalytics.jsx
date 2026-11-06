/* global window, document, Blob, URL */
import React, { useState, useMemo } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Calendar, FileText,
  ExternalLink, Download, ArrowLeft, Layers, Package,
  ChevronDown, ChevronUp, Factory, Boxes, Clock, AlertTriangle, CheckCircle2
} from 'lucide-react';

export default function MonthlyAnalytics({
  samples = [],
  destructionLogs = [],
  transactions = [],
  _products = [],
  onClose = () => {}
}) {
  // Chế độ góc nhìn: 'import' (Theo tháng nhập kho) | 'packaging' (Theo ngày sản xuất bao)
  const [viewPerspective, setViewPerspective] = useState('import');
  const [selectedYear, setSelectedYear] = useState('all');
  const [metricMode, setMetricMode] = useState('samples'); // 'samples' (số lô mẫu) | 'cartons' (số cây)
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [hoveredData, setHoveredData] = useState(null);

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. DỮ LIỆU GÓC NHÌN A: THEO THÁNG NHẬP KHO & TIÊU HỦY
  // ═════════════════════════════════════════════════════════════════════════════
  const { allMonthsData, availableYears } = useMemo(() => {
    const map = {};
    const yearsSet = new Set();

    const getMonthKey = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      yearsSet.add(String(y));
      return `${y}-${m}`;
    };

    // A. Mẫu Nhập kho (từ bảng samples)
    (samples || []).forEach(s => {
      const dateKey = s.entry_date || s.created_at;
      const mKey = getMonthKey(dateKey);
      if (!mKey) return;

      if (!map[mKey]) {
        map[mKey] = {
          key: mKey,
          year: mKey.split('-')[0],
          month: parseInt(mKey.split('-')[1], 10),
          importedSamples: 0,
          importedPacks: 0,
          destroyedSamples: 0,
          destroyedPacks: 0,
          destructionReports: [],
          importedSampleList: [],
          packagingDates: []
        };
      }

      map[mKey].importedSamples += 1;
      const qtyPacks = s.available_qty || 10;
      map[mKey].importedPacks += qtyPacks;
      map[mKey].importedSampleList.push(s);
      if (s.packaging_date && !map[mKey].packagingDates.includes(s.packaging_date)) {
        map[mKey].packagingDates.push(s.packaging_date);
      }
    });

    // B. Tiêu hủy chính thức (từ bảng destruction_logs)
    (destructionLogs || []).forEach(log => {
      const mKey = getMonthKey(log.created_at);
      if (!mKey) return;

      if (!map[mKey]) {
        map[mKey] = {
          key: mKey,
          year: mKey.split('-')[0],
          month: parseInt(mKey.split('-')[1], 10),
          importedSamples: 0,
          importedPacks: 0,
          destroyedSamples: 0,
          destroyedPacks: 0,
          destructionReports: [],
          importedSampleList: [],
          packagingDates: []
        };
      }

      const count = log.num_samples_destroyed || 0;
      map[mKey].destroyedSamples += count;
      map[mKey].destroyedPacks += count * 10;
      if (log.report_url && !map[mKey].destructionReports.includes(log.report_url)) {
        map[mKey].destructionReports.push(log.report_url);
      }
    });

    // C. Bổ sung từ transactions
    (transactions || []).filter(t => t.type === 'destroy').forEach(t => {
      const mKey = getMonthKey(t.created_at);
      if (!mKey) return;
      if (map[mKey] && map[mKey].destroyedSamples === 0) {
        map[mKey].destroyedSamples += 1;
        map[mKey].destroyedPacks += (t.quantity || 10);
      }
    });

    // D. Tính toán các chỉ số
    const list = Object.values(map).map(m => {
      const impCartons = Math.round(m.importedPacks / 10);
      const destCartons = Math.round(m.destroyedPacks / 10);
      const netSamples = m.importedSamples - m.destroyedSamples;
      const netCartons = impCartons - destCartons;
      const destructionRate = m.importedSamples > 0 
        ? ((m.destroyedSamples / m.importedSamples) * 100).toFixed(1)
        : (m.destroyedSamples > 0 ? '100.0' : '0.0');

      // Khoảng ngày sản xuất bao
      const sortedPkgs = m.packagingDates.slice().sort();
      let pkgRangeStr = 'Chưa ghi nhận';
      if (sortedPkgs.length === 1) {
        const d = new Date(sortedPkgs[0]);
        pkgRangeStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      } else if (sortedPkgs.length > 1) {
        const dFirst = new Date(sortedPkgs[0]);
        const dLast = new Date(sortedPkgs[sortedPkgs.length - 1]);
        pkgRangeStr = `${String(dFirst.getDate()).padStart(2, '0')}/${String(dFirst.getMonth() + 1).padStart(2, '0')} - ${String(dLast.getDate()).padStart(2, '0')}/${String(dLast.getMonth() + 1).padStart(2, '0')}/${dLast.getFullYear()}`;
      }

      return {
        ...m,
        importedCartons: impCartons,
        destroyedCartons: destCartons,
        netSamples,
        netCartons,
        destructionRate,
        pkgRangeStr
      };
    });

    list.sort((a, b) => a.key.localeCompare(b.key));
    const yearsArr = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    if (!yearsArr.includes('2026')) yearsArr.unshift('2026');

    return { allMonthsData: list, availableYears: yearsArr };
  }, [samples, destructionLogs, transactions]);

  // Lọc theo năm cho góc nhìn Nhập kho
  const filteredImportMonths = useMemo(() => {
    if (selectedYear === 'all') return allMonthsData;
    return allMonthsData.filter(m => m.year === selectedYear);
  }, [allMonthsData, selectedYear]);

  // KPI góc nhìn Nhập kho
  const importKpi = useMemo(() => {
    const totalImportSamples = filteredImportMonths.reduce((s, m) => s + m.importedSamples, 0);
    const totalImportCartons = filteredImportMonths.reduce((s, m) => s + m.importedCartons, 0);
    const totalDestroySamples = filteredImportMonths.reduce((s, m) => s + m.destroyedSamples, 0);
    const totalDestroyCartons = filteredImportMonths.reduce((s, m) => s + m.destroyedCartons, 0);
    const netCartons = totalImportCartons - totalDestroyCartons;
    const rate = totalImportSamples > 0 
      ? ((totalDestroySamples / totalImportSamples) * 100).toFixed(1) 
      : '0.0';

    return {
      totalImportSamples,
      totalImportCartons,
      totalDestroySamples,
      totalDestroyCartons,
      netCartons,
      rate
    };
  }, [filteredImportMonths]);

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. DỮ LIỆU GÓC NHÌN B: THEO NGÀY SẢN XUẤT BAO (PACKAGING DATE COHORTS)
  // ═════════════════════════════════════════════════════════════════════════════
  const { allPackagingCohorts, packagingYears } = useMemo(() => {
    const map = {};
    const yearsSet = new Set();
    const now = new Date();

    (samples || []).forEach(s => {
      const pkg = s.packaging_date;
      let key = 'Không rõ NSX';
      let year = 'Khác';
      let month = 0;

      if (pkg) {
        key = pkg.slice(0, 7);
        year = pkg.slice(0, 4);
        month = parseInt(pkg.slice(5, 7), 10);
        yearsSet.add(year);
      }

      if (!map[key]) {
        map[key] = {
          key,
          year,
          month,
          totalSamples: 0,
          totalPacks: 0,
          storedSamples: 0,
          storedPacks: 0,
          boxedSamples: 0,
          boxedPacks: 0,
          destroyedSamples: 0,
          destroyedPacks: 0,
          validCount: 0,
          approachingCount: 0,
          expiredCount: 0,
          sampleList: []
        };
      }

      const item = map[key];
      item.totalSamples += 1;
      const packs = s.available_qty || 10;
      item.totalPacks += packs;
      item.sampleList.push(s);

      if (s.status === 'destroyed') {
        item.destroyedSamples += 1;
        item.destroyedPacks += packs;
      } else if (s.status === 'boxed' || s.box_id) {
        item.boxedSamples += 1;
        item.boxedPacks += packs;
      } else {
        item.storedSamples += 1;
        item.storedPacks += packs;
      }

      // Đánh giá hạn sử dụng 12 tháng từ ngày sản xuất bao
      if (pkg && s.status !== 'destroyed') {
        const pkgDate = new Date(pkg);
        const ageInMonths = Math.floor((now - pkgDate) / (1000 * 60 * 60 * 24 * 30.4375));
        if (ageInMonths >= 12) {
          item.expiredCount += 1;
        } else if (ageInMonths >= 11) {
          item.approachingCount += 1;
        } else {
          item.validCount += 1;
        }
      }
    });

    const list = Object.values(map).map(item => {
      const totalCartons = Math.round(item.totalPacks / 10);
      const storedCartons = Math.round(item.storedPacks / 10);
      const boxedCartons = Math.round(item.boxedPacks / 10);
      const destroyedCartons = Math.round(item.destroyedPacks / 10);

      let ageMonths = 0;
      if (item.month && item.year !== 'Khác') {
        const y = parseInt(item.year, 10);
        ageMonths = Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - item.month));
      }

      return {
        ...item,
        totalCartons,
        storedCartons,
        boxedCartons,
        destroyedCartons,
        ageMonths
      };
    });

    list.sort((a, b) => a.key.localeCompare(b.key));
    const yearsArr = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    if (!yearsArr.includes('2026')) yearsArr.unshift('2026');

    return { allPackagingCohorts: list, packagingYears: yearsArr };
  }, [samples]);

  // Lọc theo năm cho góc nhìn Ngày SX bao
  const filteredPackagingCohorts = useMemo(() => {
    if (selectedYear === 'all') return allPackagingCohorts;
    return allPackagingCohorts.filter(m => m.year === selectedYear);
  }, [allPackagingCohorts, selectedYear]);

  // KPI góc nhìn Ngày SX bao
  const packagingKpi = useMemo(() => {
    const totalSamples = filteredPackagingCohorts.reduce((s, m) => s + m.totalSamples, 0);
    const totalCartons = filteredPackagingCohorts.reduce((s, m) => s + m.totalCartons, 0);
    const storedSamples = filteredPackagingCohorts.reduce((s, m) => s + m.storedSamples, 0);
    const storedCartons = filteredPackagingCohorts.reduce((s, m) => s + m.storedCartons, 0);
    const boxedSamples = filteredPackagingCohorts.reduce((s, m) => s + m.boxedSamples, 0);
    const boxedCartons = filteredPackagingCohorts.reduce((s, m) => s + m.boxedCartons, 0);
    const destroyedSamples = filteredPackagingCohorts.reduce((s, m) => s + m.destroyedSamples, 0);
    const destroyedCartons = filteredPackagingCohorts.reduce((s, m) => s + m.destroyedCartons, 0);
    const validCount = filteredPackagingCohorts.reduce((s, m) => s + m.validCount, 0);
    const approachingCount = filteredPackagingCohorts.reduce((s, m) => s + m.approachingCount, 0);
    const expiredCount = filteredPackagingCohorts.reduce((s, m) => s + m.expiredCount, 0);

    return {
      totalSamples,
      totalCartons,
      storedSamples,
      storedCartons,
      boxedSamples,
      boxedCartons,
      destroyedSamples,
      destroyedCartons,
      validCount,
      approachingCount,
      expiredCount
    };
  }, [filteredPackagingCohorts]);

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. THÔNG SỐ VẼ BIỂU ĐỒ SVG THUẦN (CHO CẢ 2 GÓC NHÌN)
  // ═════════════════════════════════════════════════════════════════════════════
  const activeList = viewPerspective === 'import' ? filteredImportMonths : filteredPackagingCohorts;

  const chartConfig = useMemo(() => {
    const svgWidth = 840;
    const svgHeight = 280;
    const padLeft = 55;
    const padRight = 25;
    const padTop = 35;
    const padBottom = 45;
    const plotWidth = svgWidth - padLeft - padRight;
    const plotHeight = svgHeight - padTop - padBottom;

    if (activeList.length === 0) {
      return { svgWidth, svgHeight, padLeft, padRight, padTop, padBottom, plotWidth, plotHeight, maxVal: 100, groups: [] };
    }

    if (viewPerspective === 'import') {
      // Biểu đồ cột đôi Nhập vs Hủy
      const maxValRaw = Math.max(
        ...activeList.map(m => metricMode === 'samples' 
          ? Math.max(m.importedSamples, m.destroyedSamples)
          : Math.max(m.importedCartons, m.destroyedCartons)
        ),
        10
      );

      let step = 50;
      if (maxValRaw > 300) step = 100;
      else if (maxValRaw <= 50) step = 10;
      const maxVal = Math.ceil((maxValRaw * 1.15) / step) * step;

      const groupWidth = plotWidth / activeList.length;
      const barWidth = Math.min(26, Math.max(12, (groupWidth - 20) / 2));
      const gap = 3;

      const groups = activeList.map((m, idx) => {
        const groupX = padLeft + idx * groupWidth;
        const center = groupX + groupWidth / 2;
        const impVal = metricMode === 'samples' ? m.importedSamples : m.importedCartons;
        const destVal = metricMode === 'samples' ? m.destroyedSamples : m.destroyedCartons;

        const impHeight = Math.max(0, (impVal / maxVal) * plotHeight);
        const destHeight = Math.max(0, (destVal / maxVal) * plotHeight);

        return {
          data: m,
          label: `T${m.month}/${m.year.slice(2)}`,
          fullLabel: `Tháng ${m.month}/${m.year}`,
          groupX,
          groupWidth,
          center,
          impVal,
          destVal,
          impX: center - barWidth - gap / 2,
          impY: padTop + plotHeight - impHeight,
          impHeight,
          destX: center + gap / 2,
          destY: padTop + plotHeight - destHeight,
          destHeight,
          barWidth
        };
      });

      return { svgWidth, svgHeight, padLeft, padRight, padTop, padBottom, plotWidth, plotHeight, maxVal, groups };
    } else {
      // Biểu đồ phân bổ theo Ngày SX Bao (Stacked Bar: Lưu kệ + Đóng thùng + Đã hủy)
      const maxValRaw = Math.max(
        ...activeList.map(m => metricMode === 'samples' ? m.totalSamples : m.totalCartons),
        10
      );

      let step = 20;
      if (maxValRaw > 80) step = 20;
      if (maxValRaw > 200) step = 50;
      const maxVal = Math.ceil((maxValRaw * 1.15) / step) * step;

      const groupWidth = plotWidth / activeList.length;
      const barWidth = Math.min(28, Math.max(14, groupWidth - 14));

      const groups = activeList.map((m, idx) => {
        const groupX = padLeft + idx * groupWidth;
        const center = groupX + groupWidth / 2;
        const barX = center - barWidth / 2;

        const storedVal = metricMode === 'samples' ? m.storedSamples : m.storedCartons;
        const boxedVal = metricMode === 'samples' ? m.boxedSamples : m.boxedCartons;
        const destroyedVal = metricMode === 'samples' ? m.destroyedSamples : m.destroyedCartons;
        const totalVal = metricMode === 'samples' ? m.totalSamples : m.totalCartons;

        const storedH = Math.max(0, (storedVal / maxVal) * plotHeight);
        const boxedH = Math.max(0, (boxedVal / maxVal) * plotHeight);
        const destroyedH = Math.max(0, (destroyedVal / maxVal) * plotHeight);
        const totalH = Math.max(0, (totalVal / maxVal) * plotHeight);

        const yBottom = padTop + plotHeight;
        const storedY = yBottom - storedH;
        const boxedY = storedY - boxedH;
        const destroyedY = boxedY - destroyedH;

        return {
          data: m,
          label: m.month ? `T${m.month}/${m.year.slice(2)}` : m.key,
          fullLabel: m.month ? `NSX Tháng ${m.month}/${m.year}` : m.key,
          groupX,
          groupWidth,
          center,
          barX,
          barWidth,
          storedVal,
          boxedVal,
          destroyedVal,
          totalVal,
          storedY,
          storedH,
          boxedY,
          boxedH,
          destroyedY,
          destroyedH,
          totalH,
          topY: yBottom - totalH
        };
      });

      return { svgWidth, svgHeight, padLeft, padRight, padTop, padBottom, plotWidth, plotHeight, maxVal, groups };
    }
  }, [activeList, viewPerspective, metricMode]);

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. XUẤT CSV BÁO CÁO NHANH
  // ═════════════════════════════════════════════════════════════════════════════
  const handleExportCsv = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    if (!g.document || !g.Blob || !g.URL) return;

    let headers = [];
    let rows = [];
    let filename = '';

    if (viewPerspective === 'import') {
      headers = ['Kỳ/Tháng', 'Năm', 'Lô nhập (mẫu)', 'SL nhập (cây)', 'Lô hủy (mẫu)', 'SL hủy (cây)', 'Tồn ròng (cây)', 'Tỷ lệ hủy (%)', 'Khoảng Ngày SX bao', 'Link biên bản hủy'];
      rows = filteredImportMonths.map(m => [
        `Tháng ${m.month}`,
        m.year,
        m.importedSamples,
        m.importedCartons,
        m.destroyedSamples,
        m.destroyedCartons,
        m.netCartons,
        `${m.destructionRate}%`,
        `"${m.pkgRangeStr}"`,
        m.destructionReports.join(' ; ')
      ]);
      filename = `Bao_cao_nhap_huy_mau_${selectedYear}.csv`;
    } else {
      headers = ['Tháng SX bao (NSX)', 'Năm', 'Tổng lô mẫu', 'Tổng SL (cây)', 'Đang lưu kệ (mẫu)', 'Đang lưu kệ (cây)', 'Đóng thùng (mẫu)', 'Đóng thùng (cây)', 'Đã tiêu hủy (mẫu)', 'Đã tiêu hủy (cây)', 'Tuổi mẫu (tháng)', 'Tình trạng hạn'];
      rows = filteredPackagingCohorts.map(m => {
        let statusStr = 'Còn hạn';
        if (m.destroyedSamples === m.totalSamples) statusStr = 'Đã hủy hết';
        else if (m.expiredCount > 0) statusStr = `Quá hạn 12T (${m.expiredCount} mẫu)`;
        else if (m.approachingCount > 0) statusStr = `Sắp hết hạn 11T (${m.approachingCount} mẫu)`;

        return [
          m.month ? `Tháng ${m.month}` : m.key,
          m.year,
          m.totalSamples,
          m.totalCartons,
          m.storedSamples,
          m.storedCartons,
          m.boxedSamples,
          m.boxedCartons,
          m.destroyedSamples,
          m.destroyedCartons,
          m.ageMonths,
          statusStr
        ];
      });
      filename = `Bao_cao_mau_theo_ngay_sx_bao_${selectedYear}.csv`;
    }

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new g.Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = g.URL.createObjectURL(blob);
    const link = g.document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    g.document.body.appendChild(link);
    link.click();
    g.document.body.removeChild(link);
  };

  const currentYearsList = viewPerspective === 'import' ? availableYears : packagingYears;

  return (
    <div className="monthly-analytics-page">
      {/* ── HEADER THANH CÔNG CỤ ── */}
      <div className="analytics-header-card">
        <div className="analytics-title-group">
          <button className="analytics-back-btn" onClick={onClose} title="Quay lại Tổng quan">
            <ArrowLeft size={16} />
            <span>Tổng quan</span>
          </button>
          <div className="analytics-heading">
            <div className="analytics-tag-pill">
              <BarChart3 size={14} /> Báo Cáo Lưu Chuyển & Kho Mẫu
            </div>
            <h2>
              {viewPerspective === 'import' 
                ? 'Thống Kê Nhập & Tiêu Hủy Mẫu Thuốc Lá'
                : 'Thống Kê Số Lượng Mẫu Theo Ngày Sản Xuất Bao'}
            </h2>
            <p className="analytics-subtitle">
              {viewPerspective === 'import'
                ? 'Đối chiếu số lượng nhập kho mới và số lượng tiêu hủy theo chu kỳ hàng tháng'
                : 'Phân tích số lượng mẫu theo từng tháng sản xuất bao bì (NSX), vị trí lưu trữ và tuổi mẫu 12 tháng'}
            </p>
          </div>
        </div>

        {/* ── BỘ CHUYỂN GÓC NHÌN & ĐIỀU KHIỂN ── */}
        <div className="analytics-controls">
          {/* GÓC NHÌN: THEO THÁNG NHẬP vs THEO NGÀY SX BAO */}
          <div className="analytics-perspective-selector">
            <button
              className={`perspective-btn ${viewPerspective === 'import' ? 'active' : ''}`}
              onClick={() => { setViewPerspective('import'); setExpandedMonth(null); }}
              title="Xem theo chu kỳ tháng nhập kho và tiêu hủy"
            >
              <Layers size={14} />
              <span>Theo Tháng Nhập Kho</span>
            </button>
            <button
              className={`perspective-btn ${viewPerspective === 'packaging' ? 'active' : ''}`}
              onClick={() => { setViewPerspective('packaging'); setExpandedMonth(null); }}
              title="Xem số lượng mẫu phân bổ theo Ngày/Tháng sản xuất bao (NSX)"
            >
              <Factory size={14} />
              <span>Theo Ngày SX Bao</span>
            </button>
          </div>

          {/* LỌC THEO NĂM */}
          <div className="analytics-segmented-control" title="Chọn năm thống kê">
            <button
              className={`segment-btn ${selectedYear === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedYear('all')}
            >
              Tất cả
            </button>
            {currentYearsList.map(yr => (
              <button
                key={yr}
                className={`segment-btn ${selectedYear === yr ? 'active' : ''}`}
                onClick={() => setSelectedYear(yr)}
              >
                Năm {yr}
              </button>
            ))}
          </div>

          {/* ĐƠN VỊ LÔ MẪU / SỐ CÂY */}
          <div className="analytics-segmented-control" title="Chuyển đổi hiển thị số lô hoặc số cây">
            <button
              className={`segment-btn ${metricMode === 'samples' ? 'active' : ''}`}
              onClick={() => setMetricMode('samples')}
            >
              Lô mẫu
            </button>
            <button
              className={`segment-btn ${metricMode === 'cartons' ? 'active' : ''}`}
              onClick={() => setMetricMode('cartons')}
            >
              Cây thuốc
            </button>
          </div>

          {/* NÚT XUẤT CSV */}
          <button className="analytics-export-btn" onClick={handleExportCsv} title="Tải file Excel / CSV">
            <Download size={14} />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* ── 3 THẺ CHỈ SỐ KPI TỔNG KẾT THEO GÓC NHÌN ĐƯỢC CHỌN ── */}
      {viewPerspective === 'import' ? (
        /* KPI GÓC NHÌN NHẬP KHO & TIÊU HỦY */
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi-card kpi-import">
            <div className="kpi-icon-wrap">
              <TrendingUp size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Tổng Mẫu Nhập Kho</span>
              <div className="kpi-number-row">
                <span className="kpi-number tabular">{importKpi.totalImportSamples.toLocaleString('vi-VN')}</span>
                <span className="kpi-unit">lô mẫu</span>
              </div>
              <span className="kpi-secondary-info tabular">
                Quy đổi: {importKpi.totalImportCartons.toLocaleString('vi-VN')} cây ({(importKpi.totalImportCartons * 10).toLocaleString('vi-VN')} bao)
              </span>
            </div>
          </div>

          <div className="analytics-kpi-card kpi-destroy">
            <div className="kpi-icon-wrap">
              <TrendingDown size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Tổng Mẫu Tiêu Hủy Hết Hạn</span>
              <div className="kpi-number-row">
                <span className="kpi-number tabular">{importKpi.totalDestroySamples.toLocaleString('vi-VN')}</span>
                <span className="kpi-unit">lô mẫu</span>
              </div>
              <span className="kpi-secondary-info tabular">
                Quy đổi: {importKpi.totalDestroyCartons.toLocaleString('vi-VN')} cây ({(importKpi.totalDestroyCartons * 10).toLocaleString('vi-VN')} bao)
              </span>
            </div>
          </div>

          <div className="analytics-kpi-card kpi-net">
            <div className="kpi-icon-wrap">
              <Layers size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Chênh Lệch Tồn Ròng & Tỷ Lệ Hủy</span>
              <div className="kpi-number-row">
                <span className={`kpi-number tabular ${importKpi.netCartons >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {importKpi.netCartons >= 0 ? `+${importKpi.netCartons.toLocaleString('vi-VN')}` : importKpi.netCartons.toLocaleString('vi-VN')}
                </span>
                <span className="kpi-unit">cây tồn</span>
              </div>
              <span className="kpi-secondary-info tabular">
                Tỷ lệ tiêu hủy/nhập: <strong style={{ color: 'var(--kraft-gold)' }}>{importKpi.rate}%</strong>
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* KPI GÓC NHÌN NGÀY SẢN XUẤT BAO */
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi-card kpi-pkg-total">
            <div className="kpi-icon-wrap">
              <Factory size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Tổng Lô Mẫu Theo Ngày SX Bao</span>
              <div className="kpi-number-row">
                <span className="kpi-number tabular">{packagingKpi.totalSamples.toLocaleString('vi-VN')}</span>
                <span className="kpi-unit">lô mẫu</span>
              </div>
              <span className="kpi-secondary-info tabular">
                Quy đổi: {packagingKpi.totalCartons.toLocaleString('vi-VN')} cây ({filteredPackagingCohorts.length} kỳ sản xuất)
              </span>
            </div>
          </div>

          <div className="analytics-kpi-card kpi-pkg-status">
            <div className="kpi-icon-wrap">
              <Boxes size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Phân Bổ Vị Trí Kho Hiện Tại</span>
              <div className="kpi-number-row">
                <span className="kpi-number tabular text-positive">{packagingKpi.storedSamples}</span>
                <span className="kpi-unit">kệ</span>
                <span style={{ color: '#72857A', margin: '0 4px' }}>·</span>
                <span className="kpi-number tabular text-kraft">{packagingKpi.boxedSamples}</span>
                <span className="kpi-unit">thùng</span>
                <span style={{ color: '#72857A', margin: '0 4px' }}>·</span>
                <span className="kpi-number tabular text-negative">{packagingKpi.destroyedSamples}</span>
                <span className="kpi-unit">hủy</span>
              </div>
              <span className="kpi-secondary-info tabular">
                Đang lưu thực tế: <strong>{(packagingKpi.storedCartons + packagingKpi.boxedCartons).toLocaleString('vi-VN')} cây</strong>
              </span>
            </div>
          </div>

          <div className="analytics-kpi-card kpi-pkg-expiry">
            <div className="kpi-icon-wrap">
              <Clock size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Theo Dõi Tuổi Mẫu (Hạn 12 Tháng)</span>
              <div className="kpi-number-row">
                <span className="kpi-number tabular text-positive">{packagingKpi.validCount}</span>
                <span className="kpi-unit">an toàn</span>
                {packagingKpi.approachingCount > 0 && (
                  <>
                    <span style={{ color: '#72857A', margin: '0 4px' }}>·</span>
                    <span className="kpi-number tabular text-warn">{packagingKpi.approachingCount}</span>
                    <span className="kpi-unit">sắp hạn 11T</span>
                  </>
                )}
              </div>
              <span className="kpi-secondary-info tabular">
                {packagingKpi.expiredCount > 0 ? (
                  <span style={{ color: 'var(--status-error)' }}>⚠️ Có {packagingKpi.expiredCount} mẫu quá hạn 12 tháng!</span>
                ) : (
                  <span style={{ color: '#5DAA7F' }}>✓ Tất cả các mẫu đang lưu đều trong hạn 12 tháng</span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── BIỂU ĐỒ TRỰC QUAN NATIVE SVG ── */}
      <div className="analytics-chart-panel">
        <div className="analytics-chart-header">
          <div className="chart-title-box">
            <h3>
              {viewPerspective === 'import'
                ? 'Biểu Đồ So Sánh Nhập vs Tiêu Hủy Hàng Tháng'
                : 'Biểu Đồ Phân Bổ Số Lượng Mẫu Theo Ngày Sản Xuất Bao'}
            </h3>
            <span className="chart-note">
              Hiển thị theo: <strong>{metricMode === 'samples' ? 'Số lượng lô mẫu' : 'Số cây thuốc lá'}</strong> · Rê chuột/chạm vào cột để xem chi tiết
            </span>
          </div>

          {/* CHÚ THÍCH BIỂU ĐỒ (LEGEND) */}
          <div className="chart-legend">
            {viewPerspective === 'import' ? (
              <>
                <div className="legend-item">
                  <span className="legend-color-box bar-import-color" />
                  <span>Mẫu nhập kho</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color-box bar-destroy-color" />
                  <span>Mẫu tiêu hủy</span>
                </div>
              </>
            ) : (
              <>
                <div className="legend-item">
                  <span className="legend-color-box bar-stored-color" />
                  <span>Đang lưu trên kệ</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color-box bar-boxed-color" />
                  <span>Đóng thùng lưu</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color-box bar-destroy-color" />
                  <span>Đã tiêu hủy</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* KHUNG VẼ SVG */}
        <div className="analytics-svg-container">
          <svg
            viewBox={`0 0 ${chartConfig.svgWidth} ${chartConfig.svgHeight}`}
            className="analytics-svg-element"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="gradImport" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6BC490" />
                <stop offset="100%" stopColor="#3E8C63" />
              </linearGradient>
              <linearGradient id="gradDestroy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#EB6D61" />
                <stop offset="100%" stopColor="#B33E33" />
              </linearGradient>
              <linearGradient id="gradBoxed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#DFB77D" />
                <stop offset="100%" stopColor="#A67C43" />
              </linearGradient>
            </defs>

            {/* Trục ngang & Gridlines Y */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const yVal = Math.round(chartConfig.maxVal * ratio);
              const yPos = chartConfig.padTop + chartConfig.plotHeight * (1 - ratio);
              return (
                <g key={ratio} className="grid-line-group">
                  <line
                    x1={chartConfig.padLeft}
                    y1={yPos}
                    x2={chartConfig.svgWidth - chartConfig.padRight}
                    y2={yPos}
                    stroke="#23352B"
                    strokeDasharray={ratio === 0 ? 'none' : '3 3'}
                    strokeWidth={ratio === 0 ? 1.5 : 1}
                  />
                  <text
                    x={chartConfig.padLeft - 8}
                    y={yPos + 4}
                    fill="#7C9286"
                    fontSize="10.5"
                    textAnchor="end"
                    className="tabular"
                  >
                    {yVal}
                  </text>
                </g>
              );
            })}

            <line
              x1={chartConfig.padLeft}
              y1={chartConfig.padTop + chartConfig.plotHeight}
              x2={chartConfig.svgWidth - chartConfig.padRight}
              y2={chartConfig.padTop + chartConfig.plotHeight}
              stroke="#2E4638"
              strokeWidth="1.5"
            />

            {/* Render các cột theo góc nhìn */}
            {viewPerspective === 'import' ? (
              // Cột đôi Nhập vs Hủy
              chartConfig.groups.map((g) => {
                const isHovered = hoveredData?.key === g.data.key;
                return (
                  <g
                    key={g.data.key}
                    className="bar-group"
                    onMouseEnter={() => setHoveredData(g.data)}
                    onMouseLeave={() => setHoveredData(null)}
                    onClick={() => setExpandedMonth(expandedMonth === g.data.key ? null : g.data.key)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={g.groupX + 2}
                      y={chartConfig.padTop}
                      width={g.groupWidth - 4}
                      height={chartConfig.plotHeight}
                      fill={isHovered ? 'rgba(201, 164, 106, 0.08)' : 'transparent'}
                      rx="6"
                    />

                    {g.impHeight > 0 && (
                      <rect
                        x={g.impX}
                        y={g.impY}
                        width={g.barWidth}
                        height={g.impHeight}
                        fill="url(#gradImport)"
                        rx="3"
                        className="chart-bar"
                      />
                    )}
                    {g.impHeight > 16 && (
                      <text
                        x={g.impX + g.barWidth / 2}
                        y={g.impY - 5}
                        fill="#86EFAC"
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="middle"
                        className="tabular"
                      >
                        {g.impVal}
                      </text>
                    )}

                    {g.destHeight > 0 && (
                      <rect
                        x={g.destX}
                        y={g.destY}
                        width={g.barWidth}
                        height={g.destHeight}
                        fill="url(#gradDestroy)"
                        rx="3"
                        className="chart-bar"
                      />
                    )}
                    {g.destHeight > 16 && (
                      <text
                        x={g.destX + g.barWidth / 2}
                        y={g.destY - 5}
                        fill="#FCA5A5"
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="middle"
                        className="tabular"
                      >
                        {g.destVal}
                      </text>
                    )}

                    <text
                      x={g.center}
                      y={chartConfig.padTop + chartConfig.plotHeight + 20}
                      fill={isHovered ? '#C9A46A' : '#94A3B8'}
                      fontSize="10.5"
                      fontWeight={isHovered ? '700' : '500'}
                      textAnchor="middle"
                    >
                      {g.label}
                    </text>
                  </g>
                );
              })
            ) : (
              // Cột phân khúc (Stacked Bar) theo Ngày SX Bao
              chartConfig.groups.map((g) => {
                const isHovered = hoveredData?.key === g.data.key;
                return (
                  <g
                    key={g.data.key}
                    className="bar-group"
                    onMouseEnter={() => setHoveredData(g.data)}
                    onMouseLeave={() => setHoveredData(null)}
                    onClick={() => setExpandedMonth(expandedMonth === g.data.key ? null : g.data.key)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={g.groupX + 1}
                      y={chartConfig.padTop}
                      width={g.groupWidth - 2}
                      height={chartConfig.plotHeight}
                      fill={isHovered ? 'rgba(201, 164, 106, 0.08)' : 'transparent'}
                      rx="6"
                    />

                    {/* Phân khúc 1: Lưu trên kệ (xanh) */}
                    {g.storedH > 0 && (
                      <rect
                        x={g.barX}
                        y={g.storedY}
                        width={g.barWidth}
                        height={g.storedH}
                        fill="url(#gradImport)"
                        rx={g.boxedH === 0 && g.destroyedH === 0 ? 3 : 0}
                        className="chart-bar"
                      />
                    )}

                    {/* Phân khúc 2: Đóng thùng (vàng kraft) */}
                    {g.boxedH > 0 && (
                      <rect
                        x={g.barX}
                        y={g.boxedY}
                        width={g.barWidth}
                        height={g.boxedH}
                        fill="url(#gradBoxed)"
                        rx={g.destroyedH === 0 ? 3 : 0}
                        className="chart-bar"
                      />
                    )}

                    {/* Phân khúc 3: Đã tiêu hủy (đỏ đất) */}
                    {g.destroyedH > 0 && (
                      <rect
                        x={g.barX}
                        y={g.destroyedY}
                        width={g.barWidth}
                        height={g.destroyedH}
                        fill="url(#gradDestroy)"
                        rx="3"
                        className="chart-bar"
                      />
                    )}

                    {/* Tổng số trên đỉnh cột */}
                    {g.totalH > 14 && (
                      <text
                        x={g.center}
                        y={g.topY - 6}
                        fill="#F3F1EC"
                        fontSize="10"
                        fontWeight="700"
                        textAnchor="middle"
                        className="tabular"
                      >
                        {g.totalVal}
                      </text>
                    )}

                    <text
                      x={g.center}
                      y={chartConfig.padTop + chartConfig.plotHeight + 20}
                      fill={isHovered ? '#C9A46A' : '#94A3B8'}
                      fontSize="10"
                      fontWeight={isHovered ? '700' : '500'}
                      textAnchor="middle"
                    >
                      {g.label}
                    </text>
                  </g>
                );
              })
            )}
          </svg>

          {/* FLOATING HOVER TOOLTIP */}
          {hoveredData && (
            <div className="analytics-chart-tooltip">
              {viewPerspective === 'import' ? (
                <>
                  <div className="tooltip-title">
                    <Calendar size={13} />
                    <span>Tháng {hoveredData.month}/{hoveredData.year}</span>
                  </div>
                  <div className="tooltip-row text-import">
                    <span>Nhập kho:</span>
                    <b>{hoveredData.importedSamples} mẫu ({hoveredData.importedCartons} cây)</b>
                  </div>
                  <div className="tooltip-row text-destroy">
                    <span>Tiêu hủy:</span>
                    <b>{hoveredData.destroyedSamples} mẫu ({hoveredData.destroyedCartons} cây)</b>
                  </div>
                  <div className="tooltip-row text-net">
                    <span>Tồn ròng:</span>
                    <b>{hoveredData.netCartons >= 0 ? `+${hoveredData.netCartons}` : hoveredData.netCartons} cây</b>
                  </div>
                  <div className="tooltip-badge">
                    <Factory size={11} /> NSX bao: {hoveredData.pkgRangeStr}
                  </div>
                </>
              ) : (
                <>
                  <div className="tooltip-title">
                    <Factory size={13} />
                    <span>Tháng SX Bao {hoveredData.month ? `${hoveredData.month}/${hoveredData.year}` : hoveredData.key}</span>
                  </div>
                  <div className="tooltip-row" style={{ color: '#F3F1EC' }}>
                    <span>Tổng sản xuất:</span>
                    <b>{hoveredData.totalSamples} mẫu ({hoveredData.totalCartons} cây)</b>
                  </div>
                  <div className="tooltip-row text-import">
                    <span>Lưu trên kệ:</span>
                    <b>{hoveredData.storedSamples} mẫu ({hoveredData.storedCartons} cây)</b>
                  </div>
                  {hoveredData.boxedSamples > 0 && (
                    <div className="tooltip-row text-kraft">
                      <span>Đóng thùng:</span>
                      <b>{hoveredData.boxedSamples} mẫu ({hoveredData.boxedCartons} cây)</b>
                    </div>
                  )}
                  {hoveredData.destroyedSamples > 0 && (
                    <div className="tooltip-row text-destroy">
                      <span>Đã tiêu hủy:</span>
                      <b>{hoveredData.destroyedSamples} mẫu ({hoveredData.destroyedCartons} cây)</b>
                    </div>
                  )}
                  <div className="tooltip-badge">
                    <Clock size={11} /> Tuổi mẫu: {hoveredData.ageMonths} tháng
                    {hoveredData.approachingCount > 0 && ' (⚠️ Sắp hết hạn 11T)'}
                    {hoveredData.expiredCount > 0 && ' (⛔ Quá hạn 12T)'}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── BẢNG DỮ LIỆU CHI TIẾT ── */}
      <div className="analytics-table-panel">
        <div className="table-header-bar">
          <div className="table-title">
            <Package size={18} className="icon-gold" />
            <div>
              <h3>
                {viewPerspective === 'import'
                  ? 'Bảng Dữ Liệu Lưu Chuyển Nhập & Hủy Hàng Tháng'
                  : 'Bảng Quản Lý Số Lượng Mẫu Theo Ngày Sản Xuất Bao (NSX)'}
              </h3>
              <span className="table-subtitle">
                {viewPerspective === 'import'
                  ? 'Thống kê chi tiết số lô, số lượng quy đổi, khoảng ngày SX bao và biên bản pháp lý'
                  : 'Thống kê toàn bộ số lượng mẫu thuốc lá phân theo tháng sản xuất bao bì và tình trạng hạn 12T'}
              </span>
            </div>
          </div>
          <div className="table-quick-info">
            <span>Tổng cộng: <strong>{activeList.length} kỳ thống kê</strong></span>
          </div>
        </div>

        <div className="analytics-table-responsive">
          {viewPerspective === 'import' ? (
            /* BẢNG GÓC NHÌN NHẬP KHO */
            <table className="analytics-data-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Kỳ / Tháng</th>
                  <th>Lô nhập</th>
                  <th>SL Nhập (Cây/Bao)</th>
                  <th>Lô hủy</th>
                  <th>SL Hủy (Cây/Bao)</th>
                  <th>Tồn ròng</th>
                  <th>Tỷ lệ hủy</th>
                  <th>Khoảng Ngày SX Bao</th>
                  <th style={{ textAlign: 'center' }}>Biên bản hủy</th>
                  <th style={{ textAlign: 'right' }}>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {filteredImportMonths.slice().reverse().map((m) => {
                  const isExpanded = expandedMonth === m.key;
                  return (
                    <React.Fragment key={m.key}>
                      <tr className={`table-row-main ${isExpanded ? 'row-expanded' : ''}`}>
                        <td>
                          <div className="month-badge">
                            <Calendar size={13} />
                            <span>Tháng {m.month}/{m.year}</span>
                          </div>
                        </td>
                        <td>
                          <span className="badge-import-count">
                            {m.importedSamples > 0 ? `+${m.importedSamples} mẫu` : '0 mẫu'}
                          </span>
                        </td>
                        <td className="tabular">
                          <strong>{m.importedCartons.toLocaleString('vi-VN')} cây</strong>
                          <span className="sub-unit">({(m.importedCartons * 10).toLocaleString('vi-VN')} bao)</span>
                        </td>
                        <td>
                          {m.destroyedSamples > 0 ? (
                            <span className="badge-destroy-count">
                              -{m.destroyedSamples} mẫu
                            </span>
                          ) : (
                            <span className="badge-empty">—</span>
                          )}
                        </td>
                        <td className="tabular">
                          {m.destroyedCartons > 0 ? (
                            <>
                              <strong style={{ color: '#F87171' }}>{m.destroyedCartons.toLocaleString('vi-VN')} cây</strong>
                              <span className="sub-unit">({(m.destroyedCartons * 10).toLocaleString('vi-VN')} bao)</span>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="tabular">
                          <span className={`net-pill ${m.netCartons >= 0 ? 'net-positive' : 'net-negative'}`}>
                            {m.netCartons >= 0 ? `+${m.netCartons.toLocaleString('vi-VN')}` : m.netCartons.toLocaleString('vi-VN')} cây
                          </span>
                        </td>
                        <td className="tabular">
                          <div className="ratio-bar-wrap">
                            <span className="ratio-text">{m.destructionRate}%</span>
                            <div className="ratio-bar-track">
                              <div 
                                className="ratio-bar-fill" 
                                style={{ width: `${Math.min(100, parseFloat(m.destructionRate) || 0)}%` }} 
                              />
                            </div>
                          </div>
                        </td>
                        {/* CỘT MỚI: KHOẢNG NGÀY SX BAO */}
                        <td style={{ fontSize: '12px', color: '#B3C4B9' }}>
                          <span className="pkg-date-tag">
                            <Factory size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />
                            {m.pkgRangeStr}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {m.destructionReports && m.destructionReports.length > 0 ? (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              {m.destructionReports.map((url, rIdx) => (
                                <a
                                  key={rIdx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="report-pdf-btn"
                                  title="Mở biên bản tiêu hủy có chữ ký kiểm định (PDF)"
                                >
                                  <FileText size={13} />
                                  <span>Xem PDF{m.destructionReports.length > 1 ? ` (${rIdx + 1})` : ''}</span>
                                  <ExternalLink size={11} />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '12px' }}>Không có</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="table-toggle-btn"
                            onClick={() => setExpandedMonth(isExpanded ? null : m.key)}
                            title="Xem danh sách các mẫu thuộc tháng này"
                          >
                            <span>{isExpanded ? 'Thu gọn' : 'Xem mẫu'}</span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="table-row-drawer">
                          <td colSpan={10}>
                            <div className="month-drawer-content">
                              <div className="drawer-header">
                                <h4>Danh sách mẫu nhập kho Tháng {m.month}/{m.year}</h4>
                                <span className="drawer-count">{m.importedSampleList.length} mẫu ghi nhận</span>
                              </div>
                              <div className="drawer-samples-grid">
                                {m.importedSampleList.slice(0, 30).map((s, sIdx) => {
                                  const prodName = s.products?.product_name || s.product_name || 'Mẫu thuốc lá';
                                  const locStr = s.shelf ? `Kệ ${['', 'A', 'B', 'C', 'D', 'E', 'F'][s.shelf] || s.shelf}${s.slot}` : (s.box_id ? 'Trong thùng' : 'Chưa xếp kệ');
                                  return (
                                    <div key={s.id || sIdx} className="drawer-sample-item">
                                      <div className="sample-main-name">{prodName}</div>
                                      <div className="sample-sub-meta">
                                        <span>Ngày SX bao: <strong style={{ color: 'var(--bento-kraft)' }}>{s.packaging_date || 'Chưa rõ'}</strong></span>
                                        <span>Vị trí: <strong>{locStr}</strong></span>
                                        <span>Tồn: <strong>{s.available_qty || 10} bao</strong></span>
                                        {s.status === 'destroyed' && <span className="tag-destroyed">Đã tiêu hủy</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                                {m.importedSampleList.length > 30 && (
                                  <div className="drawer-more-hint">Và {m.importedSampleList.length - 30} mẫu khác...</div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* BẢNG GÓC NHÌN THEO NGÀY SẢN XUẤT BAO */
            <table className="analytics-data-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Tháng SX Bao (NSX)</th>
                  <th>Tổng Lô Mẫu</th>
                  <th>Tổng SL Cây (Bao)</th>
                  <th>Lưu Trên Kệ</th>
                  <th>Đóng Thùng Lưu</th>
                  <th>Đã Tiêu Hủy</th>
                  <th>Tuổi Mẫu</th>
                  <th>Tình Trạng Hạn 12T</th>
                  <th style={{ textAlign: 'right' }}>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {filteredPackagingCohorts.slice().reverse().map((c) => {
                  const isExpanded = expandedMonth === c.key;
                  const isExpired = c.expiredCount > 0;
                  const isApproaching = c.approachingCount > 0 && !isExpired;
                  const isAllDestroyed = c.destroyedSamples === c.totalSamples && c.totalSamples > 0;

                  return (
                    <React.Fragment key={c.key}>
                      <tr className={`table-row-main ${isExpanded ? 'row-expanded' : ''}`}>
                        {/* Tháng SX bao */}
                        <td>
                          <div className="month-badge">
                            <Factory size={13} />
                            <span>{c.month ? `Tháng ${c.month}/${c.year}` : c.key}</span>
                          </div>
                        </td>

                        {/* Tổng lô mẫu */}
                        <td>
                          <span className="badge-pkg-total">
                            {c.totalSamples} mẫu
                          </span>
                        </td>

                        {/* Tổng số lượng */}
                        <td className="tabular">
                          <strong>{c.totalCartons.toLocaleString('vi-VN')} cây</strong>
                          <span className="sub-unit">({(c.totalCartons * 10).toLocaleString('vi-VN')} bao)</span>
                        </td>

                        {/* Lưu trên kệ */}
                        <td className="tabular">
                          {c.storedSamples > 0 ? (
                            <span style={{ color: '#5DAA7F', fontWeight: '600' }}>
                              {c.storedSamples} mẫu ({c.storedCartons} cây)
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        {/* Đóng thùng */}
                        <td className="tabular">
                          {c.boxedSamples > 0 ? (
                            <span style={{ color: 'var(--bento-kraft)', fontWeight: '600' }}>
                              {c.boxedSamples} mẫu ({c.boxedCartons} cây)
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        {/* Đã hủy */}
                        <td className="tabular">
                          {c.destroyedSamples > 0 ? (
                            <span style={{ color: '#F87171', fontWeight: '600' }}>
                              {c.destroyedSamples} mẫu ({c.destroyedCartons} cây)
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        {/* Tuổi mẫu */}
                        <td className="tabular">
                          <span style={{ color: c.ageMonths >= 12 ? '#F87171' : c.ageMonths >= 11 ? '#FBBF24' : '#C5CEC8' }}>
                            <strong>{c.ageMonths}</strong> tháng
                          </span>
                        </td>

                        {/* Tình trạng hạn 12 tháng */}
                        <td>
                          {isAllDestroyed ? (
                            <span className="tag-status-neutral">
                              <CheckCircle2 size={12} /> Đã hủy hoàn tất
                            </span>
                          ) : isExpired ? (
                            <span className="tag-status-danger">
                              <AlertTriangle size={12} /> Quá hạn ({c.expiredCount} mẫu)
                            </span>
                          ) : isApproaching ? (
                            <span className="tag-status-warning">
                              <Clock size={12} /> Sắp hết hạn ({c.approachingCount} mẫu)
                            </span>
                          ) : (
                            <span className="tag-status-success">
                              <CheckCircle2 size={12} /> Còn hạn lưu trữ
                            </span>
                          )}
                        </td>

                        {/* Nút xem chi tiết */}
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="table-toggle-btn"
                            onClick={() => setExpandedMonth(isExpanded ? null : c.key)}
                            title="Xem các mẫu thuốc lá thuộc tháng sản xuất bao này"
                          >
                            <span>{isExpanded ? 'Thu gọn' : 'Xem mẫu'}</span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </td>
                      </tr>

                      {/* VÙNG MỞ RỘNG MẪU THEO NGÀY SX BAO */}
                      {isExpanded && (
                        <tr className="table-row-drawer">
                          <td colSpan={9}>
                            <div className="month-drawer-content">
                              <div className="drawer-header">
                                <h4>
                                  Danh sách mẫu có Ngày SX Bao {c.month ? `Tháng ${c.month}/${c.year}` : c.key}
                                </h4>
                                <span className="drawer-count">{c.sampleList.length} mẫu ghi nhận</span>
                              </div>
                              <div className="drawer-samples-grid">
                                {c.sampleList.slice(0, 30).map((s, sIdx) => {
                                  const prodName = s.products?.product_name || s.product_name || 'Mẫu thuốc lá';
                                  const locStr = s.shelf 
                                    ? `Kệ ${['', 'A', 'B', 'C', 'D', 'E', 'F'][s.shelf] || s.shelf}${s.slot}` 
                                    : (s.box_id ? 'Trong thùng lưu trữ' : 'Chưa xếp kệ');

                                  return (
                                    <div key={s.id || sIdx} className="drawer-sample-item">
                                      <div className="sample-main-name">{prodName}</div>
                                      <div className="sample-sub-meta">
                                        <span>Ngày SX bao: <strong style={{ color: 'var(--bento-kraft)' }}>{s.packaging_date || 'Chưa rõ'}</strong></span>
                                        <span>Vị trí: <strong>{locStr}</strong></span>
                                        <span>Tồn: <strong>{s.available_qty || 10} bao</strong></span>
                                        {s.status === 'destroyed' && <span className="tag-destroyed">Đã hủy</span>}
                                        {s.status === 'boxed' && <span className="tag-boxed">Trong thùng</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                                {c.sampleList.length > 30 && (
                                  <div className="drawer-more-hint">Và {c.sampleList.length - 30} mẫu khác...</div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
