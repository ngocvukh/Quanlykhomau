/* global window, document, Blob, URL */
import React, { useState, useMemo } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Calendar, FileText,
  ExternalLink, Download, ArrowLeft, Layers, Package,
  ChevronDown, ChevronUp, Factory, Boxes, Clock, AlertTriangle, CheckCircle2, ArrowRightLeft
} from './GoogleIcons';

export default function MonthlyAnalytics({
  samples = [],
  destructionLogs = [],
  transactions = [],
  products = [],
  onClose = () => {}
}) {
  // Chế độ góc nhìn: 'import' (Theo tháng nhập kho) | 'packaging' (Theo ngày sản xuất bao)
  const [viewPerspective, setViewPerspective] = useState('import');
  const [selectedYear, setSelectedYear] = useState('all');
  const [marketFilter, setMarketFilter] = useState('all'); // 'all' | 'domestic' (nội địa) | 'export' (xuất khẩu)
  const [metricMode] = useState('cartons'); // Mặc định hiển thị theo số cây thực tế
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [drawerStatusFilter, setDrawerStatusFilter] = useState('all'); // 'all' | 'stored' | 'dispatched' | 'destroyed'
  const [hoveredData, setHoveredData] = useState(null);

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. DỮ LIỆU GÓC NHÌN A: THEO THÁNG NHẬP KHO & TIÊU HỦY
  // ═════════════════════════════════════════════════════════════════════════════
  // Tra cứu sản phẩm để xác định Hàng Xuất khẩu vs Nội địa
  const isSampleExport = (s) => {
    if (s.is_export !== undefined) return !!s.is_export;
    if (s.products?.is_export !== undefined) return !!s.products.is_export;
    if (s.product?.is_export !== undefined) return !!s.product.is_export;
    const prodId = s.product_id;
    if (prodId && products && products.length > 0) {
      const p = products.find(prod => prod.id === prodId);
      if (p) return !!p.is_export;
    }
    const name = s.product_name || s.products?.product_name || s.name || '';
    if (s.order_number) return true;
    if (name && products && products.length > 0) {
      const p = products.find(prod => prod.product_name === name);
      if (p) return !!p.is_export;
    }
    return false;
  };

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
      // Lọc theo Thị trường: Nội địa vs Xuất khẩu
      const isExp = isSampleExport(s);
      if (marketFilter === 'domestic' && isExp) return;
      if (marketFilter === 'export' && !isExp) return;

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
          dispatchedSamples: 0,
          dispatchedPacks: 0,
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
          dispatchedSamples: 0,
          dispatchedPacks: 0,
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

    // C2. Thống kê Lấy mẫu sử dụng (QC cấp phát) từ transactions (take_approve)
    const approvedSampleIdsPerMonth = {};
    (transactions || []).filter(t => t.type === 'take_approve' && t.status === 'approved').forEach(t => {
      const mKey = getMonthKey(t.created_at);
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
          dispatchedSamples: 0,
          dispatchedPacks: 0,
          destructionReports: [],
          importedSampleList: [],
          packagingDates: []
        };
      }
      const packs = Number(t.quantity) || 1;
      map[mKey].dispatchedPacks += packs;
      if (!approvedSampleIdsPerMonth[mKey]) approvedSampleIdsPerMonth[mKey] = new Set();
      if (t.sample_id) approvedSampleIdsPerMonth[mKey].add(t.sample_id);
    });

    Object.keys(approvedSampleIdsPerMonth).forEach(mKey => {
      if (map[mKey]) {
        map[mKey].dispatchedSamples = approvedSampleIdsPerMonth[mKey].size;
      }
    });

    // D. Tính toán các chỉ số
    const list = Object.values(map).map(m => {
      const impCartons = Math.round(m.importedPacks / 10);
      const destCartons = Math.round(m.destroyedPacks / 10);
      const dispCartons = Math.round((m.dispatchedPacks || 0) / 10);
      const netSamples = m.importedSamples - m.destroyedSamples - (m.dispatchedSamples || 0);
      const netCartons = impCartons - destCartons - dispCartons;
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
        dispatchedCartons: dispCartons,
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
  }, [samples, destructionLogs, transactions, products, marketFilter]);

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
    const totalDispatchSamples = filteredImportMonths.reduce((s, m) => s + (m.dispatchedSamples || 0), 0);
    const totalDispatchCartons = filteredImportMonths.reduce((s, m) => s + (m.dispatchedCartons || 0), 0);
    const totalDispatchPacks = filteredImportMonths.reduce((s, m) => s + (m.dispatchedPacks || 0), 0);
    const netCartons = totalImportCartons - totalDestroyCartons - totalDispatchCartons;
    const rate = totalImportSamples > 0 
      ? ((totalDestroySamples / totalImportSamples) * 100).toFixed(1) 
      : '0.0';

    return {
      totalImportSamples,
      totalImportCartons,
      totalDestroySamples,
      totalDestroyCartons,
      totalDispatchSamples,
      totalDispatchCartons,
      totalDispatchPacks,
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
      // Lọc theo Thị trường: Nội địa vs Xuất khẩu
      const isExp = isSampleExport(s);
      if (marketFilter === 'domestic' && isExp) return;
      if (marketFilter === 'export' && !isExp) return;

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
          dispatchedSamples: 0,
          dispatchedPacks: 0,
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
      const packs = s.available_qty !== undefined ? s.available_qty : 10;
      item.totalPacks += (s.total_qty || 10);
      item.sampleList.push(s);

      if (s.status === 'destroyed') {
        item.destroyedSamples += 1;
        item.destroyedPacks += 10;
      } else if (s.status === 'dispatched') {
        item.dispatchedSamples += 1;
        item.dispatchedPacks += 10;
      } else if (s.status === 'boxed' || s.box_id) {
        item.boxedSamples += 1;
        item.boxedPacks += packs;
      } else {
        item.storedSamples += 1;
        item.storedPacks += packs;
        if (packs < 10) {
          item.dispatchedSamples += 1;
          item.dispatchedPacks += (10 - packs);
        }
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
      const dispatchedCartons = Math.round((item.dispatchedPacks || 0) / 10);
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
        dispatchedCartons,
        destroyedCartons,
        ageMonths
      };
    });

    list.sort((a, b) => a.key.localeCompare(b.key));
    const yearsArr = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    if (!yearsArr.includes('2026')) yearsArr.unshift('2026');

    return { allPackagingCohorts: list, packagingYears: yearsArr };
  }, [samples, products, marketFilter]);

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
    const dispatchedSamples = filteredPackagingCohorts.reduce((s, m) => s + (m.dispatchedSamples || 0), 0);
    const dispatchedCartons = filteredPackagingCohorts.reduce((s, m) => s + (m.dispatchedCartons || 0), 0);
    const dispatchedPacks = filteredPackagingCohorts.reduce((s, m) => s + (m.dispatchedPacks || 0), 0);
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
      dispatchedSamples,
      dispatchedCartons,
      dispatchedPacks,
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
      // Biểu đồ 3 cột: Nhập kho vs Lấy mẫu sử dụng vs Tiêu hủy
      const maxValRaw = Math.max(
        ...activeList.map(m => metricMode === 'samples' 
          ? Math.max(m.importedSamples, m.destroyedSamples, m.dispatchedSamples || 0)
          : Math.max(m.importedCartons, m.destroyedCartons, m.dispatchedCartons || 0)
        ),
        10
      );

      let step = 50;
      if (maxValRaw > 300) step = 100;
      else if (maxValRaw <= 50) step = 10;
      const maxVal = Math.ceil((maxValRaw * 1.15) / step) * step;

      const groupWidth = plotWidth / activeList.length;
      const barWidth = Math.min(18, Math.max(8, (groupWidth - 18) / 3));
      const gap = 2;

      const groups = activeList.map((m, idx) => {
        const groupX = padLeft + idx * groupWidth;
        const center = groupX + groupWidth / 2;
        const impVal = metricMode === 'samples' ? m.importedSamples : m.importedCartons;
        const dispVal = metricMode === 'samples' ? (m.dispatchedSamples || 0) : (m.dispatchedCartons || 0);
        const destVal = metricMode === 'samples' ? m.destroyedSamples : m.destroyedCartons;

        const impHeight = Math.max(0, (impVal / maxVal) * plotHeight);
        const dispHeight = Math.max(0, (dispVal / maxVal) * plotHeight);
        const destHeight = Math.max(0, (destVal / maxVal) * plotHeight);

        const totalWidth = barWidth * 3 + gap * 2;
        const startX = center - totalWidth / 2;

        return {
          data: m,
          label: `T${m.month}/${m.year.slice(2)}`,
          fullLabel: `Tháng ${m.month}/${m.year}`,
          groupX,
          groupWidth,
          center,
          impVal,
          dispVal,
          destVal,
          impX: startX,
          impY: padTop + plotHeight - impHeight,
          impHeight,
          dispX: startX + barWidth + gap,
          dispY: padTop + plotHeight - dispHeight,
          dispHeight,
          destX: startX + (barWidth + gap) * 2,
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
        const dispatchedVal = metricMode === 'samples' ? (m.dispatchedSamples || 0) : (m.dispatchedCartons || 0);
        const destroyedVal = metricMode === 'samples' ? m.destroyedSamples : m.destroyedCartons;
        const totalVal = metricMode === 'samples' ? m.totalSamples : m.totalCartons;

        const storedH = Math.max(0, (storedVal / maxVal) * plotHeight);
        const boxedH = Math.max(0, (boxedVal / maxVal) * plotHeight);
        const dispatchedH = Math.max(0, (dispatchedVal / maxVal) * plotHeight);
        const destroyedH = Math.max(0, (destroyedVal / maxVal) * plotHeight);
        const totalH = Math.max(0, (totalVal / maxVal) * plotHeight);

        const yBottom = padTop + plotHeight;
        const storedY = yBottom - storedH;
        const boxedY = storedY - boxedH;
        const dispatchedY = boxedY - dispatchedH;
        const destroyedY = dispatchedY - destroyedH;

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
          dispatchedVal,
          destroyedVal,
          totalVal,
          storedY,
          storedH,
          boxedY,
          boxedH,
          dispatchedY,
          dispatchedH,
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
      headers = ['Kỳ/Tháng', 'Năm', 'Mẫu nhập', 'SL nhập (cây)', 'Mẫu lấy sử dụng', 'SL lấy (bao)', 'Mẫu hủy', 'SL hủy (cây)', 'Tồn ròng (cây)', 'Tỷ lệ hủy (%)', 'Khoảng Ngày SX bao', 'Link biên bản hủy'];
      rows = filteredImportMonths.map(m => [
        `Tháng ${m.month}`,
        m.year,
        m.importedSamples,
        m.importedCartons,
        m.dispatchedSamples || 0,
        m.dispatchedPacks || 0,
        m.destroyedSamples,
        m.destroyedCartons,
        m.netCartons,
        `${m.destructionRate}%`,
        `"${m.pkgRangeStr}"`,
        m.destructionReports.join(' ; ')
      ]);
      filename = `Bao_cao_nhap_xuat_mau_${selectedYear}.csv`;
    } else {
      headers = ['Tháng SX bao (NSX)', 'Năm', 'Tổng mẫu', 'Tổng SL (cây)', 'Đang lưu kệ (mẫu)', 'Đang lưu kệ (cây)', 'Đóng thùng (mẫu)', 'Đóng thùng (cây)', 'Đã tiêu hủy (mẫu)', 'Đã tiêu hủy (cây)', 'Tuổi mẫu (tháng)', 'Tình trạng hạn'];
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
            <h2>
              {viewPerspective === 'import' 
                ? 'Thống Kê Lưu Chuyển Mẫu (Nhập - Lấy Mẫu - Tiêu Hủy)'
                : 'Thống Kê Số Lượng Mẫu Theo Ngày Sản Xuất Bao'}
            </h2>
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
              <span>Theo Tháng Nhập Kho</span>
            </button>
            <button
              className={`perspective-btn ${viewPerspective === 'packaging' ? 'active' : ''}`}
              onClick={() => { setViewPerspective('packaging'); setExpandedMonth(null); }}
              title="Xem số lượng mẫu phân bổ theo Ngày/Tháng sản xuất bao (NSX)"
            >
              <span>Theo Ngày SX Bao</span>
            </button>
          </div>

          {/* LỌC THỊ TRƯỜNG: NỘI ĐỊA vs XUẤT KHẨU */}
          <div className="analytics-segmented-control" title="Lọc theo phân loại thị trường">
            <button
              className={`segment-btn ${marketFilter === 'all' ? 'active' : ''}`}
              onClick={() => setMarketFilter('all')}
            >
              Tất cả thị trường
            </button>
            <button
              className={`segment-btn ${marketFilter === 'domestic' ? 'active' : ''}`}
              onClick={() => setMarketFilter('domestic')}
              style={{ color: marketFilter === 'domestic' ? '#10B981' : undefined }}
            >
              Nội địa
            </button>
            <button
              className={`segment-btn ${marketFilter === 'export' ? 'active' : ''}`}
              onClick={() => setMarketFilter('export')}
              style={{ color: marketFilter === 'export' ? '#8B5CF6' : undefined }}
            >
              Xuất khẩu
            </button>
          </div>

          {/* LỌC THEO NĂM (DẠNG DROPDOWN / ENUM LIST) */}
          <select
            className="analytics-select-control"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            title="Chọn năm thống kê"
          >
            <option value="all">Tất cả năm</option>
            {currentYearsList.map(yr => (
              <option key={yr} value={yr}>Năm {yr}</option>
            ))}
          </select>

          {/* NÚT XUẤT CSV */}
          <button className="analytics-export-btn" onClick={handleExportCsv} title="Tải file Excel / CSV">
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* ── 3 THẺ CHỈ SỐ KPI TỔNG KẾT THEO GÓC NHÌN ĐƯỢC CHỌN ── */}
      {viewPerspective === 'import' ? (
        /* KPI GÓC NHÌN NHẬP KHO, LẤY MẪU & TIÊU HỦY (PHÂN RÕ 2 LUỒNG) */
        <div className="analytics-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="analytics-kpi-card kpi-import">
            <div className="kpi-icon-wrap">
              <TrendingUp size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Tổng Mẫu Nhập Kho</span>
              <div className="kpi-number-row">
                <span className="kpi-number tabular">{importKpi.totalImportSamples.toLocaleString('vi-VN')}</span>
                <span className="kpi-unit">mẫu</span>
              </div>
              <span className="kpi-secondary-info tabular">
                Quy đổi: <strong>{importKpi.totalImportCartons.toLocaleString('vi-VN')} cây</strong> ({(importKpi.totalImportCartons * 10).toLocaleString('vi-VN')} bao)
              </span>
            </div>
          </div>

          <div className="analytics-kpi-card kpi-dispatch">
            <div className="kpi-icon-wrap">
              <ArrowRightLeft size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Mẫu Đã Lấy Sử Dụng (QC)</span>
              <div className="kpi-number-row">
                <span className="kpi-number tabular" style={{ color: '#8B5CF6' }}>
                  {importKpi.totalDispatchSamples.toLocaleString('vi-VN')}
                </span>
                <span className="kpi-unit">mẫu</span>
              </div>
              <span className="kpi-secondary-info tabular">
                Đã cấp: <strong>{importKpi.totalDispatchPacks.toLocaleString('vi-VN')} bao</strong> (~{importKpi.totalDispatchCartons} cây)
              </span>
            </div>
          </div>

          <div className="analytics-kpi-card kpi-destroy">
            <div className="kpi-icon-wrap">
              <TrendingDown size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Mẫu Tiêu Hủy Hết Hạn</span>
              <div className="kpi-number-row">
                <span className="kpi-number tabular">{importKpi.totalDestroySamples.toLocaleString('vi-VN')}</span>
                <span className="kpi-unit">mẫu</span>
              </div>
              <span className="kpi-secondary-info tabular">
                Đã hủy: <strong>{importKpi.totalDestroyCartons.toLocaleString('vi-VN')} cây</strong> ({(importKpi.totalDestroyCartons * 10).toLocaleString('vi-VN')} bao)
              </span>
            </div>
          </div>

          <div className="analytics-kpi-card kpi-net">
            <div className="kpi-icon-wrap">
              <Layers size={22} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Tồn Ròng Thực Tế</span>
              <div className="kpi-number-row">
                <span className={`kpi-number tabular ${importKpi.netCartons >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {importKpi.netCartons >= 0 ? `+${importKpi.netCartons.toLocaleString('vi-VN')}` : importKpi.netCartons.toLocaleString('vi-VN')}
                </span>
                <span className="kpi-unit">cây tồn</span>
              </div>
              <span className="kpi-secondary-info tabular">
                Tỷ lệ hủy: <strong style={{ color: 'var(--kraft-gold)' }}>{importKpi.rate}%</strong> · Đã dùng QC: <strong>{importKpi.totalDispatchSamples} mẫu</strong>
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
              <span className="kpi-label">Tổng Mẫu Theo Ngày SX Bao</span>
              <div className="kpi-number-row">
                <span className="kpi-number tabular">{packagingKpi.totalSamples.toLocaleString('vi-VN')}</span>
                <span className="kpi-unit">mẫu</span>
              </div>

            </div>
          </div>

          <div className="analytics-kpi-card kpi-pkg-status">
            <div className="kpi-icon-wrap">
              <Boxes size={22} />
            </div>
            <div className="kpi-data" style={{ width: '100%' }}>
              <span className="kpi-label">Vị Trí Lưu Trữ Hiện Tại</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>• Trên kệ:</span>
                  <span className="tabular">
                    <strong className="text-positive" style={{ fontSize: '13px' }}>{packagingKpi.storedCartons.toLocaleString('vi-VN')} cây</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>• Trong thùng:</span>
                  <span className="tabular">
                    <strong className="text-kraft" style={{ fontSize: '13px' }}>{packagingKpi.boxedCartons.toLocaleString('vi-VN')} cây</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>• Đã lấy mẫu:</span>
                  <span className="tabular">
                    <strong style={{ fontSize: '13px', color: '#8B5CF6' }}>{packagingKpi.dispatchedCartons.toLocaleString('vi-VN')} cây ({packagingKpi.dispatchedSamples} mẫu)</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>• Đã tiêu hủy:</span>
                  <span className="tabular">
                    <strong className="text-negative" style={{ fontSize: '13px' }}>{packagingKpi.destroyedCartons.toLocaleString('vi-VN')} cây</strong>
                  </span>
                </div>
              </div>
              <div style={{ marginTop: '5px', paddingTop: '4px', borderTop: '1px dashed var(--bento-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11.5px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Tổng đang lưu:</span>
                <span className="tabular" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  <strong style={{ color: 'var(--accent-blue)', fontSize: '13px' }}>{(packagingKpi.storedCartons + packagingKpi.boxedCartons).toLocaleString('vi-VN')} cây</strong>
                </span>
              </div>
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
                    <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>·</span>
                    <span className="kpi-number tabular text-warn">{packagingKpi.approachingCount}</span>
                    <span className="kpi-unit">sắp hạn 11T</span>
                  </>
                )}
              </div>
              <span className="kpi-secondary-info tabular">
                {packagingKpi.expiredCount > 0 ? (
                  <span style={{ color: 'var(--status-error)' }}>⚠️ Có {packagingKpi.expiredCount} mẫu quá hạn 12 tháng!</span>
                ) : (
                  <span style={{ color: 'var(--status-success)' }}>✓ Tất cả các mẫu đang lưu đều trong hạn 12 tháng</span>
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
                ? 'Biểu Đồ So Sánh Nhập Kho · Lấy Mẫu Sử Dụng · Tiêu Hủy'
                : 'Biểu Đồ Phân Bổ Số Lượng Mẫu Theo Ngày Sản Xuất Bao'}
            </h3>

          </div>

          {/* CHÚ THÍCH BIỂU ĐỒ (LEGEND) */}
          <div className="chart-legend">
            {viewPerspective === 'import' ? (
              <>
                <div className="legend-item">
                  <span className="legend-color-box bar-import-color" style={{ background: "linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)" }} />
                  <span>Nhập kho</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color-box bar-dispatch-color" style={{ background: "linear-gradient(180deg, #8B5CF6 0%, #6D28D9 100%)" }} />
                  <span>Lấy mẫu sử dụng (QC)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color-box bar-destroy-color" style={{ background: "linear-gradient(180deg, #EF4444 0%, #B91C1C 100%)" }} />
                  <span>Tiêu hủy</span>
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
                  <span className="legend-color-box bar-dispatch-color" style={{ background: "linear-gradient(180deg, #8B5CF6 0%, #6D28D9 100%)" }} />
                  <span>Đã lấy mẫu</span>
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
              {/* Gradient Nhập kho: Xanh tươi thương hiệu */}
              <linearGradient id="gradImport" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>
              {/* Gradient Lấy mẫu sử dụng (QC): Tím/Chàm công nghệ */}
              <linearGradient id="gradDispatch" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" />
                <stop offset="100%" stopColor="#6D28D9" />
              </linearGradient>
              {/* Gradient Tiêu hủy: Đỏ trầm sắc nét */}
              <linearGradient id="gradDestroy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="100%" stopColor="#B91C1C" />
              </linearGradient>
              {/* Gradient Đóng thùng: Vàng Kraft */}
              <linearGradient id="gradBoxed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#D97706" />
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
                    stroke="var(--bento-line)"
                    strokeDasharray={ratio === 0 ? 'none' : '3 3'}
                    strokeWidth={ratio === 0 ? 1.5 : 1}
                  />
                  <text
                    x={chartConfig.padLeft - 8}
                    y={yPos + 4}
                    fill="var(--text-secondary)"
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
              stroke="var(--bento-line)"
              strokeWidth="1.5"
            />

            {/* Render các cột theo góc nhìn */}
            {viewPerspective === 'import' ? (
              // Cột 3 thành phần: Nhập kho (Xanh) | Lấy sử dụng QC (Tím) | Tiêu hủy (Đỏ)
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
                    {/* Vùng highlight khi rê chuột */}
                    <rect
                      x={g.groupX + 2}
                      y={chartConfig.padTop}
                      width={g.groupWidth - 4}
                      height={chartConfig.plotHeight}
                      fill={isHovered ? 'var(--bg-subtle)' : 'transparent'}
                      rx="6"
                    />

                    {/* 1. Cột Nhập kho */}
                    {g.impHeight > 0 ? (
                      <>
                        <rect
                          x={g.impX}
                          y={g.impY}
                          width={g.barWidth}
                          height={g.impHeight}
                          fill="url(#gradImport)"
                          rx="4"
                          className="chart-bar"
                        />
                        <text
                          x={g.impX + g.barWidth / 2}
                          y={g.impY - 6}
                          fill="#2563EB"
                          fontSize="11"
                          fontWeight="700"
                          textAnchor="middle"
                          className="tabular"
                        >
                          {g.impVal.toLocaleString('vi-VN')}
                        </text>
                      </>
                    ) : (
                      <rect
                        x={g.impX}
                        y={chartConfig.padTop + chartConfig.plotHeight - 3}
                        width={g.barWidth}
                        height={3}
                        fill="var(--border-color)"
                        rx="1.5"
                      />
                    )}

                    {/* 2. Cột Lấy mẫu sử dụng (QC) */}
                    {g.dispHeight > 0 ? (
                      <>
                        <rect
                          x={g.dispX}
                          y={g.dispY}
                          width={g.barWidth}
                          height={g.dispHeight}
                          fill="url(#gradDispatch)"
                          rx="4"
                          className="chart-bar"
                        />
                        <text
                          x={g.dispX + g.barWidth / 2}
                          y={g.dispY - 6}
                          fill="#8B5CF6"
                          fontSize="11"
                          fontWeight="700"
                          textAnchor="middle"
                          className="tabular"
                        >
                          {g.dispVal.toLocaleString('vi-VN')}
                        </text>
                      </>
                    ) : (
                      <rect
                        x={g.dispX}
                        y={chartConfig.padTop + chartConfig.plotHeight - 3}
                        width={g.barWidth}
                        height={3}
                        fill="var(--border-color)"
                        rx="1.5"
                      />
                    )}

                    {/* 3. Cột Tiêu hủy */}
                    {g.destHeight > 0 ? (
                      <>
                        <rect
                          x={g.destX}
                          y={g.destY}
                          width={g.barWidth}
                          height={g.destHeight}
                          fill="url(#gradDestroy)"
                          rx="4"
                          className="chart-bar"
                        />
                        <text
                          x={g.destX + g.barWidth / 2}
                          y={g.destY - 6}
                          fill="#EF4444"
                          fontSize="11"
                          fontWeight="700"
                          textAnchor="middle"
                          className="tabular"
                        >
                          {g.destVal.toLocaleString('vi-VN')}
                        </text>
                      </>
                    ) : (
                      <rect
                        x={g.destX}
                        y={chartConfig.padTop + chartConfig.plotHeight - 3}
                        width={g.barWidth}
                        height={3}
                        fill="var(--border-color)"
                        rx="1.5"
                      />
                    )}

                    {/* Nhãn tháng trục hoành */}
                    <text
                      x={g.center}
                      y={chartConfig.padTop + chartConfig.plotHeight + 22}
                      fill={isHovered ? 'var(--accent-blue)' : 'var(--text-main)'}
                      fontSize="12"
                      fontWeight={isHovered ? '700' : '600'}
                      textAnchor="middle"
                      className="tabular"
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
                      fill={isHovered ? 'rgba(15, 135, 255, 0.08)' : 'transparent'}
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
                        rx={g.boxedH === 0 && g.dispatchedH === 0 && g.destroyedH === 0 ? 3 : 0}
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
                        rx={g.dispatchedH === 0 && g.destroyedH === 0 ? 3 : 0}
                        className="chart-bar"
                      />
                    )}

                    {/* Phân khúc 3: Đã lấy mẫu (tím) */}
                    {g.dispatchedH > 0 && (
                      <rect
                        x={g.barX}
                        y={g.dispatchedY}
                        width={g.barWidth}
                        height={g.dispatchedH}
                        fill="url(#gradDispatch)"
                        rx={g.destroyedH === 0 ? 3 : 0}
                        className="chart-bar"
                      />
                    )}

                    {/* Phân khúc 4: Đã tiêu hủy (đỏ đất) */}
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
                        fill="var(--text-primary)"
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
                      fill={isHovered ? 'var(--accent-blue)' : 'var(--text-secondary)'}
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
                  <div className="tooltip-row" style={{ color: '#3B82F6' }}>
                    <span>Lấy sử dụng (QC):</span>
                    <b>{hoveredData.dispatchedSamples || 0} mẫu ({hoveredData.dispatchedPacks || 0} bao)</b>
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
                  <div className="tooltip-row" style={{ color: 'var(--text-primary)' }}>
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
                  {hoveredData.dispatchedSamples > 0 && (
                    <div className="tooltip-row" style={{ color: '#8B5CF6' }}>
                      <span>Đã lấy mẫu:</span>
                      <b>{hoveredData.dispatchedSamples} mẫu ({hoveredData.dispatchedPacks} bao)</b>
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
              {viewPerspective === 'import' && (
                <span className="table-subtitle">
                  Phân rõ mẫu nhập kho, mẫu đã lấy sử dụng (cấp phát QC) và mẫu tiêu hủy theo chu kỳ
                </span>
              )}
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
                  <th style={{ width: '95px' }}>Kỳ / Tháng</th>
                  <th>Mẫu nhập</th>
                  <th>SL Nhập</th>
                  <th style={{ color: '#3B82F6' }}>Đã lấy QC</th>
                  <th style={{ color: '#3B82F6' }}>SL Lấy</th>
                  <th style={{ color: '#DC2626' }}>Mẫu hủy</th>
                  <th style={{ color: '#DC2626' }}>SL Hủy</th>
                  <th>Tồn ròng</th>
                  <th>Khoảng Ngày SX Bao</th>
                  <th style={{ textAlign: 'center' }}>Biên bản</th>
                  <th style={{ textAlign: 'right', width: '75px' }}>Chi tiết</th>
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
                          {(m.dispatchedSamples || 0) > 0 ? (
                            <span className="badge-dispatch-count">
                              {m.dispatchedSamples} mẫu
                            </span>
                          ) : (
                            <span className="badge-empty">—</span>
                          )}
                        </td>
                        <td className="tabular">
                          {(m.dispatchedPacks || 0) > 0 ? (
                            <>
                              <strong style={{ color: '#3B82F6' }}>{m.dispatchedPacks.toLocaleString('vi-VN')} bao</strong>
                              <span className="sub-unit">(~{m.dispatchedCartons} cây)</span>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
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
                              <strong style={{ color: 'var(--status-error)' }}>{m.destroyedCartons.toLocaleString('vi-VN')} cây</strong>
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
                        {/* CỘT MỚI: KHOẢNG NGÀY SX BAO */}
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
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
                            <span>{isExpanded ? 'Đóng' : 'Chi tiết'}</span>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="table-row-drawer">
                          <td colSpan={11}>
                            <div className="month-drawer-content">
                              <div className="drawer-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                  <h4>Danh sách mẫu nhập kho Tháng {m.month}/{m.year}</h4>
                                  <span className="drawer-count">{m.importedSampleList.length} mẫu ghi nhận</span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Lọc trạng thái:</span>
                                  <select 
                                    className="analytics-select-control" 
                                    style={{ padding: '4px 8px', fontSize: '12px' }}
                                    value={drawerStatusFilter}
                                    onChange={(e) => setDrawerStatusFilter(e.target.value)}
                                  >
                                    <option value="all">Tất cả ({m.importedSampleList.length})</option>
                                    <option value="stored">Đang lưu trữ ({m.importedSampleList.filter(s => s.status !== 'destroyed' && s.status !== 'dispatched' && (s.available_qty === undefined || s.available_qty === 10)).length})</option>
                                    <option value="dispatched">Đã lấy mẫu sử dụng ({m.importedSampleList.filter(s => s.status === 'dispatched' || ((s.available_qty !== undefined && s.available_qty < 10) && s.status !== 'destroyed')).length})</option>
                                    <option value="destroyed">Đã tiêu hủy ({m.importedSampleList.filter(s => s.status === 'destroyed').length})</option>
                                  </select>
                                </div>
                              </div>
                              <div className="drawer-samples-grid">
                                {m.importedSampleList
                                  .filter(s => {
                                    if (drawerStatusFilter === 'stored') return s.status !== 'destroyed' && s.status !== 'dispatched' && (s.available_qty === undefined || s.available_qty === 10);
                                    if (drawerStatusFilter === 'dispatched') return s.status === 'dispatched' || ((s.available_qty !== undefined && s.available_qty < 10) && s.status !== 'destroyed');
                                    if (drawerStatusFilter === 'destroyed') return s.status === 'destroyed';
                                    return true;
                                  })
                                  .map((s, sIdx) => {
                                  const prodName = s.products?.product_name || s.product_name || 'Mẫu thuốc lá';
                                  const locStr = s.shelf ? `Kệ ${['', 'A', 'B', 'C', 'D', 'E', 'F'][s.shelf] || s.shelf}${s.slot}` : (s.box_id ? 'Trong thùng' : 'Chưa xếp kệ');
                                  const isLost = s.note === 'Mẫu bị mất';
                                  const isDispatched = s.status === 'dispatched' || (s.available_qty !== undefined && s.available_qty < 10 && s.status !== 'destroyed');
                                  return (
                                    <div key={s.id || sIdx} className="drawer-sample-item">
                                      <div className="sample-main-name">
                                        {prodName}
                                        <span className={isSampleExport(s) ? 'tag-export' : 'tag-domestic'} style={{ marginLeft: '6px' }}>
                                          {isSampleExport(s) ? 'Xuất khẩu' : 'Nội địa'}
                                        </span>
                                      </div>
                                      <div className="sample-sub-meta">
                                        <span>Ngày SX bao: <strong style={{ color: 'var(--bento-kraft)' }}>{s.packaging_date || 'Chưa rõ'}</strong></span>
                                        <span>Vị trí: <strong>{locStr}</strong></span>
                                        <span>Tồn: <strong>{s.available_qty || 0} bao</strong></span>
                                        {s.status === 'destroyed' && <span className="tag-destroyed">Đã tiêu hủy</span>}
                                        {isLost ? (
                                          <span className="tag-dispatched" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                                            Đã lấy mẫu (Mục đích: Mẫu bị mất)
                                          </span>
                                        ) : (
                                          isDispatched && <span className="tag-dispatched">Đã lấy mẫu sử dụng ({10 - (s.available_qty || 0)} bao)</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
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
                  <th style={{ width: '110px' }}>Tháng SX (NSX)</th>
                  <th>Tổng Mẫu</th>
                  <th>Tổng SL</th>
                  <th>Lưu Trên Kệ</th>
                  <th>Đóng Thùng</th>
                  <th>Đã Lấy Mẫu</th>
                  <th>Đã Tiêu Hủy</th>
                  <th>Tuổi Mẫu</th>
                  <th>Tình Trạng Hạn 12T</th>
                  <th style={{ textAlign: 'right', width: '75px' }}>Chi tiết</th>
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

                        {/* Tổng số mẫu & Phân loại thị trường */}
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
                            <span style={{ color: 'var(--status-success)', fontWeight: '600' }}>
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

                        {/* Đã lấy mẫu */}
                        <td className="tabular">
                          {c.dispatchedSamples > 0 ? (
                            <span style={{ color: '#8B5CF6', fontWeight: '600' }}>
                              {c.dispatchedSamples} mẫu ({c.dispatchedPacks} bao)
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        {/* Đã hủy */}
                        <td className="tabular">
                          {c.destroyedSamples > 0 ? (
                            <span style={{ color: 'var(--status-error)', fontWeight: '600' }}>
                              {c.destroyedSamples} mẫu ({c.destroyedCartons} cây)
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        {/* Tuổi mẫu */}
                        <td className="tabular">
                          <span style={{ color: c.ageMonths >= 12 ? 'var(--status-error)' : c.ageMonths >= 11 ? 'var(--status-warning)' : 'var(--text-secondary)' }}>
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
                          <td colSpan={10}>
                            <div className="month-drawer-content">
                              <div className="drawer-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                  <h4>
                                    Danh sách mẫu có Ngày SX Bao {c.month ? `Tháng ${c.month}/${c.year}` : c.key}
                                  </h4>
                                  <span className="drawer-count">{c.sampleList.length} mẫu ghi nhận</span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Lọc trạng thái:</span>
                                  <select 
                                    className="analytics-select-control" 
                                    style={{ padding: '4px 8px', fontSize: '12px' }}
                                    value={drawerStatusFilter}
                                    onChange={(e) => setDrawerStatusFilter(e.target.value)}
                                  >
                                    <option value="all">Tất cả ({c.sampleList.length})</option>
                                    <option value="stored">Đang lưu trữ ({c.sampleList.filter(s => s.status !== 'destroyed' && s.status !== 'dispatched' && (s.available_qty === undefined || s.available_qty === 10)).length})</option>
                                    <option value="dispatched">Đã lấy mẫu sử dụng ({c.sampleList.filter(s => s.status === 'dispatched' || ((s.available_qty !== undefined && s.available_qty < 10) && s.status !== 'destroyed')).length})</option>
                                    <option value="destroyed">Đã tiêu hủy ({c.sampleList.filter(s => s.status === 'destroyed').length})</option>
                                  </select>
                                </div>
                              </div>
                              <div className="drawer-samples-grid">
                                {c.sampleList
                                  .filter(s => {
                                    if (drawerStatusFilter === 'stored') return s.status !== 'destroyed' && s.status !== 'dispatched' && (s.available_qty === undefined || s.available_qty === 10);
                                    if (drawerStatusFilter === 'dispatched') return s.status === 'dispatched' || ((s.available_qty !== undefined && s.available_qty < 10) && s.status !== 'destroyed');
                                    if (drawerStatusFilter === 'destroyed') return s.status === 'destroyed';
                                    return true;
                                  })
                                  .map((s, sIdx) => {
                                  const prodName = s.products?.product_name || s.product_name || 'Mẫu thuốc lá';
                                  const locStr = s.shelf 
                                    ? `Kệ ${['', 'A', 'B', 'C', 'D', 'E', 'F'][s.shelf] || s.shelf}${s.slot}` 
                                    : (s.box_id ? 'Trong thùng lưu trữ' : 'Chưa xếp kệ');
                                  const isLost = s.note === 'Mẫu bị mất';
                                  const isDispatched = s.status === 'dispatched' || (s.available_qty !== undefined && s.available_qty < 10 && s.status !== 'destroyed');

                                  return (
                                    <div key={s.id || sIdx} className="drawer-sample-item">
                                      <div className="sample-main-name">
                                        {prodName}
                                        <span className={isSampleExport(s) ? 'tag-export' : 'tag-domestic'} style={{ marginLeft: '6px' }}>
                                          {isSampleExport(s) ? 'Xuất khẩu' : 'Nội địa'}
                                        </span>
                                      </div>
                                      <div className="sample-sub-meta">
                                        <span>Ngày SX bao: <strong style={{ color: 'var(--bento-kraft)' }}>{s.packaging_date || 'Chưa rõ'}</strong></span>
                                        <span>Vị trí: <strong>{locStr}</strong></span>
                                        <span>Tồn: <strong>{s.available_qty || 0} bao</strong></span>
                                        {s.status === 'destroyed' && <span className="tag-destroyed">Đã tiêu hủy</span>}
                                        {isLost ? (
                                          <span className="tag-dispatched" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                                            Đã lấy mẫu (Mục đích: Mẫu bị mất)
                                          </span>
                                        ) : (
                                          isDispatched && <span className="tag-dispatched">Đã lấy mẫu sử dụng ({10 - (s.available_qty || 0)} bao)</span>
                                        )}
                                        {s.status === 'boxed' && <span className="tag-boxed">Trong thùng</span>}
                                      </div>
                                    </div>
                                  );
                                })}
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
