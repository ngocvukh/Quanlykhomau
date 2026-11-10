import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera, CameraOff, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw,
  Search, Volume2, VolumeX, Printer, Check, X, ArrowRight,
  Warehouse, Layers, QrCode, Sliders, ShieldAlert, FileText, ChevronRight,
  Radio, Smartphone, Monitor, ZoomIn
} from '../GoogleIcons';
import { supabase } from '../supabaseClient';

const SHELF_LETTERS = ['', 'A', 'B', 'C', 'D', 'E', 'F'];

// ── Web Audio Beep & Haptic Feedback ──
const playScanBeep = (type = 'success') => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'misplaced') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'duplicate') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    }
  } catch (e) {
    // Audio context not allowed or blocked
  }
};

const triggerHaptic = (ms = 50) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) {}
  }
};

// ── Trích xuất mã SKU từ nội dung QR (chuỗi URL hoặc SKU thuần) ──
const extractSkuFromQr = (text) => {
  if (!text) return '';
  const trimmed = String(text).trim();
  try {
    if (trimmed.includes('?scan=') || trimmed.includes('&scan=')) {
      const url = new URL(trimmed, window.location.origin);
      const sku = url.searchParams.get('scan');
      if (sku) return decodeURIComponent(sku).trim();
    }
  } catch (e) {
    const match = trimmed.match(/[?&]scan=([^&#]+)/);
    if (match) return decodeURIComponent(match[1]).trim();
  }
  return trimmed;
};

export default function WarehouseAudit({
  samples = [],
  boxes = [],
  products = [],
  formatLocation,
  formatBlendBatch,
  showToast,
  profile,
  fetchDatabaseData,
  onClose
}) {
  // ── State ──
  const [selectedScope, setSelectedScope] = useState('1'); // 'all' | '1'..'6' (Kệ A..F) | 'box'
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [zoomSupported, setZoomSupported] = useState(true);
  const [syncStatus, setSyncStatus] = useState('connected'); // 'connected' | 'syncing' | 'error'

  // Scanned Map: { [sku]: { sample, scannedAt, matchType: 'matched'|'misplaced'|'unknown', detectedText } }
  const [scannedMap, setScannedMap] = useState({});
  const [lastScannedResult, setLastScannedResult] = useState(null); // { type, sample, sku, time }
  const [manualSkuInput, setManualSkuInput] = useState('');
  const [filterView, setFilterView] = useState('missing'); // 'all' | 'missing' | 'misplaced' | 'matched'

  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const lastScanTimeRef = useRef({});
  const syncTimeoutRef = useRef(null);

  // ── Danh sách cây nguyên cần kiểm kê: BỎ QUA HOÀN TOÀN Ô 5 LẺ ──
  const expectedSamples = useMemo(() => {
    if (selectedScope === 'all') {
      return samples.filter(s => s.status === 'stored' && s.shelf && s.slot && s.slot !== 5);
    }
    if (selectedScope === 'box') {
      return samples.filter(s => s.status === 'stored' && s.box_id);
    }
    const shelfNum = parseInt(selectedScope, 10);
    return samples.filter(s => s.status === 'stored' && s.shelf === shelfNum && s.slot && s.slot !== 5);
  }, [samples, selectedScope]);

  // ── ĐỒNG BỘ REALTIME GIỮA ĐIỆN THOẠI & MÁY TÍNH QUA SUPABASE ──
  useEffect(() => {
    let isMounted = true;

    // 1. Tải tiến trình kiểm kê mới nhất từ Supabase khi mở tab
    const fetchLatestAuditSession = async () => {
      try {
        const { data, error } = await supabase
          .from('bulk_import_drafts')
          .select('rows_data')
          .eq('id', 'global-warehouse-audit')
          .maybeSingle();

        if (error) {
          console.warn("Lỗi tải tiến trình kiểm kê:", error);
          return;
        }

        if (isMounted && data?.rows_data) {
          const session = data.rows_data;
          if (session.scannedMap) {
            setScannedMap(session.scannedMap);
          }
          if (session.selectedScope) {
            setSelectedScope(session.selectedScope);
          }
          if (session.lastScannedResult) {
            setLastScannedResult(session.lastScannedResult);
          }
        }
      } catch (err) {
        console.error("Lỗi kết nối kiểm kê:", err);
      }
    };

    fetchLatestAuditSession();

    // 2. Đăng ký Realtime Channel để nhận dữ liệu ngay khi Điện thoại quét
    const channel = supabase
      .channel('warehouse-audit-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bulk_import_drafts',
          filter: 'id=eq.global-warehouse-audit'
        },
        (payload) => {
          if (!isMounted) return;
          const session = payload.new?.rows_data;
          if (session) {
            if (session.scannedMap !== undefined) {
              setScannedMap(session.scannedMap);
            }
            if (session.selectedScope) {
              setSelectedScope(session.selectedScope);
            }
            if (session.lastScannedResult !== undefined) {
              setLastScannedResult(session.lastScannedResult);
            }
            setSyncStatus('connected');
          }
        }
      )
      .subscribe((status) => {
        if (isMounted) {
          setSyncStatus(status === 'SUBSCRIBED' ? 'connected' : 'syncing');
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Hàm đẩy dữ liệu kiểm kê lên Supabase để máy tính và các thiết bị khác nhận được tức thì
  const syncAuditToSupabase = async (newMap, newScope, newResult) => {
    setSyncStatus('syncing');
    try {
      await supabase.from('bulk_import_drafts').upsert({
        id: 'global-warehouse-audit',
        rows_data: {
          scannedMap: newMap,
          selectedScope: newScope,
          lastScannedResult: newResult,
          updatedAt: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      });
      setSyncStatus('connected');
    } catch (e) {
      console.error("Lỗi đồng bộ kiểm kê lên Supabase:", e);
      setSyncStatus('error');
    }
  };

  // Nhóm danh sách đối soát
  const { matchedItems, missingItems, misplacedItems, unknownItems } = useMemo(() => {
    const expectedSkuMap = new Map();
    expectedSamples.forEach(s => expectedSkuMap.set(s.sku, s));

    const matched = [];
    const misplaced = [];
    const unknown = [];

    Object.entries(scannedMap).forEach(([sku, info]) => {
      if (expectedSkuMap.has(sku)) {
        matched.push({ ...expectedSkuMap.get(sku), ...info });
      } else {
        const inAnyShelf = samples.find(s => s.sku === sku);
        if (inAnyShelf) {
          misplaced.push({ ...inAnyShelf, ...info, matchType: 'misplaced' });
        } else {
          unknown.push({ sku, ...info, matchType: 'unknown' });
        }
      }
    });

    const scannedSkus = new Set(Object.keys(scannedMap));
    const missing = expectedSamples.filter(s => !scannedSkus.has(s.sku));

    return {
      matchedItems: matched,
      missingItems: missing,
      misplacedItems: misplaced,
      unknownItems: unknown
    };
  }, [expectedSamples, scannedMap, samples]);

  // Khởi tạo danh sách camera thiết bị
  useEffect(() => {
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        setCameras(devices);
        const backCam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
        setActiveCameraId(backCam.id);
      }
    }).catch(err => {
      console.warn("Không tìm thấy camera hoặc chưa cấp quyền:", err);
    });
  }, []);

  // Xử lý khi nhận diện được 1 mã QR
  const handleQrScanned = (decodedText) => {
    const sku = extractSkuFromQr(decodedText);
    if (!sku) return;

    const now = Date.now();
    if (lastScanTimeRef.current[sku] && (now - lastScanTimeRef.current[sku] < 1500)) {
      return;
    }
    lastScanTimeRef.current[sku] = now;

    if (scannedMap[sku]) {
      if (isSoundEnabled) playScanBeep('duplicate');
      const dupResult = {
        type: 'duplicate',
        sku,
        sample: scannedMap[sku].sample,
        time: new Date()
      };
      setLastScannedResult(dupResult);
      return;
    }

    const targetSample = expectedSamples.find(s => s.sku === sku);
    if (targetSample) {
      if (isSoundEnabled) playScanBeep('success');
      triggerHaptic(50);
      const newMap = {
        ...scannedMap,
        [sku]: { sample: targetSample, scannedAt: new Date().toISOString(), matchType: 'matched' }
      };
      const newResult = {
        type: 'matched',
        sku,
        sample: targetSample,
        time: new Date().toISOString()
      };
      setScannedMap(newMap);
      setLastScannedResult(newResult);
      syncAuditToSupabase(newMap, selectedScope, newResult);
      showToast(`🟢 Khớp: ${targetSample.products?.product_name || targetSample.product_name}`, 'success');
      return;
    }

    const anySample = samples.find(s => s.sku === sku);
    if (anySample) {
      if (isSoundEnabled) playScanBeep('misplaced');
      triggerHaptic(150);
      const newMap = {
        ...scannedMap,
        [sku]: { sample: anySample, scannedAt: new Date().toISOString(), matchType: 'misplaced' }
      };
      const newResult = {
        type: 'misplaced',
        sku,
        sample: anySample,
        time: new Date().toISOString()
      };
      setScannedMap(newMap);
      setLastScannedResult(newResult);
      syncAuditToSupabase(newMap, selectedScope, newResult);
      const loc = anySample.shelf ? formatLocation(anySample.shelf, anySample.slot, anySample.column_number) : (anySample.box_id ? `Thùng ${anySample.box_id}` : 'Chưa có vị trí');
      showToast(`🟡 Sai vị trí: Cây này ghi nhận ở ${loc}`, 'warning');
      return;
    }

    if (isSoundEnabled) playScanBeep('misplaced');
    triggerHaptic(200);
    const newMap = {
      ...scannedMap,
      [sku]: { sample: null, scannedAt: new Date().toISOString(), matchType: 'unknown' }
    };
    const newResult = {
      type: 'unknown',
      sku,
      sample: null,
      time: new Date().toISOString()
    };
    setScannedMap(newMap);
    setLastScannedResult(newResult);
    syncAuditToSupabase(newMap, selectedScope, newResult);
    showToast(`⚠️ Không tìm thấy SKU [${sku}] trên hệ thống!`, 'error');
  };

  // Khởi động Camera Quét liên tục
  const startCameraScanner = async (camId = activeCameraId) => {
    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
          html5QrCodeRef.current.clear();
        } catch (e) {}
      }

      const html5QrCode = new Html5Qrcode("reader-audit-camera");
      html5QrCodeRef.current = html5QrCode;

      const cameraConfig = camId ? { deviceId: { exact: camId } } : { facingMode: "environment" };

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrEdge = Math.floor(minEdge * 0.72);
            return { width: qrEdge, height: qrEdge };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleQrScanned(decodedText);
        },
        () => {}
      );

      setIsScanning(true);
      setCurrentZoom(1);

      try {
        const caps = html5QrCode.getRunningTrackCapabilities();
        setTorchSupported(!!(caps && caps.torch));
      } catch (e) {
        setTorchSupported(false);
      }
    } catch (err) {
      console.error("Lỗi khởi động camera:", err);
      showToast("Không thể mở camera. Hãy kiểm tra quyền truy cập camera của trình duyệt!", "error");
      setIsScanning(false);
    }
  };

  // Dừng Camera
  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn("Lỗi khi dừng camera:", err);
      }
      html5QrCodeRef.current = null;
    }
    setIsScanning(false);
    setIsTorchOn(false);
    setCurrentZoom(1);
    try {
      const videoEl = document.querySelector('#reader-audit-camera video');
      if (videoEl) videoEl.style.transform = 'none';
    } catch (e) {}
  };

  // Áp dụng mức Zoom Camera (Hỗ trợ cả Hardware Zoom và Fallback phóng to CSS)
  const handleApplyZoom = async (zoomLevel) => {
    const targetZoom = Number(zoomLevel);
    setCurrentZoom(targetZoom);

    // 1. Cố gắng áp dụng Zoom phần cứng trên cảm biến camera
    if (html5QrCodeRef.current) {
      try {
        const camCaps = html5QrCodeRef.current.getRunningTrackCameraCapabilities?.();
        const zf = camCaps?.zoomFeature?.();
        if (zf && zf.isSupported()) {
          await zf.apply(targetZoom);
        } else {
          await html5QrCodeRef.current.applyVideoConstraints({
            advanced: [{ zoom: targetZoom }]
          });
        }
      } catch (err) {
        console.warn("Hardware zoom warning, using CSS magnification:", err);
      }
    }

    // 2. CSS Scale phóng to trực tiếp trên thẻ video (giúp quét nhạy và phóng to trên mọi thiết bị)
    try {
      const videoEl = document.querySelector('#reader-audit-camera video');
      if (videoEl) {
        videoEl.style.transform = `scale(${targetZoom})`;
        videoEl.style.transformOrigin = 'center center';
        videoEl.style.transition = 'transform 0.2s ease-out';
      }
    } catch (e) {}
  };

  // Dọn dẹp khi unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {}).finally(() => {
          try { html5QrCodeRef.current.clear(); } catch(e) {}
        });
      }
    };
  }, []);

  // Đổi Camera
  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamId = cameras[nextIndex].id;
    setActiveCameraId(nextCamId);
    if (isScanning) {
      await stopCameraScanner();
      await startCameraScanner(nextCamId);
    }
  };

  // Bật / tắt đèn Flash
  const handleToggleTorch = async () => {
    if (!html5QrCodeRef.current || !torchSupported) return;
    try {
      const nextState = !isTorchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }]
      });
      setIsTorchOn(nextState);
    } catch (e) {
      showToast("Thiết bị không hỗ trợ bật đèn Flash", "info");
    }
  };

  // Điểm danh 1 chạm cho mẫu có tem bị mờ/trầy
  const handleManualVerifyItem = (item) => {
    if (!item || !item.sku) return;
    if (isSoundEnabled) playScanBeep('success');
    triggerHaptic(50);
    const newMap = {
      ...scannedMap,
      [item.sku]: { sample: item, scannedAt: new Date().toISOString(), matchType: 'matched', manualConfirmed: true }
    };
    const newResult = {
      type: 'matched',
      sku: item.sku,
      sample: item,
      time: new Date().toISOString(),
      manualConfirmed: true
    };
    setScannedMap(newMap);
    setLastScannedResult(newResult);
    syncAuditToSupabase(newMap, selectedScope, newResult);
    showToast(`🟢 Đã xác nhận: ${item.products?.product_name || item.product_name}`, 'success');
  };

  // Hủy xác nhận một mẫu (nếu bấm nhầm)
  const handleUnmatchItem = (sku) => {
    if (!sku || !scannedMap[sku]) return;
    const newMap = { ...scannedMap };
    delete newMap[sku];
    setScannedMap(newMap);
    syncAuditToSupabase(newMap, selectedScope, null);
    showToast(`Đã hủy xác nhận mẫu [${sku}]`, 'info');
  };

  // Nhập mã thủ công khi tem mờ
  const handleManualSubmit = (e) => {
    e.preventDefault();
    const query = manualSkuInput.trim();
    if (!query) return;
    const found = samples.find(s => 
      s.sku?.toLowerCase() === query.toLowerCase() ||
      s.sku?.toLowerCase().endsWith(query.toLowerCase())
    );
    if (found) {
      handleQrScanned(found.sku);
    } else {
      handleQrScanned(query);
    }
    setManualSkuInput('');
  };

  // Làm mới đợt kiểm kê (Đồng bộ xóa sạch trên cả ĐT và Máy tính)
  const handleResetAudit = async () => {
    if (Object.keys(scannedMap).length === 0) return;
    if (!window.confirm("Bắt đầu lại đợt kiểm kê mới? Toàn bộ danh sách đã quét sẽ được làm mới trên cả điện thoại và máy tính.")) return;
    setScannedMap({});
    setLastScannedResult(null);
    lastScanTimeRef.current = {};
    await syncAuditToSupabase({}, selectedScope, null);
    showToast("Đã làm mới đợt kiểm kê trên toàn hệ thống!", "info");
  };

  // Chuyển cây bị để sai vị trí về Kệ hiện tại
  const handleRelocateToCurrentShelf = async (sample) => {
    if (selectedScope === 'all' || selectedScope === 'box') {
      showToast("Vui lòng chọn Kệ cụ thể (Kệ A-F) để cập nhật vị trí cho mẫu này!", "warning");
      return;
    }
    const targetShelf = parseInt(selectedScope, 10);
    const targetShelfLetter = SHELF_LETTERS[targetShelf];
    if (!window.confirm(`Xác nhận chuyển mẫu "${sample.products?.product_name || sample.product_name}" sang Kệ ${targetShelfLetter}?`)) return;

    try {
      const { error } = await supabase
        .from('samples')
        .update({
          shelf: targetShelf,
          updated_at: new Date().toISOString()
        })
        .eq('id', sample.id);

      if (error) throw error;
      showToast(`Đã chuyển mẫu về Kệ ${targetShelfLetter} thành công!`, 'success');
      if (fetchDatabaseData) fetchDatabaseData();
    } catch (e) {
      showToast('Lỗi khi cập nhật vị trí: ' + e.message, 'error');
    }
  };

  const handlePrintAuditReport = () => {
    window.print();
  };

  const scopeLabel = selectedScope === 'all'
    ? 'Toàn bộ kho (Kệ A đến F — Ô 1-4)'
    : selectedScope === 'box'
      ? 'Khu vực Thùng lưu trữ'
      : `Kệ ${SHELF_LETTERS[selectedScope]} (Các ô 1, 2, 3, 4 — Cây nguyên)`;

  const progressPercent = expectedSamples.length > 0
    ? Math.round((matchedItems.length / expectedSamples.length) * 100)
    : 0;

  return (
    <div className="warehouse-audit-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── HEADER & TIÊU ĐỀ ── */}
      <div className="glass-panel" style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--status-success)', padding: '8px', borderRadius: '10px' }}>
              <Camera size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
                  Kiểm Kê Kho Bằng QR Camera
                </h2>
                <span style={{ fontSize: '11px', background: 'rgba(16,185,129,0.2)', color: 'var(--status-success)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  Chống Thất Thoát
                </span>
                {/* Trạng thái đồng bộ Realtime giữa ĐT & PC */}
                <span
                  style={{
                    fontSize: '11px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: syncStatus === 'connected' ? 'rgba(56,189,248,0.15)' : 'rgba(245,158,11,0.15)',
                    color: syncStatus === 'connected' ? 'var(--accent-blue)' : 'var(--status-warning)',
                    fontWeight: 600
                  }}
                  title="Dữ liệu quét từ điện thoại tự động đồng bộ sang máy tính theo thời gian thực"
                >
                  <Radio size={11} className={syncStatus === 'syncing' ? 'spin' : ''} />
                  {syncStatus === 'connected' ? 'Đồng bộ Realtime (ĐT ⇄ PC)' : 'Đang đồng bộ...'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Quét lia liên tục mã QR trên cây thuốc nguyên. <strong style={{ color: 'var(--status-warning)' }}>Tự động bỏ qua Ô 5 lẻ</strong>.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleResetAudit}
            disabled={Object.keys(scannedMap).length === 0}
            style={{ fontSize: '13px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Làm mới lại danh sách quét trên cả điện thoại và máy tính"
          >
            <RefreshCw size={14} /> Bắt đầu lại
          </button>
          <button
            className="btn btn-secondary"
            onClick={handlePrintAuditReport}
            style={{ fontSize: '13px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
          >
            <Printer size={14} /> In Biên Bản
          </button>
          {onClose && (
            <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: '13px', padding: '7px 12px' }}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── BƯỚC 1: CHỌN PHẠM VI KIỂM KÊ (KỆ A-F HOẶC TOÀN KHO) ── */}
      <div className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
            <Warehouse size={16} color="var(--accent-blue)" />
            Chọn Kệ cần kiểm kê:
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Hệ thống: <strong style={{ color: 'var(--accent-blue)' }}>{expectedSamples.length} cây nguyên</strong> đang lưu kho
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: '1', label: 'Kệ A' },
            { id: '2', label: 'Kệ B' },
            { id: '3', label: 'Kệ C' },
            { id: '4', label: 'Kệ D' },
            { id: '5', label: 'Kệ E' },
            { id: '6', label: 'Kệ F' },
            { id: 'all', label: 'Toàn bộ Kệ (A-F)' },
            { id: 'box', label: 'Thùng mẫu lưu' }
          ].map(tab => {
            const isSelected = selectedScope === tab.id;
            const countInTab = tab.id === 'all'
              ? samples.filter(s => s.status === 'stored' && s.shelf && s.slot && s.slot !== 5).length
              : tab.id === 'box'
                ? samples.filter(s => s.status === 'stored' && s.box_id).length
                : samples.filter(s => s.status === 'stored' && s.shelf === parseInt(tab.id, 10) && s.slot && s.slot !== 5).length;

            return (
              <button
                key={tab.id}
                type="button"
                className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  padding: '7px 14px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isSelected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.03)',
                  borderColor: isSelected ? 'var(--accent-blue)' : 'var(--glass-border)'
                }}
                onClick={() => {
                  if (isSelected) return;
                  if (Object.keys(scannedMap).length > 0) {
                    if (!window.confirm("Đổi phạm vi Kệ sẽ làm mới kết quả quét hiện tại. Bạn có chắc chắn?")) return;
                    setScannedMap({});
                    setLastScannedResult(null);
                    syncAuditToSupabase({}, tab.id, null);
                  }
                  setSelectedScope(tab.id);
                  syncAuditToSupabase(scannedMap, tab.id, lastScannedResult);
                }}
              >
                <strong>{tab.label}</strong>
                <span style={{ fontSize: '11px', background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '10px' }}>
                  {countInTab}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── BẢNG ĐIỀU KHIỂN & KHUNG CAMERA QUÉT LIÊN TỤC ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* KHUNG QUÉT CAMERA */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <strong style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <QrCode size={18} color="var(--accent-blue)" /> Camera Quét Tem QR
            </strong>

            {/* Công cụ hỗ trợ camera */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {torchSupported && isScanning && (
                <button
                  className="btn btn-secondary"
                  style={{ padding: '5px 10px', fontSize: '12px', background: isTorchOn ? 'rgba(245,158,11,0.2)' : '' }}
                  onClick={handleToggleTorch}
                  title="Bật/Tắt đèn Flash trợ sáng"
                >
                  🔦 {isTorchOn ? 'Tắt đèn' : 'Bật đèn'}
                </button>
              )}
              {cameras.length > 1 && (
                <button
                  className="btn btn-secondary"
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                  onClick={handleSwitchCamera}
                  title="Đổi camera trước/sau"
                >
                  <RefreshCw size={13} /> Đổi cam
                </button>
              )}
              <button
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: '12px', color: isSoundEnabled ? 'var(--status-success)' : 'var(--text-muted)' }}
                onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                title={isSoundEnabled ? 'Đang bật âm thanh bíp' : 'Đang tắt âm thanh'}
              >
                {isSoundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            </div>
          </div>

          {/* VÙNG CAMERA HTML5-QRCODE */}
          <div
            style={{
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
              background: 'var(--bg-primary)',
              border: '2px solid rgba(255,255,255,0.08)',
              minHeight: '280px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <div id="reader-audit-camera" style={{ width: '100%', height: '100%' }}></div>

            {!isScanning && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CameraOff size={32} style={{ opacity: 0.4 }} />
                </div>
                <div>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Camera đang tắt</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
                    Nếu bạn đang mở máy tính, bạn có thể cầm điện thoại đi quét, dữ liệu sẽ tự động nhảy số lên máy tính theo thời gian thực!
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => startCameraScanner()}
                  style={{
                    padding: '10px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: 'var(--accent-gradient)',
                    borderColor: 'var(--accent-blue)',
                    boxShadow: '0 4px 14px rgba(15, 135, 255, 0.35)',
                    marginTop: '8px'
                  }}
                >
                  <Camera size={16} /> Bật camera trên máy này
                </button>
              </div>
            )}

            {isScanning && (
              <>
                {/* THANH ZOOM CAMERA TIỆN LỢI */}
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(10px)',
                    padding: '4px 10px',
                    borderRadius: '24px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.5)'
                  }}
                >
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginRight: '4px' }}>
                    <ZoomIn size={13} color="var(--accent-blue)" /> Zoom:
                  </span>
                  {[1, 1.5, 2, 2.5, 3].map(z => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => handleApplyZoom(z)}
                      style={{
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 9px',
                        borderRadius: '14px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        transition: 'all 0.15s ease',
                        background: currentZoom === z ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.12)',
                        color: currentZoom === z ? '#ffffff' : 'var(--text-secondary)',
                        boxShadow: currentZoom === z ? '0 0 10px rgba(15, 135, 255, 0.6)' : 'none'
                      }}
                    >
                      {z}x
                    </button>
                  ))}
                </div>

                {/* NÚT TẠM DỪNG CAMERA */}
                <div style={{ position: 'absolute', bottom: '12px', zIndex: 10 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={stopCameraScanner}
                    style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)', padding: '6px 16px', fontSize: '12.5px' }}
                  >
                    <CameraOff size={14} /> Tạm dừng camera
                  </button>
                </div>
              </>
            )}
          </div>

          {/* BANNER THÔNG BÁO MẪU VỪA QUÉT */}
          {lastScannedResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                animation: 'fadeIn 0.25s ease',
                background: lastScannedResult.type === 'matched'
                  ? 'rgba(16,185,129,0.12)'
                  : lastScannedResult.type === 'misplaced'
                    ? 'rgba(245,158,11,0.15)'
                    : 'rgba(255,255,255,0.05)',
                border: `1px solid ${
                  lastScannedResult.type === 'matched'
                    ? 'rgba(16,185,129,0.3)'
                    : lastScannedResult.type === 'misplaced'
                      ? 'rgba(245,158,11,0.35)'
                      : 'rgba(255,255,255,0.1)'
                }`
              }}
            >
              <div style={{ fontSize: '18px' }}>
                {lastScannedResult.type === 'matched' ? '🟢' : lastScannedResult.type === 'misplaced' ? '🟡' : '⚪'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {lastScannedResult.sample?.products?.product_name || lastScannedResult.sample?.product_name || `Mã: ${lastScannedResult.sku}`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {lastScannedResult.type === 'matched' && `Đã khớp — Vị trí: ${formatLocation(lastScannedResult.sample.shelf, lastScannedResult.sample.slot, lastScannedResult.sample.column_number)}`}
                  {lastScannedResult.type === 'misplaced' && `Để nhầm kệ! Hệ thống lưu: ${lastScannedResult.sample.shelf ? formatLocation(lastScannedResult.sample.shelf, lastScannedResult.sample.slot, lastScannedResult.sample.column_number) : 'Thùng'}`}
                  {lastScannedResult.type === 'duplicate' && `Mẫu này đã được quét trước đó.`}
                </div>
              </div>
            </div>
          )}

          {/* NHẬP MÃ THỦ CÔNG KHI TEM MỜ */}
          <div style={{ marginTop: '4px' }}>
            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Nhập 3-4 số cuối SKU hoặc toàn bộ mã..."
                value={manualSkuInput}
                onChange={e => setManualSkuInput(e.target.value)}
                style={{ fontSize: '13px', padding: '8px 12px' }}
              />
              <button type="submit" className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                Tìm / Khớp
              </button>
            </form>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '5px' }}>
              💡 <em>Mẹo: Có thể gõ 3 số cuối SKU hoặc bấm <strong>"Xác nhận đã thấy"</strong> ngay dưới danh sách nếu tem quá mờ.</em>
            </div>
          </div>
        </div>

        {/* THỐNG KÊ TIẾN ĐỘ & BÁO CÁO NHANH */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Tiến độ kiểm kê ({scopeLabel})
                </span>
                <div style={{ fontSize: '26px', fontWeight: 800, color: progressPercent === 100 ? 'var(--status-success)' : 'var(--text-primary)', marginTop: '2px' }}>
                  {matchedItems.length} <span style={{ fontSize: '16px', fontWeight: 400, color: 'var(--text-muted)' }}>/ {expectedSamples.length} cây</span>
                </div>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: progressPercent === 100 ? 'var(--status-success)' : 'var(--accent-blue)' }}>
                {progressPercent}%
              </div>
            </div>

            {/* Thanh tiến độ */}
            <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: progressPercent === 100
                    ? 'linear-gradient(90deg, #059669, #047857)'
                    : 'var(--accent-gradient)',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>

          {/* 4 THẺ CHỈ SỐ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {/* Thẻ 1: Khớp đủ */}
            <div
              onClick={() => setFilterView('matched')}
              style={{
                background: filterView === 'matched' ? 'rgba(5,150,105,0.2)' : 'rgba(5,150,105,0.08)',
                border: `1px solid ${filterView === 'matched' ? 'var(--status-success)' : 'rgba(5,150,105,0.2)'}`,
                padding: '12px 14px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} /> Đã quét đủ
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px', color: 'var(--status-success)' }}>
                {matchedItems.length} <span style={{ fontSize: '12px', fontWeight: 400 }}>cây</span>
              </div>
            </div>

            {/* Thẻ 2: Nghi ngờ thiếu / Thất thoát */}
            <div
              onClick={() => setFilterView('missing')}
              style={{
                background: filterView === 'missing' ? 'rgba(220,38,38,0.2)' : 'rgba(220,38,38,0.08)',
                border: `1px solid ${filterView === 'missing' ? 'var(--status-error)' : 'rgba(220,38,38,0.2)'}`,
                padding: '12px 14px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--status-error)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={14} /> Chưa quét / Thiếu
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px', color: 'var(--status-error)' }}>
                {missingItems.length} <span style={{ fontSize: '12px', fontWeight: 400 }}>cây</span>
              </div>
            </div>

            {/* Thẻ 3: Sai vị trí */}
            <div
              onClick={() => setFilterView('misplaced')}
              style={{
                background: filterView === 'misplaced' ? 'rgba(217,119,6,0.2)' : 'rgba(217,119,6,0.08)',
                border: `1px solid ${filterView === 'misplaced' ? 'var(--status-warning)' : 'rgba(217,119,6,0.2)'}`,
                padding: '12px 14px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--status-warning)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={14} /> Để sai kệ
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px', color: 'var(--status-warning)' }}>
                {misplacedItems.length} <span style={{ fontSize: '12px', fontWeight: 400 }}>cây</span>
              </div>
            </div>

            {/* Thẻ 4: Tổng cần kiểm tra */}
            <div
              onClick={() => setFilterView('all')}
              style={{
                background: filterView === 'all' ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${filterView === 'all' ? 'var(--accent-blue)' : 'var(--glass-border)'}`,
                padding: '12px 14px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Layers size={14} /> Tổng cây nguyên
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px', color: 'var(--text-primary)' }}>
                {expectedSamples.length} <span style={{ fontSize: '12px', fontWeight: 400 }}>cây</span>
              </div>
            </div>
          </div>

          {/* GHI CHÚ QUY ƯỚC */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--glass-border)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            💡 <strong>Quy ước kiểm kê:</strong> Chỉ kiểm tra cây nguyên tại các Ô 1, 2, 3, 4. Các cây thuốc đã bóc dở nằm tại Ô 5 được tự động bỏ qua.
          </div>
        </div>
      </div>

      {/* ── BƯỚC 3: DANH SÁCH CHI TIẾT ĐỐI SOÁT & THẤT THOÁT ── */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        
        {/* Bộ lọc xem danh sách */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              className={`btn ${filterView === 'missing' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                fontSize: '12.5px',
                padding: '6px 12px',
                background: filterView === 'missing' ? 'rgba(220,38,38,0.25)' : '',
                borderColor: filterView === 'missing' ? 'var(--status-error)' : '',
                color: filterView === 'missing' ? 'var(--status-error)' : ''
              }}
              onClick={() => setFilterView('missing')}
            >
              🔴 Chưa quét / Nghi ngờ thiếu ({missingItems.length})
            </button>
            <button
              className={`btn ${filterView === 'misplaced' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                fontSize: '12.5px',
                padding: '6px 12px',
                background: filterView === 'misplaced' ? 'rgba(217,119,6,0.25)' : '',
                borderColor: filterView === 'misplaced' ? 'var(--status-warning)' : '',
                color: filterView === 'misplaced' ? 'var(--status-warning)' : ''
              }}
              onClick={() => setFilterView('misplaced')}
            >
              🟡 Để sai kệ ({misplacedItems.length})
            </button>
            <button
              className={`btn ${filterView === 'matched' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                fontSize: '12.5px',
                padding: '6px 12px',
                background: filterView === 'matched' ? 'rgba(5,150,105,0.25)' : '',
                borderColor: filterView === 'matched' ? 'var(--status-success)' : '',
                color: filterView === 'matched' ? 'var(--status-success)' : ''
              }}
              onClick={() => setFilterView('matched')}
            >
              🟢 Đã quét đủ ({matchedItems.length})
            </button>
            <button
              className={`btn ${filterView === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12.5px', padding: '6px 12px' }}
              onClick={() => setFilterView('all')}
            >
              Tất cả ({expectedSamples.length})
            </button>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Đang hiển thị: {
              filterView === 'missing' ? missingItems.length :
              filterView === 'misplaced' ? misplacedItems.length :
              filterView === 'matched' ? matchedItems.length : expectedSamples.length
            } mục
          </div>
        </div>

        {/* DANH SÁCH CHI TIẾT */}
        {(() => {
          let listToDisplay = [];
          if (filterView === 'missing') listToDisplay = missingItems;
          else if (filterView === 'misplaced') listToDisplay = misplacedItems;
          else if (filterView === 'matched') listToDisplay = matchedItems;
          else listToDisplay = expectedSamples;

          if (listToDisplay.length === 0) {
            return (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                {filterView === 'missing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '28px' }}>🎉</div>
                    <strong style={{ fontSize: '15px', color: 'var(--status-success)' }}>Tuyệt vời! Không có mẫu nào bị thiếu trên kệ này.</strong>
                    <span style={{ fontSize: '12.5px' }}>Toàn bộ các cây nguyên đã được quét khớp đầy đủ.</span>
                  </div>
                )}
                {filterView === 'misplaced' && <div>Không có mẫu nào bị để nhầm kệ.</div>}
                {filterView === 'matched' && <div>Chưa có mẫu nào được quét trong đợt này. Bật camera để bắt đầu quét.</div>}
                {filterView === 'all' && <div>Không có mẫu nào trong phạm vi đã chọn.</div>}
              </div>
            );
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {listToDisplay.map((item, idx) => {
                const isMatched = scannedMap[item.sku] && scannedMap[item.sku].matchType === 'matched';
                const isMisplaced = filterView === 'misplaced' || (scannedMap[item.sku] && scannedMap[item.sku].matchType === 'misplaced');
                const isMissing = !scannedMap[item.sku];

                const borderColor = isMissing
                  ? 'rgba(239, 68, 68, 0.4)'
                  : isMisplaced
                    ? 'rgba(245, 158, 11, 0.4)'
                    : 'rgba(16, 185, 129, 0.4)';

                const bgColor = isMissing
                  ? 'rgba(239, 68, 68, 0.03)'
                  : isMisplaced
                    ? 'rgba(245, 158, 11, 0.03)'
                    : 'rgba(16, 185, 129, 0.03)';

                return (
                  <div
                    key={item.id || item.sku || idx}
                    style={{
                      borderLeft: `4px solid ${borderColor}`,
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                      borderLeftWidth: '4px',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: isMissing ? 'rgba(220,38,38,0.2)' : isMisplaced ? 'rgba(217,119,6,0.2)' : 'rgba(5,150,105,0.2)',
                            color: isMissing ? 'var(--status-error)' : isMisplaced ? 'var(--status-warning)' : 'var(--status-success)'
                          }}
                        >
                          {isMissing ? '🔴 THIẾU / CHƯA QUÉT' : isMisplaced ? '🟡 ĐỂ SAI KỆ' : '🟢 ĐÃ KHỚP'}
                        </span>
                        <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>
                          {item.products?.product_name || item.product_name}
                        </strong>
                        {item.products?.warning_code && (
                          <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                            {item.products.warning_code}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12.5px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                        <div>
                          <strong>Vị trí hệ thống:</strong>{' '}
                          <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
                            {item.shelf ? formatLocation(item.shelf, item.slot, item.column_number) : (item.box_id ? `Thùng ${item.box_id}` : 'Chưa xếp')}
                          </span>
                        </div>
                        <div>
                          <strong>Mẻ sợi:</strong> {formatBlendBatch ? formatBlendBatch(item.blend_batch) : item.blend_batch}
                        </div>
                        <div>
                          <strong>Mã SKU:</strong> <code>{item.sku}</code>
                        </div>
                        <div>
                          <strong>Số lượng:</strong> {item.available_qty || 10} bao
                        </div>
                      </div>
                    </div>

                    {/* Thao tác nhanh cho từng dòng */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {isMisplaced && selectedScope !== 'all' && selectedScope !== 'box' && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '5px 12px', color: 'var(--status-warning)', borderColor: 'var(--status-warning)' }}
                          onClick={() => handleRelocateToCurrentShelf(item)}
                        >
                          Đổi về Kệ {SHELF_LETTERS[selectedScope]}
                        </button>
                      )}
                      {isMissing && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <button
                            className="btn"
                            style={{
                              fontSize: '12px',
                              padding: '6px 14px',
                              color: 'var(--status-success)',
                              borderColor: 'rgba(5, 150, 105, 0.4)',
                              background: 'rgba(5, 150, 105, 0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              borderRadius: '6px'
                            }}
                            onClick={() => handleManualVerifyItem(item)}
                            title="Tem bị mờ không quét được? Bấm để điểm danh xác nhận có mặt"
                          >
                            <Check size={14} /> Xác nhận đã thấy (Tem mờ)
                          </button>
                          <span style={{ fontSize: '11px', color: 'var(--status-error)', fontStyle: 'italic' }}>
                            Ô {item.slot} - Cột {item.column_number}
                          </span>
                        </div>
                      )}
                      {isMatched && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '12px',
                              color: 'var(--status-success)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontWeight: 600,
                              background: 'rgba(5, 150, 105, 0.08)',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid rgba(16, 185, 129, 0.25)'
                            }}
                          >
                            <CheckCircle2 size={14} />
                            {scannedMap[item.sku]?.manualConfirmed ? 'Xác nhận thủ công' : 'Đã quét khớp'}
                          </span>
                          <button
                            onClick={() => handleUnmatchItem(item.sku)}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '4px 6px',
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: '4px'
                            }}
                            title="Hủy xác nhận mẫu này để quét lại"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── BIỂU MẪU IN BIÊN BẢN KIỂM KÊ (PRINT VIEW ONLY) ── */}
      <div className="print-audit-report" style={{ display: 'none' }}>
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .print-audit-report, .print-audit-report * { visibility: visible !important; }
            .print-audit-report {
              display: block !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              background: #fff !important;
              color: #000 !important;
              padding: 20px !important;
              font-family: Arial, sans-serif !important;
              font-size: 13px !important;
            }
          }
        `}</style>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', textTransform: 'uppercase' }}>BIÊN BẢN KIỂM KÊ KHO MẪU THUỐC LÁ</h2>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Ngày kiểm kê: {new Date().toLocaleString()}</div>
          <div style={{ fontSize: '12px' }}>Phạm vi: {scopeLabel}</div>
          <div style={{ fontSize: '12px' }}>Người thực hiện: {profile?.full_name || 'Thủ kho'}</div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ border: '1px solid #000', padding: '6px' }}>Tổng cây nguyên</th>
              <th style={{ border: '1px solid #000', padding: '6px' }}>Đã quét khớp</th>
              <th style={{ border: '1px solid #000', padding: '6px' }}>Nghi ngờ thiếu</th>
              <th style={{ border: '1px solid #000', padding: '6px' }}>Để sai kệ</th>
              <th style={{ border: '1px solid #000', padding: '6px' }}>Tỷ lệ khớp</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '6px' }}>{expectedSamples.length}</td>
              <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>{matchedItems.length}</td>
              <td style={{ border: '1px solid #000', padding: '6px', color: 'red', fontWeight: 'bold' }}>{missingItems.length}</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>{misplacedItems.length}</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>{progressPercent}%</td>
            </tr>
          </tbody>
        </table>

        {missingItems.length > 0 && (
          <div>
            <h4 style={{ margin: '12px 0 6px', color: 'red' }}>DANH SÁCH CÂY THUỐC NGHI NGỜ THẤT THOÁT / THIẾU ({missingItems.length} cây):</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#fef2f2' }}>
                  <th style={{ border: '1px solid #000', padding: '5px' }}>STT</th>
                  <th style={{ border: '1px solid #000', padding: '5px' }}>Tên sản phẩm</th>
                  <th style={{ border: '1px solid #000', padding: '5px' }}>Vị trí ghi nhận</th>
                  <th style={{ border: '1px solid #000', padding: '5px' }}>Mẻ sợi</th>
                  <th style={{ border: '1px solid #000', padding: '5px' }}>Mã SKU</th>
                </tr>
              </thead>
              <tbody>
                {missingItems.map((s, i) => (
                  <tr key={s.id || i}>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>{s.products?.product_name || s.product_name}</td>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>{s.shelf ? formatLocation(s.shelf, s.slot, s.column_number) : 'Thùng'}</td>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>{s.blend_batch}</td>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>{s.sku}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', textAlign: 'center' }}>
          <div style={{ width: '200px' }}>
            <strong>Người kiểm kê</strong>
            <div style={{ marginTop: '50px' }}>{profile?.full_name || '................................'}</div>
          </div>
          <div style={{ width: '200px' }}>
            <strong>Thủ kho xác nhận</strong>
            <div style={{ marginTop: '50px' }}>................................</div>
          </div>
        </div>
      </div>

    </div>
  );
}
