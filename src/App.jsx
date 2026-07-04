import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  Search, Plus, LogIn, LogOut, Moon, Sun, Layers, Database,
  FileText, Check, X, ShieldAlert, Archive, QrCode, Save,
  ClipboardList, Info, Trash2, User, ChevronRight, Box, ArrowRightLeft, Loader,
  UploadCloud, ChevronDown, ChevronUp, AlertTriangle, Bell, Move
} from 'lucide-react';

// Override globally for Vietnamese date formatting (DD/MM/YYYY and HH:MM ngày DD/MM/YYYY)
Date.prototype.toLocaleDateString = function() {
  const day = String(this.getDate()).padStart(2, '0');
  const month = String(this.getMonth() + 1).padStart(2, '0');
  const year = this.getFullYear();
  return `${day}/${month}/${year}`;
};

Date.prototype.toLocaleString = function() {
  const hours = String(this.getHours()).padStart(2, '0');
  const minutes = String(this.getMinutes()).padStart(2, '0');
  const day = String(this.getDate()).padStart(2, '0');
  const month = String(this.getMonth() + 1).padStart(2, '0');
  const year = this.getFullYear();
  return `${hours}:${minutes} ngày ${day}/${month}/${year}`;
};

// ── Hỗ trợ lấy tên thiết bị từ UserAgent ──
const getDeviceDescription = () => {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s+[^;]+;\s+([^;\)]+)/);
    if (match && match[1]) {
      const model = match[1].replace(/Build\/.+/i, '').trim();
      return model || 'Android';
    }
    return 'Android';
  }
  let os = 'PC';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';
  
  let browser = 'Browser';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua)) browser = 'Safari';
  
  return `${os} (${browser})`;
};

// ── Lấy phần mô tả thiết bị thân thiện để hiển thị ──
const getDisplayDeviceName = (did) => {
  if (!did) return 'Không rõ';
  const match = did.match(/\(([^)]+)\)/);
  return match ? match[1] : did.slice(0, 12) + '...';
};

// ── Device Fingerprint (thuần JS, không cần thư viện ngoài) ──
const generateDeviceId = async () => {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('device-fingerprint', 2, 2);
    const canvasStr = canvas.toDataURL();
    const navStr = [
      navigator.userAgent,
      navigator.language,
      screen.width, screen.height, screen.colorDepth,
      new Date().getTimezoneOffset()
    ].join('|');
    const raw = canvasStr + navStr;
    // Simple hash
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    const deviceName = getDeviceDescription();
    return `dev-${Math.abs(hash).toString(36)} (${deviceName})`;
  } catch {
    const deviceName = getDeviceDescription();
    return `dev-${Math.random().toString(36).slice(2, 10)} (${deviceName})`;
  }
};

// Format capacity mapping
const FORMAT_CAPACITIES = {
  'Kingsize': { columns: 6, height: 7, total: 42 },
  'SuperSlim': { columns: 6, height: 10, total: 60 },
  'Semi': { columns: 6, height: 7, total: 42 },
  'Demi': { columns: 8, height: 7, total: 56 },
  'Slim': { columns: 6, height: 10, total: 60 }
};

const liveFormatDate = (value, prevValue) => {
  if (prevValue && prevValue.length > value.length) {
    return value;
  }
  let v = value.replace(/\D/g, '');
  if (v.length > 8) v = v.slice(0, 8);
  
  if (v.length >= 5) {
    return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
  } else if (v.length >= 3) {
    return `${v.slice(0, 2)}/${v.slice(2)}`;
  }
  return v;
};

// Auto-format date typed in flexible shorthand (like 20/5/23 -> 20/05/2023)
const autoFormatDate = (value) => {
  if (!value) return value;
  const cleaned = value.trim();
  const parts = cleaned.split(/[\/\-\.]/);
  if (parts.length !== 3) return value;
  
  let dayStr = parts[0];
  let monthStr = parts[1];
  let yearStr = parts[2];
  
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  let year = parseInt(yearStr, 10);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return value;
  
  const formattedDay = String(day).padStart(2, '0');
  const formattedMonth = String(month).padStart(2, '0');
  
  if (yearStr.length === 2) {
    year = year < 50 ? 2000 + year : 1900 + year;
  }
  const formattedYear = String(year);
  
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() === year && (d.getMonth() + 1) === month && d.getDate() === day) {
    return `${formattedDay}/${formattedMonth}/${formattedYear}`;
  }
  return value;
};

// Auto-format time typed in flexible shorthand (like 9:5 -> 09:05)
const autoFormatTime = (value) => {
  if (!value) return value;
  const cleaned = value.trim();
  const parts = cleaned.split(/[\:\.]/);
  if (parts.length !== 2) return value;
  
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour >= 24 || minute < 0 || minute >= 60) {
    return value;
  }
  
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// Format composite blend_batch containing box sequence number (like 123|15)
const formatBlendBatch = (val) => {
  if (!val) return '';
  const parts = val.split('|');
  if (parts.length === 2) {
    return `Mẻ ${parts[0]}`;
  }
  return val;
};

const formatSamplingBox = (val) => {
  if (!val) return '';
  const parts = val.split('|');
  if (parts.length === 2) {
    return `(Thùng lấy mẫu: ${parts[1]})`;
  }
  return '';
};

// Format location into coordinate A1, B5, etc.
const formatLocation = (shelf, slot, column) => {
  if (!shelf || !slot) return '';
  const letters = ['', 'A', 'B', 'C', 'D', 'E', 'F'];
  const shelfLetter = letters[shelf] || `Kệ ${shelf}`;
  const slotSuffix = slot === 5 ? ' (Lẻ)' : '';
  const locStr = `${shelfLetter}${slot}${slotSuffix}`;
  if (column !== undefined && column !== null) {
    return `${shelfLetter}${slot} - Cột ${column}${slotSuffix}`;
  }
  return locStr;
};

export default function App() {
  // Authentication & Profile States
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authEmployeeCode, setAuthEmployeeCode] = useState('');
  const [authRole, setAuthRole] = useState('staff'); // 'admin' or 'staff'
  const [authMode, setAuthMode] = useState('login'); // 'login', 'signup', or 'guest'
  const [loading, setLoading] = useState(false);

  // Undo States
  const [lastAssignedIds, setLastAssignedIds] = useState(null);
  const [isUndoing, setIsUndoing] = useState(false);

  // Database States
  const [products, setProducts] = useState([]);
  const [samples, setSamples] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [profilesList, setProfilesList] = useState([]);
  const [slotConfigs, setSlotConfigs] = useState([]);

  // Slot modal settings states
  const [modalIsFull, setModalIsFull] = useState(false);
  const [modalNote, setModalNote] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Application UI States
  const [activeTab, setActiveTab] = useState('shelves');
  const [previousTabBeforeSearch, setPreviousTabBeforeSearch] = useState('shelves');

  // Bulk Import State
  const createEmptyBulkRow = (id) => ({
    id, productId: '', productObj: null, searchQuery: '', suggestions: [],
    blendBatch: '', boxSeq: '', blendDate: '', packagingDate: '', samplingDate: '',
    samplingHour: '08', samplingMinute: '00', orderNumber: '', qty: '', note: ''
  });
  const [bulkRows, setBulkRows] = useState([createEmptyBulkRow(1)]);
  const [bulkTrayNumber, setBulkTrayNumber] = useState('1');

  useEffect(() => {
    if (samples && samples.length > 0) {
      const trayNumbers = samples.map(s => s.tray_number).filter(t => t !== null && t !== undefined && !isNaN(t));
      if (trayNumbers.length > 0) {
        const maxTray = Math.max(...trayNumbers);
        setBulkTrayNumber(String(maxTray + 1));
      } else {
        setBulkTrayNumber('1');
      }
    } else {
      setBulkTrayNumber('1');
    }
  }, [samples]);

  const [bulkActiveSuggestIdx, setBulkActiveSuggestIdx] = useState(-1);

  const handleBulkSearchKeyDown = (e, rowIdx) => {
    const row = bulkRows[rowIdx];
    if (!row || !row.suggestions || row.suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setBulkActiveSuggestIdx(prev => (prev + 1 < row.suggestions.length) ? prev + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setBulkActiveSuggestIdx(prev => (prev - 1 >= 0) ? prev - 1 : row.suggestions.length - 1);
    } else if (e.key === 'Enter') {
      if (bulkActiveSuggestIdx >= 0 && bulkActiveSuggestIdx < row.suggestions.length) {
        e.preventDefault();
        selectBulkProduct(rowIdx, row.suggestions[bulkActiveSuggestIdx]);
        setBulkActiveSuggestIdx(-1);
      }
    } else if (e.key === 'Escape') {
      updateBulkRow(rowIdx, 'suggestions', []);
      setBulkActiveSuggestIdx(-1);
    }
  };

  const [bulkPreview, setBulkPreview] = useState(null); // kept for compat, unused now
  const [bulkStep, setBulkStep] = useState(1); // unused now, kept for compat
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkNextId, setBulkNextId] = useState(2);
  // Scan & Propose state
  const [scanPreview, setScanPreview] = useState(null); // { toShelf, toBox, boxGroups }
  const [scanSaving, setScanSaving] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [toasts, setToasts] = useState([]);
  
  // Tray merge and split side-by-side modal states & functions
  const [showTrayAdjusterModal, setShowTrayAdjusterModal] = useState(false);
  const [sourceTrayNum, setSourceTrayNum] = useState('');
  const [destTrayNum, setDestTrayNum] = useState('');
  const [isNewDestTray, setIsNewDestTray] = useState(false);
  const [newDestTrayNum, setNewDestTrayNum] = useState('');
  const [sourceSelectedIds, setSourceSelectedIds] = useState([]);

  const handleTransferBetweenTrays = async () => {
    if (sourceSelectedIds.length === 0) {
      showToast("Vui lòng chọn các mẫu cần chuyển ở Khay gửi!", "warning");
      return;
    }
    let targetNumVal = parseInt(destTrayNum, 10);
    if (isNewDestTray) {
      targetNumVal = parseInt(newDestTrayNum, 10);
    }
    if (isNaN(targetNumVal) || targetNumVal < 1) {
      showToast("Khay nhận không hợp lệ!", "error");
      return;
    }
    if (targetNumVal === parseInt(sourceTrayNum, 10)) {
      showToast("Khay nhận phải khác Khay gửi!", "warning");
      return;
    }

    setLoading(true);
    try {
      if (isDemoMode) {
        setSamples(prev => prev.map(s => sourceSelectedIds.includes(s.id) ? { ...s, tray_number: targetNumVal } : s));
        showToast(`✅ Đã chuyển ${sourceSelectedIds.length} mẫu sang Khay số ${targetNumVal}!`, "success");
        setSourceSelectedIds([]);
      } else {
        const { error } = await supabase
          .from('samples')
          .update({ tray_number: targetNumVal })
          .in('id', sourceSelectedIds);

        if (error) throw error;

        setSamples(prev => prev.map(s => sourceSelectedIds.includes(s.id) ? { ...s, tray_number: targetNumVal } : s));
        showToast(`✅ Đã chuyển ${sourceSelectedIds.length} mẫu sang Khay số ${targetNumVal}!`, "success");
        setSourceSelectedIds([]);
      }
    } catch (e) {
      console.error("Error transferring between trays:", e);
      showToast("Có lỗi xảy ra khi di chuyển khay!", "error");
    } finally {
      setLoading(false);
    }
  };
  
  // Offline / Demo Mode fallback (for instant preview without Supabase keys)
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Modal / Detail States
  const [selectedSlot, setSelectedSlot] = useState(null); // { shelf, slot }
  const [qrCodeModal, setQrCodeModal] = useState(null); // sample object
  const [movingSample, setMovingSample] = useState(null); // sample object to move

  useEffect(() => {
    if (selectedSlot) {
      const config = slotConfigs.find(c => c.shelf === selectedSlot.shelf && c.slot === selectedSlot.slot);
      setModalIsFull(config?.is_full || false);
      setModalNote(config?.note || '');
    } else {
      setModalIsFull(false);
      setModalNote('');
    }
  }, [selectedSlot, slotConfigs]);

  const [moveType, setMoveType] = useState('shelves');
  const [moveShelf, setMoveShelf] = useState(1);
  const [moveSlot, setMoveSlot] = useState(1);
  const [moveColumn, setMoveColumn] = useState(1);
  const [moveBoxId, setMoveBoxId] = useState('');
  const [moveTrayNumber, setMoveTrayNumber] = useState('');

  useEffect(() => {
    if (movingSample) {
      setMoveType(movingSample.shelf ? 'shelves' : movingSample.box_id ? 'box' : 'pending');
      setMoveShelf(movingSample.shelf || 1);
      setMoveSlot(movingSample.slot || 1);
      setMoveColumn(movingSample.column_number || 1);
      setMoveBoxId(movingSample.box_id || (boxes[0]?.id || ''));
      setMoveTrayNumber(movingSample.tray_number || '');
    }
  }, [movingSample, boxes]);
  const [manifestModal, setManifestModal] = useState(null); // box object
  const [takenLocationModal, setTakenLocationModal] = useState(null); // { product_name, qty, location }

  // Form States
  // Date-Time Default Helper Values
  const getTodayDMY = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };
  const getNowHM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Import Form
  const [importProductId, setImportProductId] = useState('');
  const [importSearchQuery, setImportSearchQuery] = useState('');
  const [importSuggestions, setImportSuggestions] = useState([]);
  const [importOrderNumber, setImportOrderNumber] = useState('');
  const [importBlendBatch, setImportBlendBatch] = useState('');
  const [importBoxSeq, setImportBoxSeq] = useState('');
  
  // Custom Date Text Inputs
  const [importBlendDateStr, setImportBlendDateStr] = useState('');
  const [importPackagingDateStr, setImportPackagingDateStr] = useState('');
  const [importSamplingDateStr, setImportSamplingDateStr] = useState('');
  
  // Hour and Minute select dropdown states for safety
  const [importSamplingHour, setImportSamplingHour] = useState(() => String(new Date().getHours()).padStart(2, '0'));
  const [importSamplingMinute, setImportSamplingMinute] = useState(() => String(new Date().getMinutes()).padStart(2, '0'));

  const [importShelf, setImportShelf] = useState('');
  const [importSlot, setImportSlot] = useState('');
  const [importColumn, setImportColumn] = useState('');
  const [importQty, setImportQty] = useState('');
  const [suggestedLoc, setSuggestedLoc] = useState(null);

  // Auto column selection helpers (left-to-right rule)
  const getNextColInSlot = (shelfVal, slotVal) => {
    if (!shelfVal || !slotVal) return 1;
    const slotSamples = samples.filter(
      s => s.shelf === parseInt(shelfVal) && s.slot === parseInt(slotVal) && s.status === 'stored'
    );
    const occupiedCols = slotSamples.map(s => s.column_number);
    return occupiedCols.length > 0 ? Math.max(...occupiedCols) + 1 : 1;
  };

  const handleShelfChange = (val) => {
    setImportShelf(val);
    if (val && importSlot) {
      setImportColumn(getNextColInSlot(val, importSlot));
    }
  };

  const handleSlotChange = (val) => {
    setImportSlot(val);
    if (importShelf && val) {
      setImportColumn(getNextColInSlot(importShelf, val));
    }
  };

  // Catalog Form
  const [catName, setCatName] = useState('');
  const [catWarning, setCatWarning] = useState('');
  const [catFormat, setCatFormat] = useState('Kingsize');
  const [catIsExport, setCatIsExport] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // ─── BULK IMPORT HELPERS ───────────────────────────────────────────────────
  const parseDMY = (str) => {
    if (!str) return null;
    const p = str.split('/');
    if (p.length !== 3) return null;
    const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
    return isNaN(d.getTime()) ? null : d;
  };

  const formatLocalYYYYMMDD = (date) => {
    if (!date) return '';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const updateBulkRow = (idx, field, value) => {
    setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addBulkRows = (count = 1) => {
    setBulkRows(prev => {
      const newRows = [];
      let nextId = bulkNextId;
      for (let i = 0; i < count; i++) newRows.push(createEmptyBulkRow(nextId++));
      setBulkNextId(nextId);
      return [...prev, ...newRows];
    });
  };

  const removeBulkRow = (idx) => {
    setBulkRows(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  const handleBulkProductSearch = (idx, val) => {
    updateBulkRow(idx, 'searchQuery', val);
    setBulkActiveSuggestIdx(-1);
    if (val.trim().length >= 1) {
      const searchLower = val.toLowerCase().trim();
      const matches = products.filter(p => 
        p.product_name.toLowerCase().includes(searchLower) || 
        (p.warning_code && p.warning_code.toLowerCase().includes(searchLower))
      ).slice(0, 8);
      updateBulkRow(idx, 'suggestions', matches);
    } else {
      updateBulkRow(idx, 'suggestions', []);
      updateBulkRow(idx, 'productId', '');
      updateBulkRow(idx, 'productObj', null);
    }
  };

  const selectBulkProduct = (idx, prod) => {
    setBulkRows(prev => prev.map((r, i) => i === idx ? {
      ...r,
      productId: prod.id,
      productObj: prod,
      searchQuery: prod.product_name + (prod.warning_code ? ` (${prod.warning_code})` : ''),
      orderNumber: prod.is_export ? r.orderNumber : '',
      suggestions: []
    } : r));
    setBulkActiveSuggestIdx(-1);
  };

  // ─── AUTO-ASSIGN ALGORITHM ────────────────────────────────────────────────
  const autoAssignBulkSamples = (rows) => {
    // Build virtual warehouse state from current stored samples
    const vState = {};
    for (let s = 1; s <= 6; s++) {
      vState[s] = {};
      for (let slot = 1; slot <= 4; slot++) {
        vState[s][slot] = {}; // { [colNum]: { productId, packsCount } }
      }
    }
    samples.filter(s => s.status === 'stored' && s.shelf && s.slot <= 4 && s.column_number)
      .forEach(s => {
        if (!vState[s.shelf][s.slot][s.column_number])
          vState[s.shelf][s.slot][s.column_number] = { productId: s.product_id, packsCount: 0 };
        vState[s.shelf][s.slot][s.column_number].packsCount += s.available_qty;
      });

    // Sort: newest packaging_date first; same date → export before domestic
    const sorted = [...rows].sort((a, b) => {
      const da = parseDMY(a.packagingDate), db = parseDMY(b.packagingDate);
      if (da && db && db - da !== 0) return db - da;
      const ae = a.productObj?.is_export ? 1 : 0, be = b.productObj?.is_export ? 1 : 0;
      return be - ae;
    });

    const toShelf = [], toBox = [];

    for (const row of sorted) {
      const prod = row.productObj;
      if (!prod || !row.qty) { toBox.push(row); continue; }
      const qtyPacks = parseInt(row.qty) * 10;
      const fmt = prod.format || 'Kingsize';
      const lim = FORMAT_CAPACITIES[fmt] || FORMAT_CAPACITIES['Kingsize'];
      // Shelf iteration order
      const shelfRange = prod.is_export ? [1,2,3,4,5,6] : [6,5,4,3,2,1];

      let assigned = false;
      for (const shelf of shelfRange) {
        if (assigned) break;
        for (let slot = 1; slot <= 4; slot++) {
          if (assigned) break;
          const slotCols = vState[shelf][slot];
          const newCartons = Math.ceil(qtyPacks / 10);

          // 1) Try stacking on existing column with SAME product
          for (const [colStr, colData] of Object.entries(slotCols)) {
            if (colData.productId === prod.id) {
              const cur = Math.ceil(colData.packsCount / 10);
              if (cur + newCartons <= lim.height) {
                slotCols[colStr].packsCount += qtyPacks;
                toShelf.push({ ...row, shelf, slot, column: parseInt(colStr), qtyPacks });
                assigned = true;
                break;
              }
            }
          }
          if (assigned) break;

          // 2) Try next consecutive empty column
          const occupiedCols = Object.keys(slotCols).map(Number);
          const nextCol = occupiedCols.length > 0 ? Math.max(...occupiedCols) + 1 : 1;
          if (nextCol <= lim.columns && newCartons <= lim.height) {
            // Ensure nextCol is not occupied by different product
            if (!slotCols[nextCol]) {
              slotCols[nextCol] = { productId: prod.id, packsCount: qtyPacks };
              toShelf.push({ ...row, shelf, slot, column: nextCol, qtyPacks });
              assigned = true;
            }
          }
        }
      }
      if (!assigned) toBox.push({ ...row, qtyPacks: parseInt(row.qty || 0) * 10 });
    }

    // Group toBox by packaging month (MM/YYYY)
    const boxGroups = {};
    for (const item of toBox) {
      const d = parseDMY(item.packagingDate);
      const key = d ? `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : 'Không rõ';
      if (!boxGroups[key]) boxGroups[key] = [];
      boxGroups[key].push(item);
    }

    return { toShelf, toBox, boxGroups };
  };

  const handleBulkCalculate = () => {
    // Validate rows
    const errors = [];
    bulkRows.forEach((r, i) => {
      if (!r.productObj) errors.push(`Hàng ${i+1}: Chưa chọn sản phẩm`);
      if (!r.blendBatch || isNaN(parseInt(r.blendBatch))) errors.push(`Hàng ${i+1}: Mẻ sợi không hợp lệ`);
      if (!r.boxSeq || isNaN(parseInt(r.boxSeq))) errors.push(`Hàng ${i+1}: Số thùng không hợp lệ`);
      if (!parseDMY(r.packagingDate)) errors.push(`Hàng ${i+1}: Ngày đóng gói không hợp lệ`);
      if (!parseDMY(r.blendDate)) errors.push(`Hàng ${i+1}: Ngày phối sợi không hợp lệ`);
      if (!r.qty || parseInt(r.qty) < 1) errors.push(`Hàng ${i+1}: Số cây không hợp lệ`);
      if (r.productObj?.is_export && !r.orderNumber) errors.push(`Hàng ${i+1}: Hàng xuất khẩu cần số đơn hàng`);
    });
    if (errors.length > 0) { showToast(errors[0], 'error'); return; }
    const result = autoAssignBulkSamples(bulkRows);
    setBulkPreview(result);
    setBulkStep(2);
  };

  // ── Bulk save: chỉ lưu vào DB, không bố trí vị trí
  const handleBulkSave = async () => {
    if (!bulkRows.length) return;
    // Validate
    const errors = [];
    bulkRows.forEach((r, i) => {
      if (!r.productObj) errors.push(`Hàng ${i+1}: Chưa chọn sản phẩm`);
      if (!r.blendBatch || isNaN(parseInt(r.blendBatch))) errors.push(`Hàng ${i+1}: Mẻ sợi không hợp lệ`);
      if (!r.boxSeq || isNaN(parseInt(r.boxSeq))) errors.push(`Hàng ${i+1}: Số thùng không hợp lệ`);
      if (!parseDMY(r.packagingDate)) errors.push(`Hàng ${i+1}: Ngày SX bao không hợp lệ`);
      if (!parseDMY(r.blendDate)) errors.push(`Hàng ${i+1}: Ngày SX sợi không hợp lệ`);
      if (!parseDMY(r.samplingDate)) errors.push(`Hàng ${i+1}: Ngày lấy mẫu không hợp lệ`);
      if (!r.qty || parseInt(r.qty) < 1) errors.push(`Hàng ${i+1}: Số cây không hợp lệ`);
      if (r.productObj?.is_export && !r.orderNumber) errors.push(`Hàng ${i+1}: Hàng xuất khẩu cần đơn hàng`);
    });
     const trayNumVal = parseInt(bulkTrayNumber, 10);
    if (isNaN(trayNumVal) || trayNumVal < 1) {
      showToast("Vui lòng nhập số khay hợp lệ (lớn hơn 0)!", 'error');
      return;
    }

    if (errors.length > 0) { showToast(errors[0], 'error'); return; }

    setBulkSaving(true);
    try {
      const samplesToInsert = [];
      for (const r of bulkRows) {
        const prod = r.productObj;
        const packD = parseDMY(r.packagingDate);
        const blendD = parseDMY(r.blendDate);
        const sampD = parseDMY(r.samplingDate);
        const hourVal = parseInt(r.samplingHour, 10) || 0;
        const minuteVal = parseInt(r.samplingMinute, 10) || 0;
        sampD.setHours(hourVal, minuteVal, 0, 0);
        const sku = `QR-${prod.product_name.substring(0,3).toUpperCase()}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random()*1000)}`;
        samplesToInsert.push({
          sku, product_id: prod.id,
          order_number: r.orderNumber || null,
          blend_batch: `${parseInt(r.blendBatch)}|${parseInt(r.boxSeq)}`,
          blend_date: formatLocalYYYYMMDD(blendD),
          packaging_date: formatLocalYYYYMMDD(packD),
          sampling_time: sampD.toISOString(),
          shelf: null, slot: null, column_number: null, box_id: null,
          total_qty: parseInt(r.qty) * 10, available_qty: parseInt(r.qty) * 10,
          entry_date: formatLocalYYYYMMDD(new Date()),
          status: 'pending',
          tray_number: trayNumVal,
          note: r.note || null
        });
      }

      if (isDemoMode) {
        const newSamples = samplesToInsert.map((s, i) => ({
          ...s, id: `s-bulk-${Date.now()}-${i}`,
          products: products.find(p => p.id === s.product_id)
        }));
        setSamples(prev => [...prev, ...newSamples]);
      } else {
        const CHUNK = 20;
        for (let i = 0; i < samplesToInsert.length; i += CHUNK) {
          const { error } = await supabase.from('samples').insert(samplesToInsert.slice(i, i + CHUNK));
          if (error) throw error;
        }
        const { data: fresh } = await supabase.from('samples').select('*, products(*)').order('created_at', { ascending: false });
        if (fresh) setSamples(fresh);
      }
      showToast(`✅ Đã lưu ${samplesToInsert.length} mẫu vào database! Chuyển sang mục "Đề xuất bố trí" bên dưới để phân bổ kho.`, 'success');
      setBulkRows([createEmptyBulkRow(1)]);
      setBulkNextId(2);
    } catch(err) {
      showToast('Lỗi khi lưu: ' + err.message, 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Scan pending samples & run auto-assign algorithm
  const handleScanAndPropose = () => {
    const pendingSamples = samples.filter(s => s.status === 'pending');
    if (pendingSamples.length === 0) {
      showToast('Không có mẫu nào đang chờ bố trí!', 'info');
      return;
    }
    // Convert to rows format for algorithm
    const rows = pendingSamples.map(s => {
      const prod = s.products || products.find(p => p.id === s.product_id);
      const packDate = s.packaging_date ? s.packaging_date.split('-').reverse().join('/') : '';
      const blendParts = (s.blend_batch || '|').split('|');
      return {
        _sampleId: s.id,  // actual DB id for UPDATE
        productObj: prod,
        qty: Math.round(s.available_qty / 10),
        qtyPacks: s.available_qty,
        packagingDate: packDate,
        blendBatch: blendParts[0] || '',
        boxSeq: blendParts[1] || '',
        orderNumber: s.order_number || '',
      };
    });
    const result = autoAssignBulkSamples(rows);
    setScanPreview(result);
  };

  // ── Confirm assignment: UPDATE samples in DB
  const handleConfirmAssignment = async () => {
    if (!scanPreview) return;
    setScanSaving(true);
    try {
      // Update shelf assignments
      for (const r of scanPreview.toShelf) {
        if (isDemoMode) {
          setSamples(prev => prev.map(s => s.id === r._sampleId
            ? { ...s, shelf: r.shelf, slot: r.slot, column_number: r.column, status: 'stored' }
            : s
          ));
        } else {
          const { error } = await supabase.from('samples')
            .update({ shelf: r.shelf, slot: r.slot, column_number: r.column, status: 'stored' })
            .eq('id', r._sampleId);
          if (error) throw error;
        }
      }

      // Create boxes and update boxed samples
      for (const [boxKey, items] of Object.entries(scanPreview.boxGroups)) {
        const boxName = `Thùng ${boxKey}`;
        let boxId;
        if (isDemoMode) {
          boxId = `box-scan-${Date.now()}-${boxKey.replace('/','-')}`;
          setBoxes(prev => [...prev, { id: boxId, box_name: boxName, status: 'stored', created_at: new Date().toISOString() }]);
        } else {
          const { data: bx, error } = await supabase.from('boxes').insert([{ box_name: boxName }]).select().single();
          if (error && !error.message.includes('duplicate')) throw error;
          if (error) {
            const { data: existing } = await supabase.from('boxes').select('id').eq('box_name', boxName).single();
            boxId = existing?.id;
          } else boxId = bx.id;
        }
        for (const r of items) {
          if (isDemoMode) {
            setSamples(prev => prev.map(s => s.id === r._sampleId
              ? { ...s, box_id: boxId, shelf: null, slot: null, column_number: null, status: 'boxed' }
              : s
            ));
          } else {
            const { error } = await supabase.from('samples')
              .update({ box_id: boxId, shelf: null, slot: null, column_number: null, status: 'boxed' })
              .eq('id', r._sampleId);
            if (error) throw error;
          }
        }
      }

      // Find all samples that were just assigned and add them to print queue
      const assignedIds = [
        ...scanPreview.toShelf.map(r => r._sampleId),
        ...Object.values(scanPreview.boxGroups).flatMap(items => items.map(r => r._sampleId))
      ];

      let samplesForPrint = [];
      if (isDemoMode) {
        // For demo mode, local state updates are synchronous
        samplesForPrint = samples.filter(s => assignedIds.includes(s.id));
      } else {
        const { data: freshSamples } = await supabase.from('samples').select('*, products(*)').order('created_at', { ascending: false });
        if (freshSamples) {
          setSamples(freshSamples);
          samplesForPrint = freshSamples.filter(s => assignedIds.includes(s.id));
        }
        const { data: freshBoxes } = await supabase.from('boxes').select('*').order('created_at', { ascending: false });
        if (freshBoxes) setBoxes(freshBoxes);
      }

      if (samplesForPrint.length > 0) {
        // Add them to the bulk print queue
        setPrintQueue(prev => {
          // Filter duplicates to prevent adding the same sample twice
          const existingIds = new Set(prev.map(p => p.id));
          const newItems = samplesForPrint.filter(s => !existingIds.has(s.id));
          return [...newItems, ...prev];
        });
      }

      setLastAssignedIds(assignedIds);
      showToast(`✅ Đã bố trí ${scanPreview.toShelf.length} mẫu lên kệ và ${scanPreview.toBox.length} mẫu vào thùng!`, 'success');
      setScanPreview(null);
      // Auto redirect to print tab
      setActiveTab('labels');
    } catch(err) {
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      setScanSaving(false);
    }
  };

  const handleUndoAssignment = async () => {
    if (!lastAssignedIds || lastAssignedIds.length === 0) return;
    setIsUndoing(true);
    try {
      if (isDemoMode) {
        setSamples(prev => prev.map(s => lastAssignedIds.includes(s.id)
          ? { ...s, shelf: null, slot: null, column_number: null, box_id: null, status: 'pending' }
          : s
        ));
      } else {
        const { error } = await supabase.from('samples')
          .update({ shelf: null, slot: null, column_number: null, box_id: null, status: 'pending' })
          .in('id', lastAssignedIds);
        if (error) throw error;
        
        // Fetch fresh samples
        const { data: freshSamples } = await supabase.from('samples').select('*, products(*)').order('created_at', { ascending: false });
        if (freshSamples) setSamples(freshSamples);
      }
      
      // Remove from printQueue
      setPrintQueue(prev => prev.filter(s => !lastAssignedIds.includes(s.id)));
      
      setLastAssignedIds(null);
      showToast('✅ Đã hoàn tác bố trí thành công!', 'success');
    } catch (err) {
      showToast('Lỗi hoàn tác: ' + err.message, 'error');
    } finally {
      setIsUndoing(false);
    }
  };

  const handleDeletePendingSample = async (id) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa mẫu chờ bố trí này không?")) return;
    try {
      if (isDemoMode) {
        setSamples(prev => prev.filter(s => s.id !== id));
      } else {
        const { error } = await supabase.from('samples').delete().eq('id', id);
        if (error) throw error;
        setSamples(prev => prev.filter(s => s.id !== id));
      }
      showToast("✅ Đã xóa mẫu chờ thành công!", 'success');
    } catch (err) {
      showToast("Lỗi xóa mẫu: " + err.message, 'error');
    }
  };

  // ──────────────────────────────────────────────────────────────────────────

  // Staff Search Form
  const [searchName, setSearchName] = useState('');
  const [searchSelMonth, setSearchSelMonth] = useState('');
  const [searchSelYear, setSearchSelYear] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [takeQuantities, setTakeQuantities] = useState({});
  const [takeNotes, setTakeNotes] = useState({});

  // Visitor Tracking (Device Fingerprint + Tên tự khai)
  const [deviceId, setDeviceId] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [searchLogs, setSearchLogs] = useState([]);
  const [searchLogsLoading, setSearchLogsLoading] = useState(false);
  const [resetDevices, setResetDevices] = useState([]); // danh sách device_id đã reset/chặn

  // Nhật ký tìm kiếm: bộ lọc khoảng ngày (mặc định 30 ngày gần nhất)
  const getOffsetDateString = (offsetDays) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [logFilterStartDate, setLogFilterStartDate] = useState(() => getOffsetDateString(30));
  const [logFilterEndDate, setLogFilterEndDate] = useState(() => getOffsetDateString(0));

  // Admin Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Bộ lọc tìm kiếm cho Danh mục gốc
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');

  // Batch Print Label Queue (persisted in LocalStorage)
  const [printQueue, setPrintQueue] = useState(() => {
    const saved = localStorage.getItem('print_queue');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('print_queue', JSON.stringify(printQueue));
  }, [printQueue]);

  // Init Device Fingerprint
  useEffect(() => {
    (async () => {
      let did = localStorage.getItem('visitor_device_id');
      // Nếu chưa có thiết bị hoặc thiết bị cũ chưa được định danh thân thiện (không chứa dấu ngoặc đơn)
      if (!did || !did.includes('(')) {
        did = await generateDeviceId();
        localStorage.setItem('visitor_device_id', did);
      }
      setDeviceId(did);

      // Kiểm tra xem thiết bị bị chặn hoặc bị reset
      try {
        // Kiểm tra xem người dùng hiện tại có phải admin không trước khi áp dụng chặn
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();
          if (prof && prof.role === 'admin') {
            // Là admin → bỏ qua hoàn toàn kiểm tra chặn/reset để tránh tự khóa mình
            const savedName = localStorage.getItem('visitor_name');
            if (savedName) setVisitorName(savedName);
            return;
          }
        }

        const { data: resetRow } = await supabase
          .from('visitor_resets')
          .select('device_id, is_blocked')
          .eq('device_id', did)
          .maybeSingle();
        if (resetRow) {
          if (resetRow.is_blocked) {
            // Ghi log cố gắng truy cập bị chặn vào search_logs để kích hoạt thông báo Realtime
            try {
              const currentName = localStorage.getItem('visitor_name') || 'Thiết bị bị chặn';
              await supabase.from('search_logs').insert({
                device_id: did,
                user_name: currentName,
                keyword: '[Truy cập bị chặn]',
                results_count: 0
              });
            } catch (e) { /* bỏ qua nếu lỗi insert */ }

            // Bị chặn vĩnh viễn → bay sang Google
            window.location.href = 'https://www.google.com.vn';
            return;
          }
          // Admin đã reset → xóa tên khỏi localStorage và xóa khỏi bảng
          localStorage.removeItem('visitor_name');
          await supabase.from('visitor_resets').delete().eq('device_id', did);
        }
      } catch (e) { /* bỏ qua nếu không kết nối được */ }

      const savedName = localStorage.getItem('visitor_name');
      if (savedName) setVisitorName(savedName);
    })();
  }, []);

  // Chỉ hiện popup hỏi tên khi là Guest hoặc Staff (không phải Admin)
  useEffect(() => {
    const isAdmin = profile?.role === 'admin';
    if (isAdmin) return; // Admin đã có tên trong profile, không cần hỏi
    const isLoggedInAsUser = user && profile; // Staff đã đăng nhập
    const isGuest = authMode === 'guest';
    if (!isLoggedInAsUser && !isGuest) return; // Chưa vào app, chưa cần hỏi

    const savedName = localStorage.getItem('visitor_name');
    if (!savedName) {
      setTimeout(() => setShowNamePrompt(true), 1000);
    }
  }, [authMode, profile, user]);

  const saveVisitorName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      window.location.href = 'https://www.google.com.vn';
      return;
    }
    localStorage.setItem('visitor_name', trimmed);
    setVisitorName(trimmed);
    setShowNamePrompt(false);
    showToast(`Xin chào ${trimmed}! Hệ thống đã ghi nhận.`, 'success');
  };

  // Supabase Realtime — lắng nghe thông báo cho Admin
  useEffect(() => {
    if (isDemoMode || !profile || profile.role !== 'admin') return;

    const addNotif = (notif) => {
      setNotifications(prev => [notif, ...prev].slice(0, 50));
      setUnreadCount(prev => prev + 1);
    };

    const channel = supabase
      .channel('admin-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload) => {
        const row = payload.new;
        if (row.type === 'take_request') {
          addNotif({
            id: row.id,
            icon: '📦',
            title: 'Yêu cầu lấy mẫu mới',
            body: `Số lượng: ${row.quantity} bao`,
            time: new Date().toLocaleString(),
            type: 'take_request'
          });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'search_logs' }, (payload) => {
        const row = payload.new;
        if (row.keyword === '[Truy cập bị chặn]') {
          addNotif({
            id: row.id,
            icon: '🚫',
            title: `Phát hiện truy cập bị chặn!`,
            body: `${row.user_name} (ID: ${row.device_id?.slice(0, 8)}...) vừa cố gắng vào hệ thống`,
            time: new Date().toLocaleString(),
            type: 'block_attempt'
          });
        } else {
          addNotif({
            id: row.id,
            icon: '🔍',
            title: `${row.user_name} vừa tìm kiếm`,
            body: `Từ khóa: “${row.keyword}” — ${row.results_count} kết quả`,
            time: new Date().toLocaleString(),
            type: 'search'
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, isDemoMode]);

  // Admin reset tên visitor theo device_id
  const handleResetVisitor = async (devId, userName) => {
    if (!window.confirm(`Xác nhận reset tên "${userName}"?\nLần sau họ vào web sẽ phải khai báo tên lại.`)) return;
    try {
      await supabase.from('visitor_resets').upsert({ device_id: devId, is_blocked: false, reset_by: 'admin' });
      showToast(`Đã reset thiết bị của "${userName}". Họ sẽ phải nhập lại tên lần sau!`, 'success');
      fetchSearchLogs();
    } catch (e) {
      showToast('Lỗi khi reset. Thử lại.', 'error');
    }
  };

  // Admin chặn vĩnh viễn thiết bị
  const handleBlockVisitor = async (devId, userName) => {
    if (!window.confirm(`CHẶN VĨNH VIỄN thiết bị "${userName}"?\nHọ sẽ không vào được hệ thống nữa.`)) return;
    try {
      await supabase.from('visitor_resets').upsert({ device_id: devId, is_blocked: true, reset_by: 'admin' });
      showToast(`Đã chặn vĩnh viễn thiết bị của "${userName}"!`, 'success');
      fetchSearchLogs();
    } catch (e) {
      showToast('Lỗi khi chặn. Thử lại.', 'error');
    }
  };

  // Gỡ chặn thiết bị
  const handleUnblockVisitor = async (devId, userName) => {
    try {
      await supabase.from('visitor_resets').delete().eq('device_id', devId);
      showToast(`Đã gỡ chặn thiết bị của "${userName}".`, 'success');
      fetchSearchLogs();
    } catch (e) {
      showToast('Lỗi khi gỡ chặn.', 'error');
    }
  };

  const fetchSearchLogs = async () => {
    if (isDemoMode) return;
    setSearchLogsLoading(true);
    try {
      // Chuyển đổi sang định dạng ISO cho Supabase (từ 00:00:00 của ngày bắt đầu đến 23:59:59 của ngày kết thúc)
      const startIso = new Date(`${logFilterStartDate}T00:00:00`).toISOString();
      const endIso = new Date(`${logFilterEndDate}T23:59:59`).toISOString();

      const [{ data: logs }, { data: resets }] = await Promise.all([
        supabase
          .from('search_logs')
          .select('*')
          .gte('searched_at', startIso)
          .lte('searched_at', endIso)
          .order('searched_at', { ascending: false }),
        supabase.from('visitor_resets').select('device_id, is_blocked')
      ]);
      setSearchLogs(logs || []);
      setResetDevices(resets || []);
    } catch (e) {
      console.error('Error fetching search logs:', e);
    } finally {
      setSearchLogsLoading(false);
    }
  };

  // Toast helper
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Switch dark/light theme
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Check current session
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Check if Supabase keys are setup
    const isSupabaseConfigured = supabase.supabaseUrl && !supabase.supabaseUrl.includes('your-project-id');
    
    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setUser(session.user);
          // Khôi phục session lần đầu: Lấy profile và đặt tab mặc định tương ứng
          supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
            .then(({ data: prof }) => {
              if (prof) {
                setProfile(prof);
                setActiveTab('shelves');
              }
            });
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setUser(session.user);
          fetchProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      // Supabase not configured yet - load demo mode
      setIsDemoMode(true);
      showToast("Đang chạy ở chế độ Demo offline. Cấu hình file .env để kết nối database.", "info");
      loadDemoData();
    }
  }, []);

  // Fetch user profile from profiles table (Không can thiệp activeTab nữa)
  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error("Error fetching profile:", err);
      // Auto-create profile if missing
      createFallbackProfile(userId);
    }
  };

  const createFallbackProfile = async (userId) => {
    const fallback = {
      id: userId,
      full_name: authFullName || user?.email?.split('@')[0] || "Người dùng",
      employee_code: authEmployeeCode || `NV-${Math.floor(Math.random() * 10000)}`,
      role: authRole || 'staff',
      department: 'QC'
    };
    try {
      await supabase.from('profiles').insert(fallback);
      setProfile(fallback);
    } catch (e) {
      console.error("Error creating profile:", e);
    }
  };

  // Fetch all db records
  useEffect(() => {
    if (isDemoMode) return;
    if (user || authMode === 'guest') {
      fetchDatabaseData();
    }
  }, [user, authMode, isDemoMode]);

  const fetchDatabaseData = async () => {
    try {
      setLoading(true);
      const { data: p } = await supabase.from('products').select('*').order('product_name');
      const { data: s } = await supabase.from('samples').select('*, products(*)').order('created_at', { ascending: false });
      const { data: b } = await supabase.from('boxes').select('*').order('created_at', { ascending: false });
      const { data: t } = await supabase.from('transactions').select('*, samples(*, products(*)), profiles(*)').order('created_at', { ascending: false });
      
      setProducts(p || []);
      setSamples(s || []);
      setBoxes(b || []);
      setTransactions(t || []);

      // Load slotconfigs defensively
      try {
        const { data: sc, error: scErr } = await supabase.from('slot_configs').select('*');
        if (!scErr && sc) {
          setSlotConfigs(sc);
        } else if (scErr) {
          console.warn("Table slot_configs does not exist or fetch failed:", scErr.message);
        }
      } catch (scEx) {
        console.warn("Ex fetching slot_configs:", scEx);
      }
    } catch (e) {
      console.error("Error loading database:", e);
    } finally {
      setLoading(false);
    }
  };

  // DEMO DATA (Mock Database for preview mode)
  const loadDemoData = () => {
    const mockProducts = [
      { id: '1', product_name: '555 Slim', warning_code: null, is_export: false, format: 'Slim' },
      { id: '2', product_name: 'Albond Filters Cigarette', warning_code: 'Duty Free HW', is_export: true, format: 'Kingsize' },
      { id: '3', product_name: 'American Remote', warning_code: 'EEC HW', is_export: true, format: 'Kingsize' },
      { id: '4', product_name: 'Blue Ice Blast Round Corner Pack', warning_code: 'HK Health Warning', is_export: true, format: 'Kingsize' },
      { id: '5', product_name: 'Canyon Vanilla Slims', warning_code: 'Vietnamese HW', is_export: false, format: 'Slim' },
      { id: '6', product_name: 'White Bear 7G', warning_code: 'US HW', is_export: true, format: 'Demi' },
      { id: '7', product_name: 'Đông Đô Slim VN', warning_code: 'Vietnamese HW', is_export: false, format: 'Slim' }
    ];

    const mockSamples = [
      {
        id: 's1',
        sku: 'QR-555S-001',
        product_id: '1',
        products: mockProducts[0],
        order_number: null,
        blend_batch: 'MS-2026-A',
        blend_date: '2026-05-10',
        packaging_date: '2026-06-01',
        sampling_time: '2026-06-02T10:00:00Z',
        shelf: 1,
        slot: 1,
        column_number: 1,
        box_id: null,
        total_qty: 40, // 4 cây (40 bao)
        available_qty: 35, // Đã lấy 5 bao
        entry_date: '2026-06-03',
        status: 'stored'
      },
      {
        id: 's2',
        sku: 'QR-ALB-002',
        product_id: '2',
        products: mockProducts[1],
        order_number: 'EX-ORDER-991',
        blend_batch: 'MS-ALB-12',
        blend_date: '2026-04-12',
        packaging_date: '2026-05-20',
        sampling_time: '2026-05-21T14:30:00Z',
        shelf: 2,
        slot: 3,
        column_number: 2,
        box_id: null,
        total_qty: 70, // 7 cây (70 bao)
        available_qty: 70,
        entry_date: '2026-05-22',
        status: 'stored'
      },
      {
        id: 's3',
        sku: 'QR-DEM-003',
        product_id: '6',
        products: mockProducts[5],
        order_number: 'EX-9922',
        blend_batch: 'MS-DEM-05',
        blend_date: '2025-05-01', // Quá hạn 12 tháng!
        packaging_date: '2025-05-05',
        sampling_time: '2025-05-06T08:00:00Z',
        shelf: 3,
        slot: 4,
        column_number: 5,
        box_id: null,
        total_qty: 50,
        available_qty: 50,
        entry_date: '2025-05-07',
        status: 'stored'
      }
    ];

    const mockBoxes = [
      { id: 'b1', box_name: 'Thùng 05/2026', created_at: '2026-05-01T09:00:00Z', status: 'stored' }
    ];

    const mockTransactions = [
      {
        id: 't1',
        sample_id: 's1',
        samples: mockSamples[0],
        user_id: 'guest',
        profiles: { full_name: 'Lê Văn A', employee_code: 'NV-9901' },
        type: 'take_request',
        quantity: 5,
        status: 'pending',
        note: 'Lấy mẫu kiểm tra chất lượng hơi hút',
        created_at: '2026-06-29T15:00:00Z'
      }
    ];

    setProducts(mockProducts);
    setSamples(mockSamples);
    setBoxes(mockBoxes);
    setTransactions(mockTransactions);
  };

  // Auth Operations
  const handleAuth = async (e) => {
    e.preventDefault();
    if (isDemoMode) {
      // Offline mock authentication
      const mockUser = { id: authMode === 'signup' ? 'admin' : 'staff', email: authEmail };
      const mockProfile = {
        id: mockUser.id,
        full_name: authFullName || 'Người dùng Demo',
        employee_code: authEmployeeCode || 'NV-DEMO',
        role: authRole,
        department: 'QC'
      };
      setUser(mockUser);
      setProfile(mockProfile);
      showToast(`Đăng nhập thành công với vai trò: ${authRole}`, 'success');
      setActiveTab('shelves');
      return;
    }

    try {
      setLoading(true);
      if (authMode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword
        });
        if (error) throw error;
        showToast("Đăng nhập thành công!", "success");

        // Đặt activeTab dựa vào role của profile ngay sau khi đăng nhập thành công
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();
        if (prof) {
          setActiveTab('shelves');
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword
        });
        if (error) throw error;
        showToast("Đăng ký thành công! Đang tạo thông tin...", "success");
        if (data.user) {
          await createFallbackProfile(data.user.id);
          setActiveTab('shelves');
        }
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (isDemoMode) {
      setUser(null);
      setProfile(null);
      setAuthMode('login');
      setActiveTab('search');
      showToast("Đã đăng xuất chế độ Demo", "info");
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setAuthMode('login');
    setActiveTab('search');
    showToast("Đã đăng xuất", "info");
  };

  const handleImportSearchChange = (val) => {
    setImportSearchQuery(val);
    if (val.trim().length >= 1) {
      const searchLower = val.toLowerCase().trim();
      const matches = products.filter(p => p.product_name.toLowerCase().includes(searchLower)).slice(0, 10);
      setImportSuggestions(matches);
    } else {
      setImportSuggestions([]);
      setImportProductId('');
      setSuggestedLoc(null);
    }
  };

  const selectImportProduct = (p) => {
    setImportSearchQuery(p.product_name + (p.warning_code ? ` (${p.warning_code})` : ''));
    setImportProductId(p.id);
    setImportSuggestions([]);
    handleProductSelectForImport(p.id);
  };

  // Auto-location suggestion logic (3 Priorities)
  const handleProductSelectForImport = (prodId) => {
    setImportProductId(prodId);
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    // Reset suggest
    setSuggestedLoc(null);

    const format = prod.format || 'Kingsize';
    const limitInfo = FORMAT_CAPACITIES[format] || FORMAT_CAPACITIES['Kingsize'];

    // 1. Priority 1: Find a column that already has this product and is NOT full
    const sameProductSamples = samples.filter(s => s.product_id === prodId && s.status === 'stored');
    for (let s of sameProductSamples) {
      if (s.shelf && s.slot && s.column_number) {
        // Calculate current height occupied in this column by this product batch
        const currentCartons = Math.ceil(s.available_qty / 10);
        if (currentCartons < limitInfo.height) {
          // Found space!
          setSuggestedLoc({
            shelf: s.shelf,
            slot: s.slot,
            column_number: s.column_number,
            reason: `Xếp chồng tiếp vào ${formatLocation(s.shelf, s.slot, s.column_number)} (Đã có sản phẩm này, hiện cao ${currentCartons}/${limitInfo.height} cây)`
          });
          setImportShelf(s.shelf);
          setImportSlot(s.slot);
          setImportColumn(s.column_number);
          return;
        }
      }
    }

    // 2. Priority 2: Find the next consecutive empty column in a slot that contains the SAME format
    // Iterate Shelves 1-6, Slots 1-4 (excluding slot 5 which is loose packs)
    for (let shelf = 1; shelf <= 6; shelf++) {
      for (let slot = 1; slot <= 4; slot++) {
        // Check what products are stored in this slot
        const slotSamples = samples.filter(s => s.shelf === shelf && s.slot === slot && s.status === 'stored');
        
        // Find if this slot has any samples, and if they match the same format
        const hasSameFormat = slotSamples.length > 0 && slotSamples.every(s => s.products?.format === format);
        
        if (hasSameFormat || slotSamples.length === 0) {
          // Slot is dedicated to this format, or empty. Check for the next consecutive column.
          const maxCols = limitInfo.columns;
          const occupiedCols = slotSamples.map(s => s.column_number);
          const nextCol = occupiedCols.length > 0 ? Math.max(...occupiedCols) + 1 : 1;
          
          if (nextCol <= maxCols) {
            setSuggestedLoc({
              shelf,
              slot,
              column_number: nextCol,
              reason: `Cột trống kế tiếp trong ô cùng định dạng [${format}] (${formatLocation(shelf, slot, nextCol)})`
            });
            setImportShelf(shelf);
            setImportSlot(slot);
            setImportColumn(nextCol);
            return;
          }
        }
      }
    }

    // 3. Priority 3: Find the next consecutive empty column in any slot anywhere, starting from lower shelves (1 -> 6)
    for (let shelf = 1; shelf <= 6; shelf++) {
      for (let slot = 1; slot <= 4; slot++) {
        const slotSamples = samples.filter(s => s.shelf === shelf && s.slot === slot && s.status === 'stored');
        const maxCols = limitInfo.columns;
        const occupiedCols = slotSamples.map(s => s.column_number);
        const nextCol = occupiedCols.length > 0 ? Math.max(...occupiedCols) + 1 : 1;
        
        if (nextCol <= maxCols) {
          setSuggestedLoc({
            shelf,
            slot,
            column_number: nextCol,
            reason: `Tìm thấy cột trống kế tiếp dưới thấp (${formatLocation(shelf, slot, nextCol)})`
          });
          setImportShelf(shelf);
          setImportSlot(slot);
          setImportColumn(nextCol);
          return;
        }
      }
    }

    // No space
    setSuggestedLoc({
      error: true,
      reason: "Kho đã đầy hoàn toàn! Vui lòng thực hiện đóng thùng mẫu quá cũ để lấy chỗ."
    });
  };

  // Save Slot Config (full status and notes)
  const handleSaveSlotConfig = async () => {
    if (!selectedSlot) return;
    setSavingConfig(true);
    const { shelf, slot } = selectedSlot;
    
    if (isDemoMode) {
      setSlotConfigs(prev => {
        const filtered = prev.filter(c => !(c.shelf === shelf && c.slot === slot));
        return [...filtered, { shelf, slot, is_full: modalIsFull, note: modalNote }];
      });
      showToast("Cập nhật cấu hình ô thành công (Chế độ Demo)!", "success");
      setSavingConfig(false);
    } else {
      try {
        const { error } = await supabase
          .from('slot_configs')
          .upsert({ 
            shelf, 
            slot, 
            is_full: modalIsFull, 
            note: modalNote,
            updated_at: new Date().toISOString()
          }, { onConflict: 'shelf,slot' });
          
        if (error) throw error;
        
        showToast("Cập nhật cấu hình ô thành công!", "success");
        fetchDatabaseData();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        setSavingConfig(false);
      }
    }
  };

  // Import operation
  const handleImportSample = async (e) => {
    if (e) e.preventDefault();
    
    // Parse DMY and time strings
    const parseDMY = (str) => {
      if (!str) return null;
      const parts = str.trim().split('/');
      if (parts.length !== 3) return null;
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
      const d = new Date(year, month, day);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
      return null;
    };

    const parseDMYHM = (dateStr, timeStr) => {
      const d = parseDMY(dateStr);
      if (!d) return null;
      if (!timeStr) return d;
      const parts = timeStr.trim().split(':');
      if (parts.length !== 2) return d;
      const hour = parseInt(parts[0], 10);
      const minute = parseInt(parts[1], 10);
      if (isNaN(hour) || isNaN(minute) || hour < 0 || hour >= 24 || minute < 0 || minute >= 60) {
        return null;
      }
      d.setHours(hour, minute, 0, 0);
      return d;
    };

    const blendD = parseDMY(importBlendDateStr);
    const packD = parseDMY(importPackagingDateStr);
    const sampD = parseDMY(importSamplingDateStr);

    if (!importProductId || !importBlendBatch || !importQty) {
      showToast("Vui lòng điền đầy đủ thông tin mẫu!", "error");
      return;
    }

    // Validate date correctness
    if (!blendD) {
      showToast("Ngày sản xuất sợi không đúng định dạng DD/MM/YYYY (ví dụ: 26/05/2026)!", "error");
      return;
    }
    if (!packD) {
      showToast("Ngày sản xuất bao không đúng định dạng DD/MM/YYYY (ví dụ: 26/05/2026)!", "error");
      return;
    }
    if (!sampD) {
      showToast("Thời gian QC lấy mẫu không đúng định dạng ngày DD/MM/YYYY!", "error");
      return;
    }

    if (blendD > packD) {
      showToast("Lỗi: Ngày sản xuất sợi không được phép sau Ngày sản xuất bao!", "error");
      return;
    }

    // Validate blend batch
    const blendBatchInt = parseInt(importBlendBatch, 10);
    if (isNaN(blendBatchInt) || blendBatchInt < 1 || blendBatchInt > 999) {
      showToast("Mẻ sợi phải là một số thứ tự từ 1 đến 999!", "error");
      return;
    }

    // Validate box sequence number
    const boxSeqInt = parseInt(importBoxSeq, 10);
    if (isNaN(boxSeqInt) || boxSeqInt < 1) {
      showToast("Số thứ tự thùng được lấy mẫu phải là một số nguyên lớn hơn 0!", "error");
      return;
    }

    // Combine date with selected hour & minute
    sampD.setHours(parseInt(importSamplingHour, 10), parseInt(importSamplingMinute, 10), 0, 0);

    const importBlendDate = formatLocalYYYYMMDD(blendD);
    const importPackagingDate = formatLocalYYYYMMDD(packD);
    const importSamplingTime = sampD.toISOString();

    const prod = products.find(p => p.id === importProductId);
    if (prod?.is_export && !importOrderNumber) {
      showToast("Hàng xuất khẩu bắt buộc nhập số đơn hàng!", "error");
      return;
    }

    const shelfNum = parseInt(importShelf);
    const slotNum = parseInt(importSlot);
    const colNum = parseInt(importColumn);
    const qtyPacks = parseInt(importQty) * 10; // total in packs (1 cây = 10 bao lẻ)

    if (slotNum === 5) {
      showToast("Ô 5 là ô dành riêng cho bao lẻ khi bóc cây. Bạn không thể xếp trực tiếp hàng nhập mới vào Ô 5!", "error");
      return;
    }

    // Check consecutive column and max columns limit
    const correctNextCol = getNextColInSlot(shelfNum, slotNum);
    const format = prod?.format || 'Kingsize';
    const limitInfo = FORMAT_CAPACITIES[format] || FORMAT_CAPACITIES['Kingsize'];
    const maxCols = limitInfo.columns;

    if (colNum !== correctNextCol) {
      showToast(`Không đúng thứ tự xếp cột! Cột tiếp theo phải xếp vào là Cột ${correctNextCol}.`, "error");
      return;
    }

    if (colNum > maxCols) {
      showToast(`Ô này đã đạt giới hạn số cột tối đa cho định dạng ${format} (${maxCols} cột)! Vui lòng chọn Kệ/Ô khác.`, "error");
      return;
    }

    // Check if column is already occupied by a different product
    const conflictingSample = samples.find(
      s => s.shelf === shelfNum && s.slot === slotNum && s.column_number === colNum && s.product_id !== importProductId && s.status === 'stored'
    );
    if (conflictingSample) {
      showToast(`Cột ${colNum} của Ô ${slotNum} Kệ ${shelfNum} đã chứa sản phẩm khác (${conflictingSample.products?.product_name}). Mỗi cột chỉ được chứa 1 sản phẩm!`, "error");
      return;
    }

    // Check height limit
    
    // Sum current quantity in packs for the same column
    const existingSamplesInCol = samples.filter(
      s => s.shelf === shelfNum && s.slot === slotNum && s.column_number === colNum && s.status === 'stored'
    );
    const currentPacksInCol = existingSamplesInCol.reduce((sum, s) => sum + s.available_qty, 0);
    const currentCartonsInCol = Math.ceil(currentPacksInCol / 10);
    const newCartonsToAdd = Math.ceil(qtyPacks / 10);

    if (currentCartonsInCol + newCartonsToAdd > limitInfo.height) {
      showToast(`Không thể xếp thêm! Tổng số cây trong cột này sẽ vượt quá chiều cao tối đa (${limitInfo.height} cây đối với ${format}).`, "error");
      return;
    }

    const newSKU = `QR-${prod.product_name.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    const newSample = {
      id: `s-${Date.now()}`,
      sku: newSKU,
      product_id: importProductId,
      order_number: importOrderNumber || null,
      blend_batch: `${blendBatchInt}|${boxSeqInt}`,
      blend_date: importBlendDate,
      packaging_date: importPackagingDate,
      sampling_time: importSamplingTime,
      shelf: shelfNum,
      slot: slotNum,
      column_number: colNum,
      box_id: null,
      total_qty: qtyPacks,
      available_qty: qtyPacks,
      entry_date: formatLocalYYYYMMDD(new Date()),
      status: 'stored'
    };

    if (isDemoMode) {
      const savedSample = { ...newSample, products: prod };
      setSamples(prev => [savedSample, ...prev]);
      
      // Log transaction
      const newTx = {
        id: `t-${Date.now()}`,
        sample_id: savedSample.id,
        samples: savedSample,
        user_id: 'admin',
        profiles: profile || { full_name: 'Thủ kho Demo' },
        type: 'import',
        quantity: qtyPacks,
        status: 'approved',
        note: `Nhập kho lưu vào Kệ ${shelfNum} - Ô ${slotNum} - Cột ${colNum}`,
        created_at: new Date().toISOString()
      };
      setTransactions(prev => [newTx, ...prev]);
      
      showToast("Nhập kho mẫu thành công! Đã thêm vào hàng đợi in nhãn.", "success");
      setPrintQueue(prev => [savedSample, ...prev]);

      setImportQty('');
      setImportOrderNumber('');
      setImportBlendBatch('');
      setImportBoxSeq('');
      setImportBlendDateStr('');
      setImportPackagingDateStr('');
      setImportSamplingDateStr('');
      setImportSamplingHour(String(new Date().getHours()).padStart(2, '0'));
      setImportSamplingMinute(String(new Date().getMinutes()).padStart(2, '0'));
      setSuggestedLoc(null);
      setImportSearchQuery('');
      setImportProductId('');
    } else {
      try {
        setLoading(true);
        // Insert sample
        const { data: saved, error } = await supabase
          .from('samples')
          .insert({
            sku: newSample.sku,
            product_id: newSample.product_id,
            order_number: newSample.order_number,
            blend_batch: newSample.blend_batch,
            blend_date: newSample.blend_date,
            packaging_date: newSample.packaging_date,
            sampling_time: newSample.sampling_time,
            shelf: newSample.shelf,
            slot: newSample.slot,
            column_number: newSample.column_number,
            total_qty: newSample.total_qty,
            available_qty: newSample.available_qty,
            status: 'stored'
          })
          .select('*, products(*)')
          .single();

        if (error) throw error;

        // Insert transaction
        await supabase.from('transactions').insert({
          sample_id: saved.id,
          user_id: profile.id,
          type: 'import',
          quantity: qtyPacks,
          status: 'approved',
          note: `Nhập kho lưu vào Kệ ${shelfNum} - Ô ${slotNum} - Cột ${colNum}`
        });

        showToast("Nhập kho thành công! Đã thêm vào hàng đợi in nhãn.", "success");
        setPrintQueue(prev => [saved, ...prev]);
        fetchDatabaseData();

        setImportQty('');
        setImportOrderNumber('');
        setImportBlendBatch('');
        setImportBoxSeq('');
        setImportBlendDateStr('');
        setImportPackagingDateStr('');
        setImportSamplingDateStr('');
        setImportSamplingHour(String(new Date().getHours()).padStart(2, '0'));
        setImportSamplingMinute(String(new Date().getMinutes()).padStart(2, '0'));
        setSuggestedLoc(null);
        setImportSearchQuery('');
        setImportProductId('');
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // Add or Edit Product in Catalog
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!catName) {
      showToast("Tên sản phẩm không được trống!", "error");
      return;
    }

    const warningCode = catIsExport ? (catWarning || null) : null;

    if (editingProduct) {
      // Edit Mode
      if (isDemoMode) {
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? {
          ...p,
          product_name: catName,
          warning_code: warningCode,
          is_export: catIsExport,
          format: catFormat
        } : p));
        showToast(`Đã cập nhật sản phẩm: ${catName}`, "success");
        setCatName('');
        setCatWarning('');
        setEditingProduct(null);
      } else {
        try {
          setLoading(true);
          const { error } = await supabase.from('products').update({
            product_name: catName,
            warning_code: warningCode,
            is_export: catIsExport,
            format: catFormat
          }).eq('id', editingProduct.id);
          
          if (error) throw error;
          showToast("Cập nhật sản phẩm thành công!", "success");
          setCatName('');
          setCatWarning('');
          setEditingProduct(null);
          fetchDatabaseData();
        } catch (e) {
          showToast(e.message, "error");
        } finally {
          setLoading(false);
        }
      }
    } else {
      // Create Mode
      const newProd = {
        id: `p-${Date.now()}`,
        product_name: catName,
        warning_code: warningCode,
        is_export: catIsExport,
        format: catFormat
      };

      if (isDemoMode) {
        setProducts(prev => [...prev, newProd]);
        showToast(`Đã thêm sản phẩm: ${catName} vào danh mục`, "success");
        setCatName('');
        setCatWarning('');
      } else {
        try {
          setLoading(true);
          const { error } = await supabase.from('products').insert({
            product_name: newProd.product_name,
            warning_code: newProd.warning_code,
            is_export: newProd.is_export,
            format: newProd.format
          });
          if (error) throw error;
          showToast("Thêm sản phẩm thành công!", "success");
          setCatName('');
          setCatWarning('');
          fetchDatabaseData();
        } catch (e) {
          showToast(e.message, "error");
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const startEditingProduct = (p) => {
    setEditingProduct(p);
    setCatName(p.product_name);
    setCatIsExport(p.is_export);
    setCatWarning(p.warning_code || '');
    setCatFormat(p.format);
  };

  const cancelEditingProduct = () => {
    setEditingProduct(null);
    setCatName('');
    setCatIsExport(false);
    setCatWarning('');
    setCatFormat('Kingsize');
  };

  // Xóa sản phẩm gốc (Đảm bảo an toàn ràng buộc dữ liệu)
  const handleDeleteProduct = async (productId, productName) => {
    // 1. Kiểm tra mẫu trong kho
    const hasSamples = samples.some(s => s.product_id === productId);
    
    // 2. Kiểm tra lịch sử giao dịch liên quan
    const hasTransactions = transactions.some(t => 
      t.samples?.product_id === productId || 
      (t.sample_id && samples.find(s => s.id === t.sample_id)?.product_id === productId)
    );

    if (hasSamples || hasTransactions) {
      window.alert(`Không thể xóa sản phẩm gốc "${productName}".\n\nSản phẩm này đang có mẫu thuốc lá lưu kho hoặc lịch sử giao dịch liên quan. Hãy đảm bảo bạn đã xóa hết các lô mẫu của sản phẩm này khỏi kho trước khi xóa sản phẩm gốc.`);
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa sản phẩm gốc "${productName}"? Hành động này không thể khôi phục.`)) {
      return;
    }

    if (isDemoMode) {
      setProducts(prev => prev.filter(p => p.id !== productId));
      showToast(`Đã xóa sản phẩm: ${productName}`, "success");
    } else {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('products')
          .delete()
          .eq('id', productId);
        
        if (error) throw error;
        showToast(`Xóa sản phẩm "${productName}" thành công!`, "success");
        fetchDatabaseData();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // Staff Search Execution
  const executeSearch = async (nameVal, monthVal) => {
    if (!nameVal) {
      showToast("Tên sản phẩm là bắt buộc!", "warning");
      return;
    }

    const searchLower = nameVal.toLowerCase().trim();
    let filtered = samples.filter(s => {
      const prodName = (s.products?.product_name || s.product_name || '').toLowerCase();
      return prodName.includes(searchLower) && s.status !== 'destroyed';
    });

    if (monthVal) {
      filtered = filtered.filter(s => {
        const pDate = new Date(s.packaging_date);
        const sYear = parseInt(monthVal.split('-')[0]);
        const sMonth = parseInt(monthVal.split('-')[1]);
        return pDate.getFullYear() === sYear && (pDate.getMonth() + 1) === sMonth;
      });
    }

    setSearchResults(filtered);
    if (filtered.length === 0) {
      showToast("Không tìm thấy mẫu phù hợp", "info");
    }

    // Ghi log tìm kiếm vào Supabase
    if (!isDemoMode && deviceId) {
      let currentName = 'Khách ẩn danh';
      if (profile) {
        currentName = profile.full_name || (profile.role === 'admin' ? 'Thủ kho (Admin)' : 'Nhân viên');
      } else {
        currentName = visitorName || localStorage.getItem('visitor_name') || 'Khách ẩn danh';
      }
      
      try {
        await supabase.from('search_logs').insert({
          device_id: deviceId,
          user_name: currentName,
          keyword: nameVal.trim(),
          month_filter: monthVal || null,
          results_count: filtered.length
        });
      } catch (e) {
        console.warn('Search log insert failed:', e);
      }
    }
  };

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    const monthVal = (searchSelYear && searchSelMonth) ? `${searchSelYear}-${searchSelMonth}` : '';
    executeSearch(searchName, monthVal);
  };

  // Phục vụ tính năng tìm kiếm động / thời gian thực khi gõ bất kỳ kí tự nào
  useEffect(() => {
    const trimmed = searchName.trim();
    if (trimmed.length >= 1) {
      // Lưu lại tab nghiệp vụ trước đó (nếu không phải search) và chuyển ngay sang tab search
      if (activeTab !== 'search') {
        setPreviousTabBeforeSearch(activeTab);
        setActiveTab('search');
      }

      const searchLower = trimmed.toLowerCase();
      const monthVal = (searchSelYear && searchSelMonth) ? (searchSelYear + '-' + searchSelMonth) : '';
      
      let filtered = samples.filter(s => {
        const prodName = (s.products?.product_name || s.product_name || '').toLowerCase();
        return prodName.includes(searchLower) && s.status !== 'destroyed';
      });

      if (monthVal) {
        filtered = filtered.filter(s => {
          const pDate = new Date(s.packaging_date);
          const sYear = parseInt(monthVal.split('-')[0]);
          const sMonth = parseInt(monthVal.split('-')[1]);
          return pDate.getFullYear() === sYear && (pDate.getMonth() + 1) === sMonth;
        });
      }
      setSearchResults(filtered);
    } else {
      // Nếu xóa hết ô tìm kiếm và đang ở tab search, tự động trả về tab nghiệp vụ trước đó
      if (activeTab === 'search') {
        setActiveTab(previousTabBeforeSearch || 'shelves');
      }
    }
  }, [searchName, searchSelMonth, searchSelYear]);

  const handleSearchInputChange = (val) => {
    setSearchName(val);
    if (val.trim().length >= 1) {
      const searchLower = val.toLowerCase().trim();
      const matches = products.filter(p => p.product_name.toLowerCase().includes(searchLower)).slice(0, 8);
      setSearchSuggestions(matches);
    } else {
      setSearchSuggestions([]);
    }
  };

  // Register Take Request (Staff)
  const handleTakeRequest = async (sample, qty, note) => {
    if (!qty || qty <= 0) {
      showToast("Số lượng lấy phải lớn hơn 0!", "error");
      return;
    }
    if (qty > sample.available_qty) {
      showToast(`Không đủ số lượng trong kho! Còn lại ${sample.available_qty} bao.`, "error");
      return;
    }

    if (isDemoMode) {
      const newTx = {
        id: `t-${Date.now()}`,
        sample_id: sample.id,
        samples: sample,
        user_id: profile?.id || 'guest',
        profiles: profile || { full_name: 'Nhân viên Khách' },
        type: 'take_request',
        quantity: parseInt(qty),
        status: 'pending',
        note: note || 'Lấy mẫu sử dụng',
        created_at: new Date().toISOString()
      };
      setTransactions(prev => [newTx, ...prev]);
      showToast("Đã gửi yêu cầu lấy mẫu! Chờ thủ kho xác nhận.", "success");
      
      // Update result quantity locally for preview
      setSearchResults(prev => prev.map(s => {
        if (s.id === sample.id) {
          return { ...s, available_qty: s.available_qty - qty };
        }
        return s;
      }));

      // Show location only after success
      const locStr = sample.shelf 
        ? formatLocation(sample.shelf, sample.slot, sample.column_number)
        : sample.box_id
          ? `Thùng ${boxes.find(b => b.id === sample.box_id)?.box_name || 'Không xác định'}`
          : sample.status === 'pending'
            ? `Khay số ${sample.tray_number || 'chưa đánh số'} (Chờ bố trí)`
            : 'Chưa xác định';

      setTakenLocationModal({
        product_name: sample.products?.product_name || sample.product_name,
        qty: parseInt(qty),
        location: locStr
      });
    } else {
      try {
        setLoading(true);
        const { error } = await supabase.from('transactions').insert({
          sample_id: sample.id,
          user_id: profile?.id || null, // safe fallback for guest to prevent crashes
          type: 'take_request',
          quantity: parseInt(qty),
          status: 'pending',
          note: note
        });
        if (error) throw error;
        showToast("Gửi yêu cầu thành công!", "success");
        fetchDatabaseData();

        // Show location only after success
        const locStr = sample.shelf 
          ? formatLocation(sample.shelf, sample.slot, sample.column_number)
          : sample.box_id
            ? `Thùng ${boxes.find(b => b.id === sample.box_id)?.box_name || 'Không xác định'}`
            : sample.status === 'pending'
              ? `Khay số ${sample.tray_number || 'chưa đánh số'} (Chờ bố trí)`
              : 'Chưa xác định';

        setTakenLocationModal({
          product_name: sample.products?.product_name || sample.product_name,
          qty: parseInt(qty),
          location: locStr
        });
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // Approve Take Request (Admin / Storekeeper)
  // Handles Ô Lẻ (Ô 5) rules!
  const handleApproveRequest = async (tx) => {
    const sample = tx.samples;
    const qtyToTake = tx.quantity;

    if (qtyToTake > sample.available_qty) {
      showToast("Số lượng mẫu trong kho không đủ để cấp!", "error");
      return;
    }

    let nextShelf = sample.shelf;
    let nextSlot = sample.slot;
    let nextColumn = sample.column_number;
    let newStatus = sample.status;

    // Calculate new quantity
    const newQty = sample.available_qty - qtyToTake;

    let isRemainingQtyLẻ = (newQty % 10) !== 0;
    
    // Loose Pack Rule (Ô 5):
    // If the remaining quantity of a sample stored in slots 1-4 is not a multiple of 10,
    // it must be immediately moved to Ô 5 (Ô lẻ) of the same shelf.
    if (sample.shelf && sample.slot && sample.slot <= 4 && isRemainingQtyLẻ) {
      nextSlot = 5;
      nextColumn = 1; // Database check_location requires column_number to not be null. We use 1 for general bin.
      showToast(`Giao dịch chứa số lượng lẻ. Di chuyển phần bao lẻ còn lại (${newQty} bao) vào ô lẻ ${formatLocation(sample.shelf, 5)}.`, "warning");
    }

    if (newQty === 0) {
      // Empty
      nextShelf = null;
      nextSlot = null;
      nextColumn = null;
      newStatus = 'destroyed';
    }

    if (isDemoMode) {
      // Update transaction status
      setTransactions(prev => prev.map(t => {
        if (t.id === tx.id) return { ...t, status: 'approved' };
        return t;
      }));

      // Update sample inventory
      setSamples(prev => prev.map(s => {
        if (s.id === sample.id) {
          return {
            ...s,
            available_qty: newQty,
            shelf: nextShelf,
            slot: nextSlot,
            column_number: nextColumn,
            status: newStatus
          };
        }
        return s;
      }));

      // Create transaction log for approval
      const approveTx = {
        id: `t-app-${Date.now()}`,
        sample_id: sample.id,
        samples: sample,
        user_id: profile?.id || 'admin',
        profiles: profile || { full_name: 'Thủ kho Demo' },
        type: 'take_approve',
        quantity: qtyToTake,
        status: 'approved',
        note: `Đã duyệt cấp ${qtyToTake} bao. Vị trí cũ: ${formatLocation(sample.shelf, sample.slot)}. Vị trí mới: ${nextSlot === 5 ? formatLocation(sample.shelf, 5) : 'Hết mẫu'}`,
        created_at: new Date().toISOString()
      };
      setTransactions(prev => [approveTx, ...prev]);
      showToast("Đã duyệt cấp mẫu thành công!", "success");
    } else {
      try {
        setLoading(true);
        // 1. Update Sample location and quantity
        const { error: sError } = await supabase
          .from('samples')
          .update({
            available_qty: newQty,
            shelf: nextShelf,
            slot: nextSlot,
            column_number: nextColumn,
            status: newStatus
          })
          .eq('id', sample.id);

        if (sError) throw sError;

        // 2. Update Transaction Status
        const { error: tError } = await supabase
          .from('transactions')
          .update({ status: 'approved' })
          .eq('id', tx.id);

        if (tError) throw tError;

        // 3. Create approval transaction log
        await supabase.from('transactions').insert({
          sample_id: sample.id,
          user_id: profile.id,
          type: 'take_approve',
          quantity: qtyToTake,
          status: 'approved',
          note: `Đã duyệt cấp ${qtyToTake} bao. Vị trí cũ: ${formatLocation(sample.shelf, sample.slot)}. Vị trí mới: ${nextSlot === 5 ? formatLocation(sample.shelf, 5) : 'Hết mẫu'}`
        });

        showToast("Đã phê duyệt cấp mẫu thành công!", "success");
        fetchDatabaseData();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // Cancel Take Request
  const handleCancelRequest = async (txId) => {
    if (isDemoMode) {
      setTransactions(prev => prev.map(t => {
        if (t.id === txId) return { ...t, status: 'cancelled' };
        return t;
      }));
      showToast("Đã từ chối/hủy yêu cầu", "info");
    } else {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('transactions')
          .update({ status: 'cancelled' })
          .eq('id', txId);
        if (error) throw error;
        showToast("Đã hủy yêu cầu", "info");
        fetchDatabaseData();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // Overcapacity Packaging (Đóng thùng mẫu cũ nhất)
  const handleOvercapacityBoxing = async () => {
    // 1. Filter all samples currently in shelves (stored)
    const storedSamples = samples.filter(s => s.status === 'stored' && s.shelf !== null);
    if (storedSamples.length === 0) {
      showToast("Không có mẫu nào trên kệ để đóng thùng!", "warning");
      return;
    }

    // 2. Sort by packaging_date (oldest first)
    const sorted = [...storedSamples].sort((a, b) => new Date(a.packaging_date) - new Date(b.packaging_date));
    
    // Choose the oldest 3 samples to box up (to make room)
    const samplesToBox = sorted.slice(0, Math.min(3, sorted.length));
    
    const boxName = `Thùng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
    const boxId = `b-${Date.now()}`;
    const newBox = {
      id: boxId,
      box_name: boxName,
      created_at: new Date().toISOString(),
      status: 'stored'
    };

    if (isDemoMode) {
      setBoxes(prev => [newBox, ...prev]);
      
      // Update samples state
      setSamples(prev => prev.map(s => {
        if (samplesToBox.some(x => x.id === s.id)) {
          return {
            ...s,
            shelf: null,
            slot: null,
            column_number: null,
            box_id: boxId,
            status: 'boxed'
          };
        }
        return s;
      }));

      showToast(`Đã đóng gói ${samplesToBox.length} mẫu cũ nhất vào ${boxName}`, "success");
      setManifestModal({ ...newBox, samples: samplesToBox });
    } else {
      try {
        setLoading(true);
        // Create box
        const { data: savedBox, error: bError } = await supabase
          .from('boxes')
          .insert({ box_name: boxName })
          .select()
          .single();

        if (bError) throw bError;

        // Update samples
        for (let s of samplesToBox) {
          const { error: sError } = await supabase
            .from('samples')
            .update({
              shelf: null,
              slot: null,
              column_number: null,
              box_id: savedBox.id,
              status: 'boxed'
            })
            .eq('id', s.id);
          
          if (sError) throw sError;
        }

        showToast(`Đóng thùng thành công vào ${boxName}!`, "success");
        setManifestModal({ ...savedBox, samples: samplesToBox });
        fetchDatabaseData();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // Confirm Sample Destruction (Hủy mẫu quá hạn 12 tháng)
  const handleDestroySample = async (sampleId) => {
    if (isDemoMode) {
      setSamples(prev => prev.map(s => {
        if (s.id === sampleId) {
          return {
            ...s,
            shelf: null,
            slot: null,
            column_number: null,
            box_id: null,
            status: 'destroyed',
            available_qty: 0
          };
        }
        return s;
      }));
      showToast("Đã hủy mẫu vật lý và cập nhật cơ sở dữ liệu", "success");
    } else {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('samples')
          .update({
            shelf: null,
            slot: null,
            column_number: null,
            box_id: null,
            status: 'destroyed',
            available_qty: 0
          })
          .eq('id', sampleId);
        
        if (error) throw error;
        showToast("Hủy mẫu thành công!", "success");
        fetchDatabaseData();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleMoveSample = async (sampleId, targetType, targetDetails) => {
    if (targetType === 'shelves') {
      const { shelf, slot, column_number } = targetDetails;
      if (!shelf || !slot) {
        showToast("Vui lòng chọn Kệ và Ô hợp lệ!", "warning");
        return;
      }
      
      if (slot !== 5) {
        if (!column_number) {
          showToast("Vui lòng chọn Cột!", "warning");
          return;
        }

        const samplesInCol = samples.filter(s => s.shelf === shelf && s.slot === slot && s.column_number === column_number && s.status === 'stored' && s.id !== sampleId);
        if (samplesInCol.length > 0) {
          const existingProd = samplesInCol[0].products?.product_name || samplesInCol[0].product_name;
          const movingProd = movingSample.products?.product_name || movingSample.product_name;
          if (existingProd !== movingProd) {
            showToast(`Cột ${column_number} đang chứa sản phẩm khác (${existingProd})! Không thể trộn lẫn sản phẩm.`, "error");
            return;
          }
        }

        const totalCartonsInCol = samples.filter(s => s.shelf === shelf && s.slot === slot && s.column_number === column_number && s.status === 'stored' && s.id !== sampleId)
          .reduce((sum, s) => sum + Math.ceil(s.available_qty / 10), 0);
        
        const movingCartons = Math.ceil(movingSample.available_qty / 10);
        const format = movingSample.products?.format || 'Kingsize';
        let maxHeight = FORMAT_CAPACITIES[format]?.height || 7;
        if (format === 'Kingsize') maxHeight = 6;

        if (totalCartonsInCol + movingCartons > maxHeight) {
          showToast(`Cột ${column_number} vượt quá chiều cao tối đa (${maxHeight} cây). Vui lòng xếp sang cột khác!`, "error");
          return;
        }
      }
    }

    let updates = {
      status: targetType === 'shelves' ? 'stored' : targetType === 'box' ? 'archived' : 'pending',
      shelf: targetType === 'shelves' ? targetDetails.shelf : null,
      slot: targetType === 'shelves' ? targetDetails.slot : null,
      column_number: (targetType === 'shelves' && targetDetails.slot !== 5) ? targetDetails.column_number : null,
      box_id: targetType === 'box' ? targetDetails.box_id : null,
      tray_number: targetType === 'pending' ? targetDetails.tray_number : null,
    };

    if (isDemoMode) {
      setSamples(prev => prev.map(s => {
        if (s.id === sampleId) {
          return { ...s, ...updates };
        }
        return s;
      }));

      const oldLoc = movingSample.shelf ? formatLocation(movingSample.shelf, movingSample.slot, movingSample.column_number) : movingSample.box_id ? `Thùng ${boxes.find(b => b.id === movingSample.box_id)?.box_name || '—'}` : `Khay ${movingSample.tray_number || '—'}`;
      const newLoc = targetType === 'shelves' ? formatLocation(targetDetails.shelf, targetDetails.slot, targetDetails.column_number) : targetType === 'box' ? `Thùng ${boxes.find(b => b.id === targetDetails.box_id)?.box_name || '—'}` : `Khay ${targetDetails.tray_number || '—'}`;
      
      const newTx = {
        id: `t-${Date.now()}`,
        sample_id: sampleId,
        samples: movingSample,
        user_id: profile?.id || 'admin',
        profiles: profile || { full_name: 'Thủ kho (Admin)' },
        type: 'move',
        quantity: movingSample.available_qty,
        status: 'completed',
        note: `Di chuyển mẫu từ ${oldLoc} sang ${newLoc}`,
        created_at: new Date().toISOString()
      };
      setTransactions(prev => [newTx, ...prev]);
      showToast("Di chuyển mẫu thành công!", "success");
      setMovingSample(null);
      setSelectedSlot(null);
    } else {
      try {
        setLoading(true);
        const { error } = await supabase.from('samples').update(updates).eq('id', sampleId);
        if (error) throw error;

        const oldLoc = movingSample.shelf ? formatLocation(movingSample.shelf, movingSample.slot, movingSample.column_number) : movingSample.box_id ? `Thùng ${boxes.find(b => b.id === movingSample.box_id)?.box_name || '—'}` : `Khay ${movingSample.tray_number || '—'}`;
        const newLoc = targetType === 'shelves' ? formatLocation(targetDetails.shelf, targetDetails.slot, targetDetails.column_number) : targetType === 'box' ? `Thùng ${boxes.find(b => b.id === targetDetails.box_id)?.box_name || '—'}` : `Khay ${targetDetails.tray_number || '—'}`;

        await supabase.from('transactions').insert({
          sample_id: sampleId,
          user_id: user.id,
          type: 'move',
          quantity: movingSample.available_qty,
          status: 'completed',
          note: `Di chuyển mẫu từ ${oldLoc} sang ${newLoc}`
        });

        await fetchSamples();
        showToast("Di chuyển mẫu thành công!", "success");
        setMovingSample(null);
        setSelectedSlot(null);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // Calculations for Expired samples (>12 months from packaging_date)
  const getExpiredSamples = () => {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    return samples.filter(
      s => s.status !== 'destroyed' && new Date(s.packaging_date) < twelveMonthsAgo
    );
  };

  const getApproachingExpiredSamples = () => {
    const elevenMonthsAgo = new Date();
    elevenMonthsAgo.setMonth(elevenMonthsAgo.getMonth() - 11);
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    return samples.filter(
      s => s.status !== 'destroyed' && 
           new Date(s.packaging_date) < elevenMonthsAgo && 
           new Date(s.packaging_date) >= twelveMonthsAgo
    );
  };

  // Generate Print View for Box packing list PDF
  const printBoxManifest = (box) => {
    const boxSamples = samples.filter(s => s.box_id === box.id);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
        <title>Danh sách mẫu đóng thùng - ${box.box_name}</title>
        <style>
          body { font-family: 'Outfit', sans-serif; padding: 40px; color: #333; }
          h1 { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f5f5f5; }
          .footer { margin-top: 50px; text-align: right; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>DANH SÁCH MẪU ĐÓNG THÙNG LƯU TRỮ</h1>
        <p><strong>Mã Thùng:</strong> ${box.id}</p>
        <p><strong>Tên Thùng:</strong> ${box.box_name}</p>
        <p><strong>Ngày đóng gói:</strong> ${new Date(box.created_at).toLocaleString()}</p>
        <p><strong>Trạng thái:</strong> Đang lưu trữ tại kho phụ</p>
        
        <table>
          <thead>
            <tr>
              <th>Mã SKU</th>
              <th>Tên Sản Phẩm</th>
              <th>Mẻ Sợi</th>
              <th>Ngày SX Bao</th>
              <th>Số lượng (Bao)</th>
              <th>Hạn Lưu Trữ (12T)</th>
            </tr>
          </thead>
          <tbody>
            ${boxSamples.map(s => {
              const packDate = new Date(s.packaging_date);
              const expDate = new Date(packDate.setMonth(packDate.getMonth() + 12)).toLocaleDateString();
              return `
                <tr>
                  <td>${s.sku}</td>
                  <td>${s.products?.product_name || s.product_name}</td>
                  <td>${formatBlendBatch(s.blend_batch)}</td>
                  <td>${new Date(s.packaging_date).toLocaleDateString()} ${formatSamplingBox(s.blend_batch)}</td>
                  <td>${s.available_qty}</td>
                  <td>${expDate}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>Xác nhận của thủ kho kho mẫu</p>
          <br/><br/>
          <p>__________________________</p>
        </div>
        <script>window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Generate Weekly Destruction list PDF
  const printDestructionManifest = () => {
    const expired = getExpiredSamples();
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
        <title>Báo cáo hủy mẫu định kỳ hàng tuần</title>
        <style>
          body { font-family: 'Outfit', sans-serif; padding: 40px; color: #333; }
          h1 { border-bottom: 2px solid #dc2626; padding-bottom: 10px; color: #dc2626; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #fef2f2; color: #991b1b; }
          .footer { margin-top: 50px; display: flex; justify-content: space-between; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>BÁO CÁO MẪU THUỐC LÁ QUÁ HẠN LƯU TRỮ (12 THÁNG)</h1>
        <p><strong>Ngày xuất báo cáo:</strong> ${new Date().toLocaleDateString()}</p>
        <p>Danh sách các mẫu thuốc lá đã quá thời hạn lưu trữ quy định 12 tháng kể từ ngày sản xuất bao. Yêu cầu làm việc với các bộ phận để tiến hành hủy vật lý.</p>
        
        <table>
          <thead>
            <tr>
              <th>Mã SKU</th>
              <th>Tên Sản Phẩm</th>
              <th>Vị Trí Hiện Tại</th>
              <th>Ngày SX Bao</th>
              <th>Tuổi Thọ (Tháng)</th>
              <th>Số lượng (Bao)</th>
            </tr>
          </thead>
          <tbody>
            ${expired.map(s => {
              const diffMonths = Math.floor((new Date() - new Date(s.packaging_date)) / (1000 * 60 * 60 * 24 * 30.5));
              const location = s.shelf ? formatLocation(s.shelf, s.slot, s.column_number) : `Thùng ${boxes.find(b => b.id === s.box_id)?.box_name || 'K/h'}`;
              return `
                <tr>
                  <td>${s.sku}</td>
                  <td>${s.products?.product_name || s.product_name}</td>
                  <td>${location}</td>
                  <td>${new Date(s.packaging_date).toLocaleDateString()}</td>
                  <td style="color:red; font-weight:bold;">${diffMonths} tháng</td>
                  <td>${s.available_qty}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <div>
            <p>Đại diện bộ phận QA/QC</p>
            <br/><br/>
            <p>__________________________</p>
          </div>
          <div>
            <p>Thủ kho xác nhận tiêu hủy</p>
            <br/><br/>
            <p>__________________________</p>
          </div>
        </div>
        <script>window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Batch print helper for multiple sticker labels
  // Batch print helper for multiple Tommy 135 sticker labels grouped by slot/box
  const printTommyStickersForGroup = (groupName, samplesInGroup) => {
    if (!samplesInGroup || samplesInGroup.length === 0) {
      showToast("Không có nhãn nào để in!", "warning");
      return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast("Không thể mở cửa sổ in. Vui lòng tắt trình chặn Pop-up!", "error");
      return;
    }

    // 1. Expand all samples in this group to individual sticker HTMLs
    const allStickers = [];
    samplesInGroup.forEach(s => {
      const numLabels = Math.max(1, Math.floor(s.available_qty / 10));
      const locText = s.box_id
        ? (boxes.find(b => b.id === s.box_id)?.box_name || 'ĐÓNG THÙNG')
        : formatLocation(s.shelf, s.slot, s.column_number);
      const boxSeqStr = s.blend_batch && s.blend_batch.split('|')[1] ? `Thùng số ${s.blend_batch.split('|')[1]}` : '—';

      for (let i = 0; i < numLabels; i++) {
        allStickers.push(`
          <div class="sticker">
            <div class="info-section">
              <div class="info-title">Nhãn Mẫu Thuốc Lá</div>
              <div class="info-row">
                <span class="info-label">Sản phẩm:</span>
                <span class="info-val" style="font-weight: bold; font-size: 9.5px;">${s.products?.product_name || s.product_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Cảnh báo:</span>
                <span class="info-val">${s.products?.warning_code || 'Không cảnh báo'}</span>
              </div>
              ${s.order_number ? `
              <div class="info-row">
                <span class="info-label">Số đơn hàng:</span>
                <span class="info-val">${s.order_number}</span>
              </div>` : ''}
              <div class="info-row">
                <span class="info-label">Mẻ sợi:</span>
                <span class="info-val">${formatBlendBatch(s.blend_batch)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thùng lấy mẫu:</span>
                <span class="info-val">${boxSeqStr}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX sợi:</span>
                <span class="info-val">${new Date(s.blend_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Ngày SX bao:</span>
                <span class="info-val">${new Date(s.packaging_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Thời điểm lấy mẫu:</span>
                <span class="info-val">${new Date(s.sampling_time).toLocaleString()}</span>
              </div>
              <div class="info-row" style="margin-top: 2px; border-top: 1px dashed #bbb; padding-top: 2px;">
                <span class="info-label">Vị trí lưu:</span>
                <span class="info-val" style="font-weight: bold; color: #000;">${locText.toUpperCase()}</span>
              </div>
            </div>
          </div>
        `);
      }
    });

    // 2. Chunk into pages of 21
    const pagesHtml = [];
    const PAGE_SIZE = 21;
    for (let i = 0; i < allStickers.length; i += PAGE_SIZE) {
      const pageStickers = allStickers.slice(i, i + PAGE_SIZE);
      
      // Pad last page with invisible stickers to preserve layout grid
      while (pageStickers.length < PAGE_SIZE) {
        pageStickers.push('<div class="sticker blank" style="border:none; visibility:hidden;"></div>');
      }

      pagesHtml.push(`
        <div class="page">
          ${pageStickers.join('')}
        </div>
      `);
    }

    printWindow.document.write(`
      <html>
      <head>
        <title>In Nhãn Tommy 135 — ${groupName}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: #fff;
          }
          .page {
            width: 210mm;
            height: 297mm;
            box-sizing: border-box;
            padding: 8.5mm 6mm; /* Tommy 135 standard margins */
            display: grid;
            grid-template-columns: repeat(3, 66mm);
            grid-template-rows: repeat(7, 40mm);
            grid-gap: 0;
            page-break-after: always;
          }
          .page:last-child {
            page-break-after: avoid;
          }
          .sticker {
            width: 66mm;
            height: 40mm;
            box-sizing: border-box;
            padding: 4px 10px; /* Increased horizontal padding to keep text safe from physical printer shifts */
            display: flex;
            border: 1px dashed #ddd; /* Preview grid borders */
            overflow: hidden;
          }
          @media print {
            .sticker {
              border: none;
            }
          }
          .info-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            font-size: 7.8px;
            line-height: 1.25;
            padding-top: 1px;
          }
          .info-title {
            font-size: 10px;
            font-weight: bold;
            margin-top: 0px;
            margin-bottom: 4px;
            border-bottom: 1px solid #000;
            padding-bottom: 1px;
            text-transform: uppercase;
            text-align: center;
          }
          .info-row {
            display: flex;
            margin-bottom: 1px;
          }
          .info-label {
            width: 22mm;
            font-weight: bold;
            flex-shrink: 0;
          }
          .info-val {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>
        ${pagesHtml.join('')}
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        </script>
      </body>
      </html>
    `);
  };

  const printAllReadyLabels = () => {
    // Filter out pending samples that don't have location
    const readySamples = printQueue.filter(s => s.status !== 'pending' && (s.shelf || s.box_id));
    if (readySamples.length === 0) {
      showToast("Không có nhãn nào có vị trí để in!", "warning");
      return;
    }

    // Group ready samples by tray_number
    const trayGroups = {};
    readySamples.forEach(s => {
      const tray = s.tray_number || 0;
      if (!trayGroups[tray]) {
        trayGroups[tray] = [];
      }
      trayGroups[tray].push(s);
    });

    // Sort tray numbers ascending
    const sortedTrays = Object.keys(trayGroups).map(Number).sort((a, b) => a - b);

    // Open a single print window
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast("Không thể mở cửa sổ in. Vui lòng tắt trình chặn Pop-up!", "error");
      return;
    }

    const pagesHtml = [];

    // Loop through each tray to output separate printing pages
    sortedTrays.forEach(trayNum => {
      const samplesInTray = trayGroups[trayNum];
      
      // Sort samples within this tray by created_at ascending (the order of input)
      const sortedSamplesInTray = [...samplesInTray].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      // Expand to individual stickers
      const trayStickers = [];
      sortedSamplesInTray.forEach(s => {
        const numLabels = Math.max(1, Math.floor(s.available_qty / 10));
        const locText = s.box_id
          ? (boxes.find(b => b.id === s.box_id)?.box_name || 'ĐÓNG THÙNG')
          : formatLocation(s.shelf, s.slot, s.column_number);
        const boxSeqStr = s.blend_batch && s.blend_batch.split('|')[1] ? `Thùng số ${s.blend_batch.split('|')[1]}` : '—';

        for (let i = 0; i < numLabels; i++) {
          trayStickers.push(`
            <div class="sticker">
              <div class="info-section">
                <div class="info-title">Nhãn Mẫu Thuốc Lá</div>
                <div class="info-row">
                  <span class="info-label">Sản phẩm:</span>
                  <span class="info-val" style="font-weight: bold; font-size: 9.5px;">${s.products?.product_name || s.product_name}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Cảnh báo:</span>
                  <span class="info-val">${s.products?.warning_code || 'Không cảnh báo'}</span>
                </div>
                ${s.order_number ? `
                <div class="info-row">
                  <span class="info-label">Số đơn hàng:</span>
                  <span class="info-val">${s.order_number}</span>
                </div>` : ''}
                <div class="info-row">
                  <span class="info-label">Mẻ sợi:</span>
                  <span class="info-val">${formatBlendBatch(s.blend_batch)}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Thùng lấy mẫu:</span>
                  <span class="info-val">${boxSeqStr}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Ngày SX sợi:</span>
                  <span class="info-val">${new Date(s.blend_date).toLocaleDateString()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Ngày SX bao:</span>
                  <span class="info-val">${new Date(s.packaging_date).toLocaleDateString()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Thời điểm lấy mẫu:</span>
                  <span class="info-val">${new Date(s.sampling_time).toLocaleString()}</span>
                </div>
                <div class="info-row" style="margin-top: 2px; border-top: 1px dashed #bbb; padding-top: 2px;">
                  <span class="info-label">Vị trí lưu:</span>
                  <span class="info-val" style="font-weight: bold; color: #000;">${locText.toUpperCase()}</span>
                </div>
              </div>
            </div>
          `);
        }
      });

      // Pad with blank stickers to fill the last A4 Tommy 135 page (21 stickers) for this tray
      const PAGE_SIZE = 21;
      const numPagesForTray = Math.ceil(trayStickers.length / PAGE_SIZE);
      const totalStickersToPrint = numPagesForTray * PAGE_SIZE;
      
      while (trayStickers.length < totalStickersToPrint) {
        trayStickers.push('<div class="sticker blank" style="border:none; visibility:hidden;"></div>');
      }

      // Generate HTML pages for this tray
      for (let i = 0; i < trayStickers.length; i += PAGE_SIZE) {
        const pageStickers = trayStickers.slice(i, i + PAGE_SIZE);
        pagesHtml.push(`
          <div class="page">
            ${pageStickers.join('')}
          </div>
        `);
      }
    });

    // Write all pages to document
    printWindow.document.write(`
      <html>
      <head>
        <title>In Nhãn Tommy Hàng Loạt Theo Khay</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: #fff;
          }
          .page {
            width: 210mm;
            height: 297mm;
            box-sizing: border-box;
            padding: 8.5mm 6mm; /* Tommy 135 standard margins */
            display: grid;
            grid-template-columns: repeat(3, 66mm);
            grid-template-rows: repeat(7, 40mm);
            grid-gap: 0;
            page-break-after: always;
          }
          .page:last-child {
            page-break-after: avoid;
          }
          .sticker {
            width: 66mm;
            height: 40mm;
            box-sizing: border-box;
            padding: 4px 10px;
            display: flex;
            border: 1px dashed #ddd;
            overflow: hidden;
          }
          @media print {
            .sticker {
              border: none;
            }
          }
          .info-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            font-size: 7.8px;
            line-height: 1.25;
            padding-top: 1px;
          }
          .info-title {
            font-size: 10px;
            font-weight: bold;
            margin-top: 0px;
            margin-bottom: 4px;
            border-bottom: 1px solid #000;
            padding-bottom: 1px;
            text-transform: uppercase;
            text-align: center;
          }
          .info-row {
            display: flex;
            margin-bottom: 1px;
          }
          .info-label {
            width: 22mm;
            font-weight: bold;
            flex-shrink: 0;
          }
          .info-val {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>
        ${pagesHtml.join('')}
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getGroupedPrintQueue = () => {
    const groups = {};
    printQueue.forEach(s => {
      let trayNum = s.tray_number;
      if (trayNum === null || trayNum === undefined || isNaN(trayNum)) {
        trayNum = 0;
      }
      const key = `tray-${trayNum}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          trayNumber: trayNum,
          name: trayNum === 0 ? 'Mẫu Chưa Phân Khay' : `Khay Số ${trayNum}`,
          items: [],
          type: 'tray'
        };
      }
      groups[key].items.push(s);
    });
    Object.values(groups).forEach(g => {
      g.items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    });
    return Object.values(groups).sort((a, b) => a.trayNumber - b.trayNumber);
  };

  // Generate Print View for QR Sticker Label
  const printQrSticker = (sample) => {
    const printWindow = window.open('', '_blank');
    const qrData = JSON.stringify({
      sku: sample.sku,
      product: sample.products?.product_name || sample.product_name,
      warning: sample.products?.warning_code || 'Không',
      order: sample.order_number || 'N/A',
      blend_batch: sample.blend_batch,
      blend_date: sample.blend_date,
      packaging_date: sample.packaging_date,
      sampling_time: sample.sampling_time,
      location: formatLocation(sample.shelf, sample.slot, sample.column_number)
    });
    
    const encodedQrData = encodeURIComponent(qrData);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodedQrData}`;
    
    printWindow.document.write(`
      <html>
      <head>
        <title>In nhãn cây mẫu - ${sample.sku}</title>
        <style>
          @page { size: 100mm 75mm; margin: 0; }
          body {
            font-family: 'Outfit', -apple-system, sans-serif;
            margin: 0;
            padding: 10px;
            width: 100mm;
            height: 75mm;
            box-sizing: border-box;
            color: #000;
            background: #fff;
          }
          .sticker-container {
            display: flex;
            gap: 12px;
            height: 100%;
            border: 1px solid #000;
            padding: 6px;
            box-sizing: border-box;
            border-radius: 4px;
          }
          .left-side {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 35%;
          }
          .qr-img {
            width: 100px;
            height: 100px;
          }
          .sku-code {
            font-size: 11px;
            font-weight: 800;
            margin-top: 6px;
            letter-spacing: 0.5px;
          }
          .right-side {
            width: 65%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .title {
            font-size: 12px;
            font-weight: 800;
            border-bottom: 1.5px solid #000;
            padding-bottom: 2px;
            margin-bottom: 4px;
            text-transform: uppercase;
            text-align: center;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-table td {
            font-size: 9px;
            padding: 2px 0;
            vertical-align: top;
            line-height: 1.2;
          }
          .label {
            font-weight: bold;
            width: 75px;
          }
          .val {
            color: #111;
          }
        </style>
      </head>
      <body>
        <div class="sticker-container">
          <div class="left-side">
            <img class="qr-img" src="${qrUrl}" alt="QR" />
            <div class="sku-code">${sample.sku}</div>
          </div>
          <div class="right-side">
            <div class="title">NHÃN THUỐC LÁ MẪU</div>
            <table class="info-table">
              <tr>
                <td class="label">Sản phẩm:</td>
                <td class="val"><strong>${sample.products?.product_name || sample.product_name}</strong></td>
              </tr>
              <tr>
                <td class="label">Cảnh báo bao:</td>
                <td class="val">${sample.products?.warning_code || 'Không cảnh báo'}</td>
              </tr>
              <tr>
                <td class="label">Mẻ sợi:</td>
                <td class="val">${formatBlendBatch(sample.blend_batch)}</td>
              </tr>
              <tr>
                <td class="label">Ngày SX sợi:</td>
                <td class="val">${new Date(sample.blend_date).toLocaleDateString()}</td>
              </tr>
              <tr>
                <td class="label">Ngày SX bao:</td>
                <td class="val">${new Date(sample.packaging_date).toLocaleDateString()} ${formatSamplingBox(sample.blend_batch)}</td>
              </tr>
              <tr>
                <td class="label">Thời gian lấy:</td>
                <td class="val">${new Date(sample.sampling_time).toLocaleString()}</td>
              </tr>
              ${sample.order_number ? `
              <tr>
                <td class="label">Số đơn hàng XK:</td>
                <td class="val">${sample.order_number}</td>
              </tr>
              ` : ''}
              <tr>
                <td class="label">Vị trí lưu kho:</td>
                <td class="val" style="font-weight:bold;">${formatLocation(sample.shelf, sample.slot, sample.column_number)}</td>
              </tr>
            </table>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 300);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Helper calculation: Column utilization
  const getColumnHeight = (shelf, slot, col) => {
    const colSamples = samples.filter(s => s.shelf === shelf && s.slot === slot && s.column_number === col && s.status === 'stored');
    const totalPacks = colSamples.reduce((sum, s) => sum + s.available_qty, 0);
    return Math.ceil(totalPacks / 10); // return in cartons (cây)
  };

  const getColumnProduct = (shelf, slot, col) => {
    const colSamples = samples.filter(s => s.shelf === shelf && s.slot === slot && s.column_number === col && s.status === 'stored');
    return colSamples.length > 0 ? colSamples[0] : null;
  };

  return (
    <div className="app-container">
      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' && <Check size={18} style={{ color: 'var(--status-success)' }} />}
            {t.type === 'error' && <X size={18} style={{ color: 'var(--status-error)' }} />}
            {t.type === 'info' && <Info size={18} style={{ color: 'var(--status-info)' }} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Header bar */}
      <header className="app-header">
        <div className="logo-container">
          <Layers size={28} className="logo-icon" />
          <h1 className="logo-text">KHO THUỐC LÁ MẪU</h1>
          {isDemoMode && <span style={{ fontSize: '12px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--status-warning)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.4)', fontWeight: 'bold' }}>Offline Demo</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {user || profile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Admin Notification Bell */}
              {profile?.role === 'admin' && (
                <div style={{ position: 'relative' }}>
                  <button
                    className="theme-toggle"
                    style={{ position: 'relative', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => { setShowNotifDropdown(v => !v); setUnreadCount(0); }}
                    title="Thông báo"
                  >
                    <Bell size={20} />
                    {unreadCount > 0 && (
                      <span style={{
                        position: 'absolute', top: '-2px', right: '-2px',
                        background: 'var(--status-error)', color: '#fff',
                        fontSize: '9px', fontWeight: 'bold',
                        padding: '1px 4px', borderRadius: '10px',
                        minWidth: '16px', textAlign: 'center',
                        lineHeight: '12px'
                      }}>{unreadCount}</span>
                    )}
                  </button>

                  {/* Notification Dropdown */}
                  {showNotifDropdown && (
                    <div style={{
                      position: 'absolute', top: '48px', right: 0,
                      width: '320px', maxHeight: '420px', overflowY: 'auto',
                      background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)',
                      borderRadius: '12px', boxShadow: '0 8px 32px var(--glass-shadow)',
                      backdropFilter: 'blur(16px)', zIndex: 1000
                    }}>
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>🔔 Thông báo</span>
                        {notifications.length > 0 && (
                          <button style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                            onClick={() => setNotifications([])}>
                            Xóa tất cả
                          </button>
                        )}
                      </div>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                          <Bell size={28} style={{ opacity: 0.3, marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />
                          Không có thông báo mới
                        </div>
                      ) : (
                        notifications.map((n, i) => (
                          <div key={n.id + i} style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            display: 'flex', gap: '10px', alignItems: 'flex-start',
                            textAlign: 'left'
                          }}>
                            <span style={{ fontSize: '20px', flexShrink: 0 }}>{n.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px', color: 'var(--text-primary)' }}>{n.title}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{n.time}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{profile?.full_name || 'Người dùng'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{profile?.role === 'admin' ? 'Thủ kho (Admin)' : 'Nhân viên'}</div>
              </div>
              <button className="theme-toggle" onClick={handleLogout} title="Đăng xuất">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              {authMode !== 'guest' && (
                <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => setAuthMode('guest')}>
                  Truy cập Staff (Khách)
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* LOGIN OR SIGNUP OVERLAY FOR ADMIN/STAFF */}
      {(!user && !profile && authMode !== 'guest') ? (
        <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, padding: '40px 0' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '420px' }}>
            <h2 style={{ marginBottom: '24px', textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>
              {authMode === 'login' ? 'Đăng Nhập Hệ Thống' : 'Tạo Tài Khoản'}
            </h2>
            
            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {authMode === 'signup' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Họ và tên</label>
                    <input className="form-input" type="text" required value={authFullName} onChange={e => setAuthFullName(e.target.value)} placeholder="Nguyễn Văn A" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mã nhân viên</label>
                    <input className="form-input" type="text" required value={authEmployeeCode} onChange={e => setAuthEmployeeCode(e.target.value)} placeholder="QC-001" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vai trò</label>
                    <select className="form-select" value={authRole} onChange={e => setAuthRole(e.target.value)}>
                      <option value="staff">Nhân viên (Chỉ Tìm kiếm & Đăng ký lấy)</option>
                      <option value="admin">Thủ kho (Quản trị & Phê duyệt)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">Email đăng nhập</label>
                <input className="form-input" type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="email@gmail.com" />
              </div>

              <div className="form-group">
                <label className="form-label">Mật khẩu</label>
                <input className="form-input" type="password" required value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="••••••••" />
              </div>

              <button className="btn btn-primary" type="submit" style={{ marginTop: '8px' }} disabled={loading}>
                {loading ? <Loader className="logo-icon" size={18} /> : (authMode === 'login' ? 'Đăng Nhập' : 'Đăng Ký')}
              </button>
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {authMode === 'login' ? (
                <p>
                  Chưa có tài khoản?{' '}
                  <span style={{ color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setAuthMode('signup')}>
                    Đăng ký ngay
                  </span>
                </p>
              ) : (
                <p>
                  Đã có tài khoản?{' '}
                  <span style={{ color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setAuthMode('login')}>
                    Đăng nhập
                  </span>
                </p>
              )}
            </div>

            {isDemoMode && authMode === 'login' && (
              <div style={{ marginTop: '20px', padding: '12px', border: '1px dashed var(--status-warning)', borderRadius: '8px', background: 'rgba(245,158,11,0.03)', fontSize: '13px' }}>
                <div style={{ fontWeight: 'bold', color: 'var(--status-warning)', marginBottom: '8px', textAlign: 'center' }}>Tài khoản Demo Đăng nhập nhanh:</div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => {
                    setAuthEmail('admin@gmail.com');
                    setAuthPassword('admin123');
                    setAuthRole('admin');
                    const mockUser = { id: 'admin', email: 'admin@gmail.com' };
                    const mockProfile = { id: 'admin', full_name: 'Thủ kho (Admin)', employee_code: 'TK-001', role: 'admin', department: 'QC' };
                    setUser(mockUser);
                    setProfile(mockProfile);
                    showToast("Đăng nhập Thủ kho (Admin) thành công!", "success");
                    setActiveTab('shelves');
                  }}>Thủ kho (Admin)</button>
                  
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => {
                    setAuthEmail('staff@gmail.com');
                    setAuthPassword('staff123');
                    setAuthRole('staff');
                    const mockUser = { id: 'staff', email: 'staff@gmail.com' };
                    const mockProfile = { id: 'staff', full_name: 'Nhân viên QC A', employee_code: 'NV-9902', role: 'staff', department: 'Sản xuất' };
                    setUser(mockUser);
                    setProfile(mockProfile);
                    showToast("Đăng nhập Nhân viên (Staff) thành công!", "success");
                    setActiveTab('search');
                  }}>Nhân viên (Staff)</button>
                </div>
              </div>
            )}
          </div>
        </main>
      ) : (
        /* APPLICATION WORKSPACE */
        <div style={{ display: 'flex', flex: 1, gap: '24px', flexDirection: 'column' }}>
          
          {/* TAB NAVIGATION BAR (Chỉ chứa các nút quản lý, tìm kiếm đã được trích xuất lên trên) */}
          <div className="glass-panel" style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className={`btn ${activeTab === 'shelves' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('shelves')}>
                <Database size={16} /> Sơ Đồ Kệ Kho
              </button>

              {/* Admin-only Tabs */}
              {(profile?.role === 'admin') && (
                <>
                  <button className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('import')}>
                    <Plus size={16} /> Nhập Kho Mẫu
                  </button>
                  <button className={`btn ${activeTab === 'labels' ? 'btn-primary' : 'btn-secondary'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setActiveTab('labels')}>
                    <QrCode size={16} /> In Nhãn Hàng Loạt
                    {printQueue.length > 0 && (
                      <span style={{ background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                        {printQueue.length}
                      </span>
                    )}
                  </button>
                  <button className={`btn ${activeTab === 'catalog' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('catalog')}>
                    <ClipboardList size={16} /> Danh Mục Gốc
                  </button>
                  <button className={`btn ${activeTab === 'requests' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('requests')}>
                    <ArrowRightLeft size={16} />
                    Yêu Cầu Lấy Mẫu
                    {transactions.filter(t => t.status === 'pending').length > 0 && (
                      <span style={{ background: 'var(--status-error)', color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold', marginLeft: '4px' }}>
                        {transactions.filter(t => t.status === 'pending').length}
                      </span>
                    )}
                  </button>
                  <button className={`btn ${activeTab === 'bulk_import' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('bulk_import')} style={{ background: activeTab === 'bulk_import' ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : undefined, borderColor: activeTab === 'bulk_import' ? '#7c3aed' : undefined }}>
                    <UploadCloud size={16} /> Nhập Hàng Loạt
                  </button>
                  <button className={`btn ${activeTab === 'archives' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('archives')}>
                    <Archive size={16} /> Đóng Thùng & Hủy
                    {getExpiredSamples().length > 0 && (
                      <span style={{ background: 'var(--status-error)', color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold', marginLeft: '4px' }}>
                        {getExpiredSamples().length} quá hạn
                      </span>
                    )}
                  </button>
                  <button className={`btn ${activeTab === 'search_logs' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setActiveTab('search_logs'); fetchSearchLogs(); }} style={{ background: activeTab === 'search_logs' ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : undefined, borderColor: activeTab === 'search_logs' ? '#0ea5e9' : undefined }}>
                    <FileText size={16} /> Nhật Ký Tìm Kiếm
                  </button>
                </>
              )}
            </div>

            {/* Back button from Guest Mode */}
            {authMode === 'guest' && (
              <button className="btn btn-secondary" style={{ borderColor: 'var(--status-warning)', color: 'var(--status-warning)' }} onClick={() => setAuthMode('login')}>
                Thoát Khách (Đăng Nhập Admin)
              </button>
            )}
          </div>

                    {/* GLOBAL SEARCH PANEL (Luôn hiện ở trên cùng của không gian làm việc) */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={20} color="var(--accent-blue)" /> Tra Cứu Và Tìm Kiếm Thuốc Lá Mẫu
            </h2>
            
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end', position: 'relative' }}>
              <div className="form-group" style={{ flex: 2, minWidth: '240px', marginBottom: 0, position: 'relative' }}>
                <label className="form-label">Tên sản phẩm thuốc lá <span style={{ color: 'red' }}>*</span></label>
                <input 
                  className="form-input" 
                  type="text" 
                  required 
                  placeholder="Nhập tên sản phẩm (ví dụ: 555, Canyon...)" 
                  value={searchName} 
                  onChange={e => handleSearchInputChange(e.target.value)} 
                  onBlur={() => setTimeout(() => setSearchSuggestions([]), 200)}
                  autoComplete="off"
                />
                
                {/* Real-time Search Suggestions Autocomplete */}
                {searchSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '75px',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--border-radius-sm)',
                    boxShadow: '0 8px 32px var(--glass-shadow)',
                    zIndex: 100,
                    maxHeight: '220px',
                    overflowY: 'auto',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)'
                  }}>
                    {searchSuggestions.map(p => (
                      <div 
                        key={p.id} 
                        style={{
                          padding: '10px 16px',
                          cursor: 'pointer',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                          transition: 'background 0.2s',
                          fontSize: '14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          color: 'var(--text-primary)'
                        }}
                        onMouseDown={() => {
                          setSearchName(p.product_name);
                          setSearchSuggestions([]);
                          const monthVal = (searchSelYear && searchSelMonth) ? (searchSelYear + '-' + searchSelMonth) : '';
                          executeSearch(p.product_name, monthVal);
                        }}
                        className="suggestion-item"
                      >
                        <span style={{ fontWeight: 600 }}>{p.product_name}</span>
                        {p.warning_code && <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>{p.warning_code}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '220px', marginBottom: 0 }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Tháng sản xuất (Tháng)</label>
                  <select className="form-select" value={searchSelMonth} onChange={e => setSearchSelMonth(e.target.value)}>
                    <option value="">Tất cả</option>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <option key={m} value={String(m).padStart(2, '0')}>Tháng {m}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">Tháng sản xuất (Năm)</label>
                  <select className="form-select" value={searchSelYear} onChange={e => setSearchSelYear(e.target.value)}>
                    <option value="">Tất cả</option>
                    {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button className="btn btn-primary" type="submit" style={{ height: '45px', padding: '0 24px' }}>
                <Search size={16} /> Tìm kiếm
              </button>
            </form>
          </div>

          {/* TAB CONTENTS */}
          <div style={{ flex: 1 }}>
            {activeTab === 'search' && (
              <div className="glass-panel">
                {/* SEARCH RESULTS */}
                <div>
                  <h3 style={{ fontSize: '18px', color: 'var(--text-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Search size={20} color="var(--accent-blue)" /> Kết quả tìm kiếm thuốc lá mẫu (${searchResults.length})
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {searchResults.map(s => {
                      const ageMonths = Math.floor((new Date() - new Date(s.packaging_date)) / (1000 * 60 * 60 * 24 * 30.5));
                      const isExpired = ageMonths >= 12;
                      const isWarn = ageMonths === 11;
                      
                      const qtyVal = takeQuantities[s.id] || '';
                      const qtyInt = parseInt(qtyVal);
                      const isValidQty = !isNaN(qtyInt) && qtyInt > 0 && qtyInt <= s.available_qty;
                      
                      return (
                        <div key={s.id} className="glass-panel" style={{ borderLeft: `4px solid ${isExpired ? 'var(--status-error)' : isWarn ? 'var(--status-warning)' : 'var(--accent-blue)'}`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                          <div style={{ flex: 1, minWidth: '280px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <h4 style={{ fontSize: '18px', fontWeight: 'bold' }}>{s.products?.product_name || s.product_name}</h4>
                              <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>{s.products?.format}</span>
                              {s.products?.is_export && <span style={{ fontSize: '12px', background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>Xuất Khẩu</span>}
                              {isExpired && <span style={{ fontSize: '12px', background: 'rgba(239,68,68,0.15)', color: 'var(--status-error)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>Quá Hạn Lưu Trữ ({ageMonths}T)</span>}
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                              <div><strong>Mẻ sợi:</strong> {formatBlendBatch(s.blend_batch)}</div>
                              <div><strong>Ngày SX bao:</strong> {new Date(s.packaging_date).toLocaleDateString()} {formatSamplingBox(s.blend_batch)}</div>
                              <div><strong>Tồn khả dụng:</strong> <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{s.available_qty} bao</span> ({Math.floor(s.available_qty/10)} cây, {s.available_qty%10} bao lẻ)</div>
                              {s.order_number && <div><strong>Số đơn hàng:</strong> {s.order_number}</div>}
                              <div><strong>Cảnh báo bao:</strong> {s.products?.warning_code || 'Không'}</div>
                              <div><strong>Vị trí hiện tại:</strong> <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>
                                {s.shelf 
                                  ? formatLocation(s.shelf, s.slot, s.column_number) 
                                  : s.box_id 
                                    ? `Thùng ${boxes.find(b => b.id === s.box_id)?.box_name || '—'}` 
                                    : s.status === 'pending'
                                      ? `Khay số ${s.tray_number || '—'} (Chờ bố trí)`
                                      : 'Chưa xác định'}
                              </span></div>
                              {s.note && (
                                <div style={{ gridColumn: 'span 3', padding: '6px 12px', background: 'rgba(245,158,11,0.06)', border: '1px dashed rgba(245,158,11,0.25)', borderRadius: '6px', marginTop: '4px', fontSize: '12.5px' }}>
                                  <strong>Ghi chú:</strong> <span style={{ color: '#f59e0b', fontWeight: '500' }}>{s.note}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* TAKE SAMPLE REQUEST ACTION AREA */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', minWidth: '260px' }}>
                            {s.available_qty > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                <div style={{ display: 'flex', width: '100%' }}>
                                  <input 
                                    type="number"
                                    className="form-input"
                                    style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
                                    placeholder="Nhập số bao cần lấy..."
                                    min="1"
                                    max={s.available_qty}
                                    value={takeQuantities[s.id] || ''}
                                    onChange={e => setTakeQuantities(prev => ({ ...prev, [s.id]: e.target.value }))}
                                  />
                                </div>

                                {/* Vị trí sẽ hiển thị sau khi nhấn xác nhận */}

                                <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'flex-end' }}>
                                  <button 
                                    className="btn btn-primary" 
                                    style={{ height: '36px', padding: '0 16px', fontSize: '13px', flex: (profile?.role === 'admin') ? 1 : undefined }}
                                    disabled={!isValidQty}
                                    onClick={() => {
                                      handleTakeRequest(s, qtyInt, 'Nhân viên lấy mẫu');
                                      setTakeQuantities(prev => {
                                        const copy = { ...prev };
                                        delete copy[s.id];
                                        return copy;
                                      });
                                    }}
                                  >
                                    Xác nhận lấy mẫu
                                  </button>
                                  {profile?.role === 'admin' && (
                                    <button 
                                      className="btn btn-secondary" 
                                      style={{ height: '36px', padding: '0 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
                                      onClick={() => setMovingSample(s)}
                                    >
                                      <Move size={14} /> Di chuyển
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '14px' }}>Hết mẫu</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {searchResults.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        Vui lòng nhập từ khóa tên sản phẩm thuốc lá và ấn Tìm kiếm.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SHELVES GRID VISUALIZATION */}
            {activeTab === 'shelves' && (
              <div className="glass-panel">
                <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={22} color="var(--accent-blue)" /> Sơ Đồ Không Gian Kho Lưu (6 Kệ x 5 Ô)
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
                  Nhấp vào một ô để xem chi tiết cách sắp xếp cây thuốc theo cột và chiều cao xếp chồng đứng (cột * cao). Ô 5 là ô dành riêng chứa bao lẻ bóc cây.
                </p>

                {/* THE 6 KỆ VERTICAL COLS STANDING SIDE-BY-SIDE */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '20px', overflowX: 'auto', paddingBottom: '10px' }}>
                  {[1, 2, 3, 4, 5, 6].map(shelf => {
                    const shelfLetter = ['', 'A', 'B', 'C', 'D', 'E', 'F'][shelf];
                    return (
                      <div key={shelf} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--glass-border)', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--text-primary)', textAlign: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px', marginBottom: '4px' }}>
                          KỆ {shelfLetter} ({shelf})
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {[1, 2, 3, 4, 5].map(slot => {
                            const slotSamples = samples.filter(s => s.shelf === shelf && s.slot === slot && s.status === 'stored');
                            const isLooseSlot = slot === 5;
                            
                            // Calculate slot fullness/utilization
                            let totalItems = 0;
                            let utilization = 0;

                            if (!isLooseSlot && slotSamples.length > 0) {
                              slotSamples.forEach(s => {
                                const format = s.products?.format || 'Kingsize';
                                const cap = FORMAT_CAPACITIES[format]?.total || 42;
                                totalItems += s.available_qty / 10; // in cartons (cây)
                                utilization += (s.available_qty / 10) / cap;
                              });
                            } else if (isLooseSlot) {
                              totalItems = slotSamples.reduce((sum, s) => sum + s.available_qty, 0); // packs (bao)
                            }

                            const uPct = Math.min(Math.round(utilization * 100), 100);
                            const isFull = uPct >= 100;
                            const hasItems = slotSamples.length > 0;

                            const config = slotConfigs.find(c => c.shelf === shelf && c.slot === slot);
                            const slotIsMarkedFull = config?.is_full || false;
                            const slotNote = config?.note || '';

                            return (
                              <div 
                                key={slot} 
                                className="glass-panel" 
                                style={{ 
                                  padding: '14px 12px', 
                                  cursor: 'pointer', 
                                  background: slotIsMarkedFull ? 'rgba(239, 68, 68, 0.08)' : isLooseSlot ? 'rgba(139, 92, 246, 0.05)' : hasItems ? 'rgba(59, 130, 246, 0.05)' : 'var(--glass-bg)', 
                                  borderColor: slotIsMarkedFull ? 'var(--status-error)' : isLooseSlot ? 'rgba(139, 92, 246, 0.3)' : isFull ? 'var(--status-error)' : hasItems ? 'var(--accent-blue)' : 'var(--glass-border)', 
                                  borderWidth: slotIsMarkedFull ? '2px' : '1px',
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  gap: '8px', 
                                  position: 'relative', 
                                  overflow: 'hidden',
                                  transition: 'transform 0.2s, box-shadow 0.2s'
                                }} 
                                onClick={() => setSelectedSlot({ shelf, slot })}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px' }}>
                                  <span>{shelfLetter}{slot} {isLooseSlot && '(Lẻ)'}</span>
                                  {slotIsMarkedFull ? (
                                    <span style={{ color: 'var(--status-error)', fontSize: '10px', background: 'rgba(239,68,68,0.15)', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>ĐẦY</span>
                                  ) : (
                                    hasItems && !isLooseSlot && <span style={{ color: isFull ? 'var(--status-error)' : 'var(--accent-blue)' }}>{uPct}%</span>
                                  )}
                                </div>

                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                {hasItems ? (
                                  isLooseSlot ? (
                                    <span>Đang chứa: <strong>{totalItems} bao</strong></span>
                                  ) : (
                                    <span>Đang xếp: <strong>{Math.ceil(totalItems)} cây</strong></span>
                                  )
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>{slotIsMarkedFull ? 'Báo đầy (Trống)' : 'Trống'}</span>
                                )}
                              </div>

                              {slotNote && (
                                <div style={{ fontSize: '10.5px', color: '#f59e0b', fontStyle: 'italic', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={slotNote}>
                                  📝 {slotNote}
                                </div>
                              )}

                              {/* Visual filling gauge */}
                              {hasItems && !isLooseSlot && !slotIsMarkedFull && (
                                <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${uPct}%`, background: isFull ? 'var(--status-error)' : 'var(--accent-gradient)' }}></div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}

            {/* IMPORT NEW SAMPLES PAGE */}
            {activeTab === 'import' && (
              <div className="glass-panel">
                <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={22} color="var(--accent-blue)" /> Nhập Thuốc Lá Mẫu Vào Kho Lưu
                </h2>

                <form onSubmit={handleImportSample} className="grid-2">
                  <div>
                    <div className="form-group" style={{ position: 'relative' }}>
                      <label className="form-label">Chọn sản phẩm thuốc lá gốc <span style={{ color: 'red' }}>*</span></label>
                      <input 
                        className="form-input" 
                        type="text" 
                        required 
                        placeholder="Gõ tìm sản phẩm (ví dụ: 555, Canyon...)" 
                        value={importSearchQuery} 
                        onChange={e => handleImportSearchChange(e.target.value)}
                        onBlur={() => setTimeout(() => setImportSuggestions([]), 200)}
                        autoComplete="off"
                      />
                      
                      {/* Floating Suggestions for Import */}
                      {importSuggestions.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '75px',
                          left: 0,
                          right: 0,
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: 'var(--border-radius-sm)',
                          boxShadow: '0 8px 32px var(--glass-shadow)',
                          zIndex: 100,
                          maxHeight: '220px',
                          overflowY: 'auto',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)'
                        }}>
                          {importSuggestions.map(p => (
                            <div 
                              key={p.id} 
                              style={{
                                padding: '10px 16px',
                                cursor: 'pointer',
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                transition: 'background 0.2s',
                                fontSize: '14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                color: 'var(--text-primary)'
                              }}
                              onMouseDown={() => selectImportProduct(p)}
                              className="suggestion-item"
                            >
                              <span style={{ fontWeight: 600 }}>{p.product_name}</span>
                              {p.warning_code && <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>{p.warning_code}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {importProductId && (
                      <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: '20px', background: 'rgba(255,255,255,0.02)', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Mã cảnh báo bao bì:</span>
                          <strong>{products.find(p => p.id === importProductId)?.warning_code || 'Không cảnh báo'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Định dạng điếu:</span>
                          <strong>{products.find(p => p.id === importProductId)?.format}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Loại hàng:</span>
                          <strong>{products.find(p => p.id === importProductId)?.is_export ? 'Hàng Xuất Khẩu (Yêu cầu điền số đơn)' : 'Hàng nội địa'}</strong>
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">
                        Số đơn hàng xuất khẩu {products.find(p => p.id === importProductId)?.is_export && <span style={{ color: 'red' }}>*</span>}
                      </label>
                      <input 
                        className="form-input" 
                        type="text" 
                        required={products.find(p => p.id === importProductId)?.is_export} 
                        disabled={importProductId && !products.find(p => p.id === importProductId)?.is_export}
                        value={importOrderNumber} 
                        onChange={e => setImportOrderNumber(e.target.value)} 
                        placeholder={products.find(p => p.id === importProductId)?.is_export ? "Nhập số Order / Contract" : "Không áp dụng cho hàng Nội Địa"} 
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Số lượng mẫu nhập kho (Tính theo CÂY) <span style={{ color: 'red' }}>*</span></label>
                      <input className="form-input" type="number" required min="1" value={importQty} onChange={e => setImportQty(e.target.value)} placeholder="Nhập số cây (Ví dụ: 4 cây = 40 bao)" />
                      {importQty && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Quy đổi: {importQty} cây ({importQty * 10} bao lẻ)</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Mẻ sợi <span style={{ color: 'red' }}>*</span></label>
                      <input 
                        className="form-input" 
                        type="number" 
                        required 
                        min="1" 
                        max="999" 
                        value={importBlendBatch} 
                        onChange={e => setImportBlendBatch(e.target.value)} 
                        placeholder="Nhập số từ 1 đến 999 (Ví dụ: 123)" 
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Số thứ tự thùng được lấy mẫu <span style={{ color: 'red' }}>*</span></label>
                      <input 
                        className="form-input" 
                        type="number" 
                        required 
                        min="1" 
                        value={importBoxSeq} 
                        onChange={e => setImportBoxSeq(e.target.value)} 
                        placeholder="Nhập số thứ tự thùng (Ví dụ: 15)" 
                      />
                    </div>
                  </div>

                  <div>
                    <div className="form-group">
                      <label className="form-label">Ngày sản xuất sợi <span style={{ color: 'red' }}>*</span></label>
                      <input 
                        className="form-input" 
                        type="text" 
                        inputMode="numeric"
                        required 
                        value={importBlendDateStr} 
                        onChange={e => setImportBlendDateStr(liveFormatDate(e.target.value, importBlendDateStr))} 
                        onBlur={e => setImportBlendDateStr(autoFormatDate(e.target.value))}
                        placeholder="DD/MM/YYYY (Ví dụ: 26/05/2026)" 
                      />
                      {(() => {
                        if (importBlendDateStr.length >= 8 && importPackagingDateStr.length >= 8) {
                          const bParts = autoFormatDate(importBlendDateStr).split('/');
                          const pParts = autoFormatDate(importPackagingDateStr).split('/');
                          if (bParts.length === 3 && pParts.length === 3) {
                            const bD = new Date(`${bParts[2]}-${bParts[1]}-${bParts[0]}`);
                            const pD = new Date(`${pParts[2]}-${pParts[1]}-${pParts[0]}`);
                            if (!isNaN(bD) && !isNaN(pD) && bD > pD) {
                              return <span style={{ fontSize: '11px', color: 'var(--status-error)', marginTop: '4px', display: 'block' }}>Lỗi: Ngày SX sợi đang nhập SAU Ngày SX bao.</span>;
                            }
                          }
                        }
                        return null;
                      })()}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ngày sản xuất bao <span style={{ color: 'red' }}>*</span></label>
                      <input 
                        className="form-input" 
                        type="text" 
                        inputMode="numeric"
                        required 
                        value={importPackagingDateStr} 
                        onChange={e => {
                          const val = liveFormatDate(e.target.value, importPackagingDateStr);
                          setImportPackagingDateStr(val);
                          setImportSamplingDateStr(val);
                        }} 
                        onBlur={e => {
                          const formatted = autoFormatDate(e.target.value);
                          setImportPackagingDateStr(formatted);
                          setImportSamplingDateStr(formatted);
                        }}
                        placeholder="DD/MM/YYYY (Ví dụ: 26/05/2026)" 
                      />
                      {(() => {
                        const parts = importPackagingDateStr.split('/');
                        if (parts.length === 3) {
                          const yr = parseInt(parts[2], 10);
                          if (!isNaN(yr)) {
                            return (
                              <span style={{ fontSize: '11px', color: 'var(--status-warning)', marginTop: '4px', display: 'block' }}>
                                Hạn hủy mẫu gợi ý: {parts[0]}/{parts[1]}/{yr + 1} (12 tháng)
                              </span>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Thời gian QC lấy mẫu <span style={{ color: 'red' }}>*</span></label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input 
                          className="form-input" 
                          type="text" 
                          inputMode="numeric"
                          required 
                          value={importSamplingDateStr} 
                          onChange={e => setImportSamplingDateStr(liveFormatDate(e.target.value, importSamplingDateStr))} 
                          onBlur={e => setImportSamplingDateStr(autoFormatDate(e.target.value))}
                          placeholder="Ngày DD/MM/YYYY" 
                        />
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Giờ:</span>
                          <select className="form-select" style={{ flex: 1 }} value={importSamplingHour} onChange={e => setImportSamplingHour(e.target.value)}>
                            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                              <option key={h} value={h}>{h} giờ</option>
                            ))}
                          </select>
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Phút:</span>
                          <select className="form-select" style={{ flex: 1 }} value={importSamplingMinute} onChange={e => setImportSamplingMinute(e.target.value)}>
                            {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                              <option key={m} value={m}>{m} phút</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* LOCATION PREDICTION & SUGGESTION BOARD */}
                    {suggestedLoc && (
                      <div className="glass-panel" style={{ padding: '16px', border: `1px solid ${suggestedLoc.error ? 'var(--status-error)' : 'var(--status-success)'}`, background: suggestedLoc.error ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.05)', marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', color: suggestedLoc.error ? 'var(--status-error)' : 'var(--status-success)' }}>
                          <Info size={16} /> Thuật Toán Gợi Ý Vị Trí Lưu Mẫu
                        </h4>
                        <p style={{ fontSize: '13px', marginTop: '6px' }}>{suggestedLoc.reason}</p>
                        
                        {!suggestedLoc.error && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '12px' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Kệ</label>
                              <input className="form-input" type="number" required min="1" max="6" value={importShelf} onChange={e => handleShelfChange(e.target.value)} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Ô (1-4)</label>
                              <input className="form-input" type="number" required min="1" max="4" value={importSlot} onChange={e => handleSlotChange(e.target.value)} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Cột</label>
                              <input className="form-input" type="number" disabled value={importColumn} style={{ opacity: 0.75, cursor: 'not-allowed' }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                      <button className="btn btn-primary" type="submit" disabled={loading || (suggestedLoc && suggestedLoc.error)}>
                        {loading ? <Loader className="logo-icon" size={18} /> : 'Xác nhận nhập kho & Lưu nhãn'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* LABEL PRINTING PAGE */}
            {activeTab === 'labels' && (
              <div className="glass-panel">
                {lastAssignedIds && lastAssignedIds.length > 0 && (
                  <div style={{ background: 'rgba(255, 165, 0, 0.1)', border: '1px solid orange', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={18} color="orange" />
                      <span style={{ color: 'orange', fontWeight: '500' }}>Vừa bố trí {lastAssignedIds.length} mẫu. Nếu nhầm lẫn, bạn có thể hoàn tác.</span>
                    </div>
                    <button 
                      className="btn" 
                      style={{ background: 'orange', color: '#fff', padding: '6px 12px', fontSize: '13px' }}
                      onClick={handleUndoAssignment}
                      disabled={isUndoing}
                    >
                      {isUndoing ? <Loader size={14} className="spin" /> : 'Hoàn tác ngay'}
                    </button>
                  </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'1px solid var(--glass-border)', paddingBottom:'16px', marginBottom:'20px', flexWrap:'wrap', gap:'16px' }}>
                  <div>
                    <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px', margin:0 }}>
                      <QrCode size={22} color="var(--accent-blue)" /> In Nhãn Tommy 135 Hàng Loạt ({printQueue.length})
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin:'4px 0 0' }}>
                      Cảnh báo: Hãy dùng nút "In Toàn Bộ" màu xanh bên phải để tự động gom nối tiếp đầy các trang A4 Tommy 135 (21 tem/trang), tránh hao phí tem trống.
                    </p>
                  </div>
                  <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                    {(() => {
                      const readyCount = printQueue.filter(s => s.status !== 'pending' && (s.shelf || s.box_id)).reduce((sum, s) => sum + Math.max(1, Math.floor(s.available_qty / 10)), 0);
                      const fullPages = Math.floor(readyCount / 21);
                      const remainder = readyCount % 21;
                      
                      return readyCount > 0 ? (
                        <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                          <span style={{ fontSize:'12px', color:'var(--text-secondary)' }}>
                            Sẵn sàng: <strong>{readyCount} tem</strong> ({fullPages} trang đầy, lẻ {remainder} tem)
                          </span>
                          <button className="btn btn-primary" style={{ background:'linear-gradient(135deg, #10b981, #059669)', borderColor:'#059669', fontWeight:600 }}
                            onClick={printAllReadyLabels}>
                            <QrCode size={16} /> In Toàn Bộ (Gom Đầy Trang A4)
                          </button>
                        </div>
                      ) : null;
                    })()}
                    <button className="btn btn-secondary" style={{ borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)', fontSize: '13px' }} onClick={() => {
                      const activeSamples = samples.filter(s => s.status === 'stored' || s.status === 'boxed');
                      if (activeSamples.length === 0) {
                        showToast("Không có mẫu nào đang lưu trong kho để nạp!", "warning");
                        return;
                      }
                      setPrintQueue(activeSamples);
                      showToast(`✅ Đã nạp ${activeSamples.length} mẫu trong kho vào hàng đợi in!`, 'success');
                    }}>
                      Nạp toàn bộ nhãn trong kho ({samples.filter(s => s.status === 'stored' || s.status === 'boxed').length})
                    </button>
                    {printQueue.length > 0 && (
                      <button className="btn btn-secondary" style={{ color:'var(--status-error)', borderColor:'rgba(239,68,68,0.2)' }} onClick={() => {
                        if (confirm("Xóa toàn bộ hàng đợi in nhãn?")) setPrintQueue([]);
                      }}>
                        Xóa hàng đợi
                      </button>
                    )}
                  </div>
                </div>

                {printQueue.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {getGroupedPrintQueue().map(group => {
                      // Calculate total labels in this group
                      const totalStickersInGroup = group.items.reduce((sum, s) => sum + Math.max(1, Math.floor(s.available_qty / 10)), 0);
                      const totalPages = Math.ceil(totalStickersInGroup / 21);
                      const hasPending = group.items.some(s => s.status === 'pending' || (!s.shelf && !s.box_id));

                      return (
                        <div key={group.key} className="glass-panel" style={{ background:'rgba(255,255,255,0.01)', border:'1px solid var(--glass-border)', padding:'18px' }}>
                          
                          {/* Group header */}
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px', flexWrap:'wrap', gap:'12px', borderBottom:'1px solid rgba(255,255,255,0.04)', paddingBottom:'12px' }}>
                            <div>
                              <strong style={{ fontSize:'16px', color: hasPending ? 'var(--status-error)' : 'var(--text-primary)' }}>
                                {group.name}
                              </strong>
                              <span style={{ fontSize:'12px', color:'var(--text-muted)', marginLeft:'12px' }}>
                                Tổng cộng: <strong>{totalStickersInGroup} nhãn</strong> (Khoảng {totalPages} trang Tommy)
                              </span>
                            </div>
                            
                            <div style={{ display:'flex', gap:'8px' }}>
                              {hasPending ? (
                                <span style={{ fontSize:'12px', color:'var(--status-error)', background:'rgba(239,68,68,0.08)', padding:'6px 12px', borderRadius:'6px', border:'1px solid rgba(239,68,68,0.2)' }}>
                                  ⚠️ Khay này có mẫu chưa bố trí kệ! Vui lòng quét bố trí ở Mục 2 trước.
                                </span>
                              ) : (
                                <button className="btn btn-primary" style={{ background:'linear-gradient(135deg, #2563eb, #1d4ed8)', borderColor:'#1d4ed8', fontSize:'13px' }}
                                  onClick={() => printTommyStickersForGroup(group.name, group.items)}>
                                  In Khay này ({totalStickersInGroup} Nhãn)
                                </button>
                              )}
                            </div>
                          </div>

                          {/* List of items in this group */}
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            {group.items.map((s, idx) => {
                              const labelCount = Math.max(1, Math.floor(s.available_qty / 10));
                              const itemLoc = s.status === 'pending' || (!s.shelf && !s.box_id)
                                ? 'Chưa bố trí'
                                : s.box_id 
                                  ? (boxes.find(b => b.id === s.box_id)?.box_name || 'Thùng')
                                  : formatLocation(s.shelf, s.slot, s.column_number);

                              return (
                                <div key={s.id || idx} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'13px', padding:'8px 12px', background:'rgba(255,255,255,0.01)', borderRadius:'6px' }}>
                                  <div>
                                    <strong style={{ color:'var(--text-primary)' }}>{s.products?.product_name || s.product_name}</strong>
                                    <span style={{ color:'var(--text-muted)', fontSize:'11px', marginLeft:'8px' }}>
                                      Mẻ {formatBlendBatch(s.blend_batch)} • Bao: {new Date(s.packaging_date).toLocaleDateString()} • Vị trí: <strong>{itemLoc.toUpperCase()}</strong>
                                    </span>
                                  </div>
                                  <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                                    <span style={{ background:'rgba(255,255,255,0.05)', padding:'2px 8px', borderRadius:'4px', fontSize:'12px' }}>
                                      {labelCount} nhãn
                                    </span>
                                    <button style={{ background:'none', border:'none', color:'var(--status-error)', cursor:'pointer', padding:'2px' }}
                                      onClick={() => setPrintQueue(prev => prev.filter(item => item.id !== s.id))}>
                                      ×
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Page breakdown representation */}
                          {!hasPending && totalPages > 0 && (
                            <div style={{ marginTop:'14px', paddingTop:'12px', borderTop:'1px dotted rgba(255,255,255,0.04)', display:'flex', gap:'6px', flexWrap:'wrap' }}>
                              {Array.from({ length: totalPages }).map((_, pageIdx) => {
                                const startLabel = pageIdx * 21 + 1;
                                const endLabel = Math.min((pageIdx + 1) * 21, totalStickersInGroup);
                                const isFull = (endLabel - startLabel + 1) === 21;
                                
                                return (
                                  <button key={pageIdx} className="btn btn-secondary" 
                                    style={{ fontSize:'11px', padding:'4px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', background: isFull ? 'rgba(16,185,129,0.05)' : 'rgba(245,158,11,0.05)', borderColor: isFull ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)' }}
                                    onClick={() => {
                                      // Print only this specific page slice of the group
                                      const groupStickersExpanded = [];
                                      group.items.forEach(item => {
                                        const count = Math.max(1, Math.floor(item.available_qty / 10));
                                        for (let i = 0; i < count; i++) groupStickersExpanded.push(item);
                                      });
                                      const pageSlice = groupStickersExpanded.slice(pageIdx * 21, (pageIdx + 1) * 21);
                                      printTommyStickersForGroup(`${group.name} - Trang ${pageIdx + 1}`, pageSlice);
                                    }}>
                                    <span style={{ fontWeight:700 }}>Trang {pageIdx + 1}</span>
                                    <span style={{ fontSize:'9px', color:'var(--text-muted)' }}>({endLabel - startLabel + 1} tem)</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-muted)' }}>
                    <QrCode size={48} style={{ opacity: 0.15, marginBottom: '16px' }} />
                    <p style={{ fontSize: '15px' }}>Không có nhãn dán nào trong hàng đợi in.</p>
                    <p style={{ fontSize: '13px', marginTop: '4px' }}>Sau khi tiến hành nhập kho mẫu mới ở các tab nhập hàng, nhãn sẽ tự động được xếp vào đây.</p>
                  </div>
                )}
              </div>
            )}


            {/* PRODUCT CATALOG MANAGEMENT PAGE */}
            {activeTab === 'catalog' && (
              <div className="glass-panel">
                <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardList size={22} color="var(--accent-blue)" /> Quản Lý Danh Mục Sản Phẩm Gốc
                </h2>

                <div className="grid-2" style={{ alignItems: 'flex-start' }}>
                  {/* FORM TO ADD/EDIT PRODUCT */}
                  <form onSubmit={handleAddProduct} className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>{editingProduct ? `Sửa: ${editingProduct.product_name}` : 'Form Thêm Mới'}</h3>

                    <div className="form-group">
                      <label className="form-label">Tên sản phẩm thuốc lá <span style={{ color: 'red' }}>*</span></label>
                      <input className="form-input" type="text" required value={catName} onChange={e => setCatName(e.target.value)} placeholder="Nhập tên SP (ví dụ: Winston Red)" />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Xuất khẩu / Nội địa</label>
                      <select className="form-select" value={catIsExport ? 'export' : 'domestic'} onChange={e => setCatIsExport(e.target.value === 'export')}>
                        <option value="domestic">Hàng Nội Địa</option>
                        <option value="export">Hàng Xuất Khẩu</option>
                      </select>
                    </div>

                    {catIsExport && (
                      <div className="form-group">
                        <label className="form-label">Mã cảnh báo sức khỏe</label>
                        <input className="form-input" type="text" value={catWarning} onChange={e => setCatWarning(e.target.value)} placeholder="Ví dụ: EEC HW, HK Health Warning..." />
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">Định dạng điếu</label>
                      <select className="form-select" value={catFormat} onChange={e => setCatFormat(e.target.value)}>
                        <option value="Kingsize">Kingsize</option>
                        <option value="Slim">Slim</option>
                        <option value="SuperSlim">SuperSlim</option>
                        <option value="Semi">Semi</option>
                        <option value="Demi">Demi</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                      {editingProduct && (
                        <button className="btn btn-secondary" type="button" onClick={cancelEditingProduct} style={{ flex: 1 }}>
                          Hủy bỏ
                        </button>
                      )}
                      <button className="btn btn-primary" type="submit" style={{ flex: 2 }}>
                        {editingProduct ? <Save size={16} /> : <Plus size={16} />} {editingProduct ? 'Cập nhật' : 'Thêm Sản Phẩm'}
                      </button>
                    </div>
                  </form>

                  {/* PRODUCTS LIST */}
                  <div className="glass-panel" style={{ maxHeight: '550px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                      <h3 style={{ fontSize: '16px', margin: 0 }}>
                        Danh sách sản phẩm gốc ({products.filter(p => p.product_name.toLowerCase().includes(catalogSearchQuery.toLowerCase().trim())).length} / {products.length})
                      </h3>
                      <input 
                        type="text" 
                        placeholder="Tìm sản phẩm gốc..." 
                        value={catalogSearchQuery}
                        onChange={e => setCatalogSearchQuery(e.target.value)}
                        style={{
                          padding: '6px 12px',
                          background: 'var(--glass-bg)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          outline: 'none',
                          width: '200px'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {products
                        .filter(p => p.product_name.toLowerCase().includes(catalogSearchQuery.toLowerCase().trim()))
                        .map((p, idx) => (
                          <div key={p.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--glass-border)', fontSize: '13px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <strong>{p.product_name}</strong>
                                {p.is_export && <span style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', padding: '1px 6px', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold' }}>Xuất Khẩu</span>}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Định dạng: {p.format} | Cảnh báo: {p.warning_code || 'Không'}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => startEditingProduct(p)}>
                                Sửa
                              </button>
                              <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', color: 'var(--status-error)' }} onClick={() => handleDeleteProduct(p.id, p.product_name)}>
                                Xóa
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TRANSACTIONS & APPROVALS PAGE */}
            {activeTab === 'requests' && (
              <div className="glass-panel">
                <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowRightLeft size={22} color="var(--accent-blue)" /> Phê Duyệt Yêu Cầu Cấp Lấy Mẫu Thuốc Lá
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {transactions.filter(t => t.type === 'take_request').map(tx => {
                    const sample = tx.samples;
                    const location = sample?.shelf ? formatLocation(sample.shelf, sample.slot, sample.column_number) : `Thùng ${boxes.find(b => b.id === sample?.box_id)?.box_name || 'Không có'}`;
                    const ageMonths = sample ? Math.floor((new Date() - new Date(sample.packaging_date)) / (1000 * 60 * 60 * 24 * 30.5)) : 0;
                    
                    return (
                      <div key={tx.id} className="glass-panel" style={{ borderLeft: `4px solid ${tx.status === 'pending' ? 'var(--status-warning)' : tx.status === 'approved' ? 'var(--status-success)' : 'var(--text-muted)'}`, padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: tx.status === 'pending' ? 'rgba(245,158,11,0.02)' : 'var(--glass-bg)' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ textTransform: 'uppercase', fontSize: '11px', background: tx.status === 'pending' ? 'var(--status-warning)' : 'var(--status-success)', color: '#000', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>{tx.status === 'pending' ? 'Chờ duyệt cấp' : 'Đã cấp'}</span>
                            <h4 style={{ fontSize: '18px', fontWeight: 'bold' }}>{sample?.products?.product_name || sample?.product_name || 'Mẫu đã xóa'}</h4>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>— Lấy: <strong>{tx.quantity} bao</strong> ({tx.quantity % 10 !== 0 ? 'Bóc cây lẻ' : `${tx.quantity/10} cây nguyên`})</span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <div><strong>Người yêu cầu:</strong> {tx.profiles?.full_name} ({tx.profiles?.employee_code})</div>
                            <div><strong>Lý do:</strong> {tx.note}</div>
                            <div><strong>Thời gian gửi:</strong> {new Date(tx.created_at).toLocaleString()}</div>
                            <div><strong>Vị trí kệ mẫu:</strong> <strong style={{ color: 'var(--accent-blue)' }}>{location}</strong></div>
                            <div><strong>Mẻ sợi:</strong> {formatBlendBatch(sample?.blend_batch)}</div>
                            <div><strong>Hạn lưu của mẫu:</strong> {ageMonths} tháng tuổi</div>
                          </div>
                        </div>

                        {tx.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-secondary" onClick={() => handleCancelRequest(tx.id)}> Từ chối </button>
                            <button className="btn btn-primary" onClick={() => handleApproveRequest(tx)}> Cấp mẫu </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {transactions.filter(t => t.type === 'take_request').length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      Không có yêu cầu lấy mẫu nào cần duyệt.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                 BULK IMPORT TAB
            ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'bulk_import' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

                {/* ────────────────────────────────
                   SECTION A: NHẬP & LƯU MẬu
                ──────────────────────────────── */}
                <div className="glass-panel">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px', gap:'12px', flexWrap:'wrap' }}>
                    <div>
                      <h2 style={{ fontSize:'18px', display:'flex', alignItems:'center', gap:'8px', margin:0 }}>
                        <UploadCloud size={20} color="#7c3aed" /> Mục 1 — Nhập và Lưu Mẫu
                      </h2>
                      <p style={{ fontSize:'12px', color:'var(--text-muted)', margin:'4px 0 0' }}>
                        Nhập thông tin mẫu hàng loạt — chỉ lưu vào database, chưa phân bổ vị trí
                      </p>
                    </div>
                    {samples.filter(s => s.status === 'pending').length > 0 && (
                      <div style={{ padding:'8px 14px', background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.4)', borderRadius:'8px', fontSize:'13px', color:'#a78bfa' }}>
                        <strong>{samples.filter(s => s.status === 'pending').length}</strong> mẫu đang chờ bố trí ↓
                      </div>
                    )}
                  </div>

                  {/* Toolbar */}
                  <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'rgba(255,255,255,0.03)', padding:'5px 12px', borderRadius:'6px', border:'1px solid var(--glass-border)', marginRight:'8px' }}>
                      <span style={{ fontSize:'13px', fontWeight:'bold', color:'var(--text-secondary)' }}>Chọn Khay:</span>
                      <select 
                        value={bulkTrayNumber} 
                        onChange={e => setBulkTrayNumber(e.target.value)}
                        style={{ padding:'4px 8px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'4px', color:'var(--text-primary)', fontSize:'13px', outline:'none', cursor: 'pointer' }}
                      >
                        {(() => {
                          const maxTray = samples.reduce((max, s) => Math.max(max, s.tray_number || 0), 0);
                          const nextTray = maxTray + 1;
                          
                          const pendingTrays = {};
                          samples.forEach(s => {
                            if (s.status === 'pending' && s.tray_number) {
                              pendingTrays[s.tray_number] = (pendingTrays[s.tray_number] || 0) + 1;
                            }
                          });
                          
                          const options = [];
                          
                          if (!pendingTrays[nextTray] && parseInt(bulkTrayNumber) === nextTray) {
                             options.push(<option key="new" value={nextTray}>Khay mới (Số {nextTray})</option>);
                          } else if (!pendingTrays[nextTray]) {
                             options.push(<option key="new" value={nextTray}>+ Tạo khay mới (Số {nextTray})</option>);
                          }
                          
                          Object.keys(pendingTrays).sort((a,b)=> parseInt(b)-parseInt(a)).forEach(tNum => {
                            options.push(<option key={tNum} value={tNum}>Khay số {tNum} (đang có {pendingTrays[tNum]} mẫu)</option>);
                          });
                          
                          const currentVal = parseInt(bulkTrayNumber);
                          if (!isNaN(currentVal) && currentVal !== nextTray && !pendingTrays[currentVal]) {
                             options.push(<option key={currentVal} value={currentVal}>Khay số {currentVal} (Trống)</option>);
                          }
                          
                          return options;
                        })()}
                      </select>
                    </div>
                    <button className="btn btn-secondary" style={{ fontSize:'13px' }} onClick={() => addBulkRows(1)}>
                      <Plus size={14} /> Thêm hàng
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize:'13px' }} onClick={() => addBulkRows(10)}>
                      <Plus size={14} /> Thêm 10 hàng
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize:'13px', color:'var(--status-error)' }} onClick={() => setBulkRows([createEmptyBulkRow(1)])}>
                      <Trash2 size={14} /> Xóa tất cả
                    </button>
                    <span style={{ marginLeft:'auto', fontSize:'12px', color:'var(--text-muted)' }}>
                      {bulkRows.length} hàng • {bulkRows.filter(r=>r.productObj).length} đã chọn SP
                    </span>
                  </div>

                  {/* Table */}
                  <div style={{ overflowX:'auto', borderRadius:'10px', border:'1px solid var(--glass-border)', paddingBottom: bulkRows.some(r => r.suggestions?.length > 0) ? '220px' : '0', transition: 'padding-bottom 0.2s' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'1100px' }}>
                      <thead>
                        <tr style={{ background:'rgba(255,255,255,0.04)' }}>
                          {['#','Sản phẩm','Mẻ sợi','Thùng','Ngày SX sợi','Ngày SX bao','Ngày lấy mẫu','Giờ lấy mẫu','Đơn hàng','Số cây','Ghi chú',''].map(h => (
                            <th key={h} style={{ padding:'10px 12px', textAlign:'left', borderBottom:'1px solid var(--glass-border)', color:'var(--text-secondary)', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((row, idx) => (
                          <tr key={row.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding:'8px 12px', color:'var(--text-muted)', width:'32px' }}>{idx+1}</td>

                            {/* Product search */}
                            <td style={{ padding:'8px 12px', minWidth:'240px', position:'relative', zIndex: row.suggestions.length > 0 ? 100 : 'auto' }}>
                              <input
                                type="text" placeholder="Nhập tên sản phẩm..."
                                value={row.searchQuery}
                                onChange={e => handleBulkProductSearch(idx, e.target.value)}
                                onKeyDown={e => handleBulkSearchKeyDown(e, idx)}
                                onBlur={() => setTimeout(() => updateBulkRow(idx,'suggestions',[]), 200)}
                                style={{ width:'100%', padding:'6px 10px', background:'var(--glass-bg)', border:`1px solid ${row.suggestions.length > 0 ? 'var(--accent-blue)' : row.productObj ? 'var(--status-success)' : 'var(--glass-border)'}`, borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px', boxSizing:'border-box', outline:'none' }}
                              />
                              {row.productObj && !row.suggestions.length && (
                                <span style={{ position:'absolute', top:'50%', right:'16px', transform:'translateY(-50%)', color:'var(--status-success)', fontSize:'14px' }}>✓</span>
                              )}
                              {row.suggestions.length > 0 && (
                                <div style={{ position:'absolute', top:'calc(100% + 2px)', left:0, right:0, background:'var(--bg-secondary)', border:'1px solid var(--accent-blue)', borderRadius:'8px', zIndex:9999, maxHeight:'220px', overflowY:'auto', boxShadow:'0 12px 32px rgba(0,0,0,0.6)' }}>
                                  {row.suggestions.map((p, pIdx) => (
                                    <div key={p.id} 
                                      onMouseDown={() => selectBulkProduct(idx, p)}
                                      onMouseEnter={() => setBulkActiveSuggestIdx(pIdx)}
                                      style={{ 
                                        padding:'10px 16px', 
                                        cursor:'pointer', 
                                        fontSize:'13px', 
                                        borderBottom:'1px solid rgba(255,255,255,0.03)', 
                                        display:'flex', 
                                        justifyContent:'space-between', 
                                        alignItems:'center', 
                                        color:'var(--text-primary)', 
                                        transition:'background 0.15s, color 0.15s',
                                        background: pIdx === bulkActiveSuggestIdx ? 'rgba(37,99,235,0.25)' : 'transparent'
                                      }}
                                      className="suggestion-item">
                                      <span style={{ fontWeight: 600, color: pIdx === bulkActiveSuggestIdx ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{p.product_name}</span>
                                      {p.warning_code && (
                                        <span style={{ 
                                          fontSize: '11px', 
                                          background: pIdx === bulkActiveSuggestIdx ? 'rgba(37,99,235,0.1)' : 'rgba(255,255,255,0.06)', 
                                          padding: '2px 6px', 
                                          borderRadius: '4px', 
                                          color: pIdx === bulkActiveSuggestIdx ? 'var(--accent-blue)' : 'var(--text-secondary)' 
                                        }}>{p.warning_code}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>

                            <td style={{ padding:'8px 12px', width:'80px' }}>
                              <input type="number" min="1" max="999" placeholder="123" value={row.blendBatch}
                                onChange={e => updateBulkRow(idx,'blendBatch',e.target.value)}
                                style={{ width:'100%', padding:'6px 8px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px' }} />
                            </td>
                            <td style={{ padding:'8px 12px', width:'70px' }}>
                              <input type="number" min="1" placeholder="1" value={row.boxSeq}
                                onChange={e => updateBulkRow(idx,'boxSeq',e.target.value)}
                                style={{ width:'100%', padding:'6px 8px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px' }} />
                            </td>
                            <td style={{ padding:'8px 12px', width:'120px' }}>
                              <input type="text" placeholder="dd/mm/yyyy" value={row.blendDate}
                                onChange={e => updateBulkRow(idx,'blendDate', liveFormatDate(e.target.value, row.blendDate))}
                                onBlur={e => updateBulkRow(idx,'blendDate', autoFormatDate(e.target.value))}
                                style={{ width:'100%', padding:'6px 8px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px' }} />
                            </td>
                            <td style={{ padding:'8px 12px', width:'120px' }}>
                              <input type="text" placeholder="dd/mm/yyyy" value={row.packagingDate}
                                onChange={e => {
                                  const val = liveFormatDate(e.target.value, row.packagingDate);
                                  const prevPack = row.packagingDate;
                                  updateBulkRow(idx,'packagingDate', val);
                                  if (!row.samplingDate || row.samplingDate === prevPack) {
                                    updateBulkRow(idx,'samplingDate', val);
                                  }
                                }}
                                onBlur={e => {
                                  const formatted = autoFormatDate(e.target.value);
                                  const prevPack = row.packagingDate;
                                  updateBulkRow(idx,'packagingDate', formatted);
                                  if (!row.samplingDate || row.samplingDate === prevPack || row.samplingDate === row.packagingDate) {
                                    updateBulkRow(idx,'samplingDate', formatted);
                                  }
                                }}
                                style={{ width:'100%', padding:'6px 8px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px', borderColor: row.packagingDate && !parseDMY(row.packagingDate) ? 'var(--status-error)' : 'var(--glass-border)' }} />
                            </td>
                            <td style={{ padding:'8px 12px', width:'120px' }}>
                              <input type="text" placeholder="dd/mm/yyyy" value={row.samplingDate}
                                onChange={e => updateBulkRow(idx,'samplingDate', liveFormatDate(e.target.value, row.samplingDate))}
                                onBlur={e => updateBulkRow(idx,'samplingDate', autoFormatDate(e.target.value))}
                                style={{ width:'100%', padding:'6px 8px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px', borderColor: row.samplingDate && !parseDMY(row.samplingDate) ? 'var(--status-error)' : 'var(--glass-border)' }} />
                            </td>
                            <td style={{ padding:'8px 12px', width:'120px' }}>
                              <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                                <select value={row.samplingHour}
                                  onChange={e => updateBulkRow(idx, 'samplingHour', e.target.value)}
                                  style={{ width:'48px', padding:'5px 2px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px', textAlign:'center', outline:'none', cursor:'pointer' }}>
                                  {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                                    <option key={h} value={h} style={{ background:'var(--bg-secondary)', color:'var(--text-primary)' }}>{h}</option>
                                  ))}
                                </select>
                                <span style={{ color:'var(--text-muted)' }}>:</span>
                                <select value={row.samplingMinute}
                                  onChange={e => updateBulkRow(idx, 'samplingMinute', e.target.value)}
                                  style={{ width:'48px', padding:'5px 2px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px', textAlign:'center', outline:'none', cursor:'pointer' }}>
                                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                                    <option key={m} value={m} style={{ background:'var(--bg-secondary)', color:'var(--text-primary)' }}>{m}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td style={{ padding:'8px 12px', width:'110px' }}>
                              <input 
                                type="text" 
                                placeholder={row.productObj ? (row.productObj.is_export ? 'Bắt buộc' : 'Không có') : 'Tùy chọn'} 
                                value={row.orderNumber}
                                disabled={row.productObj && !row.productObj.is_export}
                                onChange={e => updateBulkRow(idx,'orderNumber',e.target.value)}
                                style={{ 
                                  width:'100%', 
                                  padding:'6px 8px', 
                                  background: row.productObj && !row.productObj.is_export ? 'rgba(255,255,255,0.02)' : 'var(--glass-bg)', 
                                  border:`1px solid ${row.productObj?.is_export && !row.orderNumber ? 'var(--status-error)' : 'var(--glass-border)'}`, 
                                  borderRadius:'6px', 
                                  color: row.productObj && !row.productObj.is_export ? 'var(--text-muted)' : 'var(--text-primary)', 
                                  fontSize:'12px',
                                  cursor: row.productObj && !row.productObj.is_export ? 'not-allowed' : 'text',
                                  opacity: row.productObj && !row.productObj.is_export ? 0.5 : 1
                                }} 
                              />
                            </td>
                            <td style={{ padding:'8px 12px', width:'80px' }}>
                              <input type="number" min="1" placeholder="10" value={row.qty}
                                onChange={e => updateBulkRow(idx,'qty',e.target.value)}
                                style={{ width:'100%', padding:'6px 8px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px' }} />
                            </td>
                            <td style={{ padding:'8px 12px', width:'150px' }}>
                              <input type="text" placeholder="Ghi chú..." value={row.note}
                                onChange={e => updateBulkRow(idx,'note',e.target.value)}
                                style={{ width:'100%', padding:'6px 8px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'6px', color:'var(--text-primary)', fontSize:'12px' }} />
                            </td>
                            <td style={{ padding:'8px 12px', width:'36px' }}>
                              <button onClick={() => removeBulkRow(idx)} style={{ background:'none', border:'none', color:'var(--status-error)', cursor:'pointer', padding:'4px', borderRadius:'4px' }}>
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Save button */}
                  <div style={{ marginTop:'16px', display:'flex', justifyContent:'flex-end' }}>
                    <button className="btn btn-primary"
                      style={{ background:'linear-gradient(135deg,#7c3aed,#4f46e5)', borderColor:'#7c3aed', padding:'11px 28px', fontSize:'14px' }}
                      onClick={handleBulkSave} disabled={bulkSaving}>
                      {bulkSaving
                        ? <><Loader size={15} className="spin" /> Đang lưu...</>
                        : <><Save size={15} /> Lưu {bulkRows.length} mẫu vào database</>}
                    </button>
                  </div>
                </div>

                {/* ────────────────────────────────
                   SECTION B: QUÉT & ĐỀ XUẤT BỐ TRÍ
                ──────────────────────────────── */}
                <div className="glass-panel">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', gap:'12px', flexWrap:'wrap' }}>
                    <div>
                      <h2 style={{ fontSize:'18px', display:'flex', alignItems:'center', gap:'8px', margin:0 }}>
                        <Search size={20} color="#10b981" /> Mục 2 — Quét & ĐỀ Xuất Bố Trí Kho
                      </h2>
                      <p style={{ fontSize:'12px', color:'var(--text-muted)', margin:'4px 0 0' }}>
                        Tìm các mẫu chưa có vị trí kho và đề xuất phân bổ tự động
                      </p>
                    </div>
                    <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                      {(() => {
                        const cnt = samples.filter(s => s.status === 'pending').length;
                        return cnt > 0
                          ? <span style={{ padding:'6px 14px', background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.4)', borderRadius:'20px', fontSize:'13px', color:'#f59e0b', fontWeight:600 }}>
                              {cnt} mẫu chờ bố trí
                            </span>
                          : <span style={{ padding:'6px 14px', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:'20px', fontSize:'13px', color:'var(--status-success)' }}>
                              ✓ Không có mẫu chờ
                            </span>;
                      })()}
                      {samples.filter(s => s.status === 'pending').length > 0 && !scanPreview && (
                        <button className="btn btn-secondary"
                          style={{ borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => {
                            const pendingS = samples.filter(s => s.status === 'pending');
                            const trays = [...new Set(pendingS.map(s => s.tray_number).filter(t => t !== null && t !== undefined))].sort((a,b)=>a-b);
                            if (trays.length > 0) {
                              setSourceTrayNum(String(trays[0]));
                              setDestTrayNum(trays.length > 1 ? String(trays[1]) : '');
                            } else {
                              setSourceTrayNum('');
                              setDestTrayNum('');
                            }
                            setIsNewDestTray(false);
                            setNewDestTrayNum('');
                            setSourceSelectedIds([]);
                            setShowTrayAdjusterModal(true);
                          }}>
                          <ClipboardList size={15} /> Công cụ Dồn/Tách Khay
                        </button>
                      )}
                      {!scanPreview && (
                        <button className="btn btn-primary"
                          style={{ background:'linear-gradient(135deg,#059669,#10b981)', borderColor:'#10b981' }}
                          onClick={handleScanAndPropose}>
                          <Search size={15} /> Quét & ĐỀ xuất
                        </button>
                      )}
                      {scanPreview && (
                        <button className="btn btn-secondary" onClick={() => setScanPreview(null)}>
                          × Hủy đề xuất
                        </button>
                      )}
                    </div>
                  </div>

                  {/* No pending samples message */}
                  {!scanPreview && samples.filter(s => s.status === 'pending').length === 0 && (
                    <div style={{ textAlign:'center', padding:'32px', color:'var(--text-muted)', fontSize:'14px' }}>
                      <div style={{ fontSize:'40px', marginBottom:'12px' }}>🏆</div>
                      Tất cả mẫu đã được bố trí. Nhập mẫu mới ở Mục 1 để bắt đầu.
                    </div>
                  )}

                  {/* Pending list (when no scanPreview yet) */}
                  {!scanPreview && samples.filter(s => s.status === 'pending').length > 0 && (
                    <div style={{ maxHeight:'280px', overflowY:'auto', borderRadius:'8px', border:'1px solid var(--glass-border)', marginBottom:'0' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                        <thead>
                          <tr style={{ background:'rgba(255,255,255,0.04)', position:'sticky', top:0, zIndex:10 }}>
                            <th style={{ padding:'8px 12px', width:'80px', color:'var(--text-secondary)', fontWeight:600, borderBottom:'1px solid var(--glass-border)' }}>Khay</th>
                            {['Sản phẩm','Mẻ|Thùng','Ngày SX bao','Số cây','Ngày nhập', 'Thao tác'].map((h, i) => (
                              <th key={i} style={{ padding:'8px 12px', textAlign: h === 'Thao tác' ? 'right' : 'left', color:'var(--text-secondary)', fontWeight:600, borderBottom:'1px solid var(--glass-border)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {samples.filter(s => s.status === 'pending').sort((a,b) => new Date(b.packaging_date) - new Date(a.packaging_date)).map(s => (
                            <tr key={s.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                              <td style={{ padding:'7px 12px', fontWeight:600, color:'var(--accent-blue)' }}>
                                Khay {s.tray_number || '—'}
                              </td>
                              <td style={{ padding:'7px 12px', fontWeight:500 }}>{s.products?.product_name}</td>
                              <td style={{ padding:'7px 12px', color:'var(--text-secondary)', fontSize:'12px' }}>{s.blend_batch}</td>
                              <td style={{ padding:'7px 12px', color:'var(--text-secondary)', fontSize:'12px' }}>{s.packaging_date ? new Date(s.packaging_date).toLocaleDateString() : '—'}</td>
                              <td style={{ padding:'7px 12px' }}>{Math.round(s.available_qty / 10)} cây</td>
                              <td style={{ padding:'7px 12px', color:'var(--text-muted)', fontSize:'12px' }}>{s.entry_date ? new Date(s.entry_date).toLocaleDateString() : '—'}</td>
                              <td style={{ padding:'7px 12px', textAlign:'right', display:'flex', gap:'6px', justifyContent:'flex-end', alignItems:'center' }}>
                                <button className="btn btn-secondary" style={{ padding:'4px 8px', fontSize:'11.5px', color:'var(--accent-blue)', display:'flex', alignItems: 'center', gap: '4px' }} onClick={() => setMovingSample(s)}>
                                  <Move size={14} /> Bố trí
                                </button>
                                <button className="btn btn-secondary" style={{ padding:'4px 6px', color:'var(--status-error)', border:'none', background:'transparent', boxShadow:'none' }} onClick={() => handleDeletePendingSample(s.id)} title="Xóa mẫu chờ này">
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Scan preview results */}
                  {scanPreview && (
                    <div>
                      {/* Summary */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:'12px', marginBottom:'20px' }}>
                        {[
                          { label:'Tổng mẫu quét', value: scanPreview.toShelf.length + scanPreview.toBox.length, color:'#a78bfa', icon:'📊' },
                          { label:'Xếp lên kệ', value: scanPreview.toShelf.length, color:'var(--status-success)', icon:'🗄️' },
                          { label:'Đóng thùng', value: scanPreview.toBox.length, color:'#f59e0b', icon:'📦' },
                          { label:'Số thùng', value: Object.keys(scanPreview.boxGroups).length, color:'#60a5fa', icon:'🗃️' },
                        ].map(c => (
                          <div key={c.label} style={{ padding:'14px', background:'rgba(255,255,255,0.03)', border:'1px solid var(--glass-border)', borderRadius:'10px', textAlign:'center' }}>
                            <div style={{ fontSize:'24px', marginBottom:'2px' }}>{c.icon}</div>
                            <div style={{ fontSize:'24px', fontWeight:'bold', color:c.color }}>{c.value}</div>
                            <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{c.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Shelf list */}
                      {scanPreview.toShelf.length > 0 && (
                        <div style={{ marginBottom:'16px' }}>
                          <h3 style={{ fontSize:'14px', color:'var(--status-success)', marginBottom:'10px', display:'flex', alignItems:'center', gap:'6px' }}>
                            <Check size={15} /> Xếp lên kệ ({scanPreview.toShelf.length} lô)
                          </h3>
                          <div style={{ maxHeight:'240px', overflowY:'auto', borderRadius:'8px', border:'1px solid var(--glass-border)' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                              <thead>
                                <tr style={{ background:'rgba(255,255,255,0.04)', position:'sticky', top:0 }}>
                                  {['Sản phẩm','Mẻ|Thùng','Ngày SX bao','Cây','Vị trí đề xuất','Loại'].map(h => (
                                    <th key={h} style={{ padding:'7px 10px', textAlign:'left', color:'var(--text-secondary)', fontWeight:600, borderBottom:'1px solid var(--glass-border)', whiteSpace:'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {scanPreview.toShelf.map((r,i) => (
                                  <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding:'7px 10px', fontWeight:500 }}>{r.productObj?.product_name}</td>
                                    <td style={{ padding:'7px 10px', color:'var(--text-secondary)' }}>{r.blendBatch}|{r.boxSeq}</td>
                                    <td style={{ padding:'7px 10px', color:'var(--text-secondary)' }}>{r.packagingDate}</td>
                                    <td style={{ padding:'7px 10px' }}><strong>{r.qty}</strong></td>
                                    <td style={{ padding:'7px 10px' }}>
                                      <span style={{ background:'rgba(16,185,129,0.15)', color:'var(--status-success)', padding:'2px 8px', borderRadius:'5px', fontWeight:700 }}>
                                        {String.fromCharCode(64 + r.shelf)}{r.slot} / Cột {r.column}
                                      </span>
                                    </td>
                                    <td style={{ padding:'7px 10px', fontSize:'11px', color: r.productObj?.is_export ? '#60a5fa' : '#a78bfa' }}>
                                      {r.productObj?.is_export ? '🌍 XK' : '🏠 NĐ'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Box groups */}
                      {scanPreview.toBox.length > 0 && (
                        <div style={{ marginBottom:'16px' }}>
                          <h3 style={{ fontSize:'14px', color:'#f59e0b', marginBottom:'10px', display:'flex', alignItems:'center', gap:'6px' }}>
                            <Box size={15} /> Đóng thùng ({scanPreview.toBox.length} lô • {Object.keys(scanPreview.boxGroups).length} thùng)
                          </h3>
                          {Object.entries(scanPreview.boxGroups).map(([boxKey, items]) => (
                            <div key={boxKey} style={{ marginBottom:'8px', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'8px', overflow:'hidden' }}>
                              <div style={{ background:'rgba(245,158,11,0.08)', padding:'7px 14px', fontWeight:700, fontSize:'12px', color:'#f59e0b', display:'flex', justifyContent:'space-between' }}>
                                <span>📦 Thùng {boxKey}</span>
                                <span style={{ fontWeight:400, color:'var(--text-muted)' }}>{items.length} lô • {items.reduce((s,r)=>s+(parseInt(r.qty)||0),0)} cây</span>
                              </div>
                              {items.map((r,i) => (
                                <div key={i} style={{ padding:'5px 14px', fontSize:'12px', borderTop:'1px solid rgba(255,255,255,0.03)', display:'flex', justifyContent:'space-between' }}>
                                  <span>{r.productObj?.product_name}</span>
                                  <span style={{ color:'var(--text-muted)' }}>Mẻ {r.blendBatch}|{r.boxSeq} • {r.qty} cây • {r.packagingDate}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {scanPreview.toBox.length > 0 && (
                        <div style={{ padding:'10px 14px', background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'8px', marginBottom:'16px', display:'flex', gap:'8px', fontSize:'12px', color:'var(--text-secondary)' }}>
                          <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink:0, marginTop:'1px' }} />
                          Kệ kho không đủ chỗ — {scanPreview.toBox.length} lô cũ hơn sẽ được đóng thùng theo tháng SX bao. Vẫn truy xuất được qua tab <strong style={{marginLeft:'4px'}}>Tìm Kiếm Mẫu</strong>.
                        </div>
                      )}

                      {/* Confirm */}
                      <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => setScanPreview(null)}>
                          ← Hủy
                        </button>
                        <button className="btn btn-primary"
                          style={{ background:'linear-gradient(135deg,#059669,#10b981)', borderColor:'#10b981', padding:'11px 28px', fontSize:'14px', minWidth:'180px' }}
                          onClick={handleConfirmAssignment} disabled={scanSaving}>
                          {scanSaving ? <><Loader size={15} className="spin" /> Đang áp dụng...</> : <><Check size={16} /> Xác nhận áp dụng</>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SEARCH LOGS PAGE (Admin only) */}
            {activeTab === 'search_logs' && (
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
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
                ) : (
                  <>
                    <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Tổng cộng <strong style={{ color: 'var(--accent-blue)' }}>{searchLogs.length}</strong> lượt tìm kiếm được ghi nhận.
                    </div>
                    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                            {['Thời gian', 'Tên người dùng', 'Thiết bị', 'Từ khóa', 'Lọc tháng', 'Kết quả', ''].map(h => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {searchLogs.map((log, i) => (
                            <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                              <td style={{ padding: '9px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '12px' }}>
                                {new Date(log.searched_at).toLocaleString()}
                              </td>
                              <td style={{ padding: '9px 14px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, flexWrap: 'wrap' }}>
                                  <User size={12} color="var(--accent-blue)" />
                                  {log.user_name}
                                  {(() => {
                                    const status = resetDevices.find(d => d.device_id === log.device_id);
                                    if (status) {
                                      if (status.is_blocked) {
                                        return <span style={{ fontSize: '10px', background: 'rgba(239,68,68,0.15)', color: 'var(--status-error)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.3)' }}>🚫 Bị chặn</span>;
                                      } else {
                                        return <span style={{ fontSize: '10px', background: 'rgba(245,158,11,0.15)', color: 'var(--status-warning)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.3)' }}>⏳ Chờ nhập lại</span>;
                                      }
                                    }
                                    return null;
                                  })()}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', color: 'var(--text-muted)' }} title={log.device_id}>
                                <code style={{ background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                  {getDisplayDeviceName(log.device_id)}
                                </code>
                              </td>
                              <td style={{ padding: '9px 14px' }}>
                                <span style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-blue)', padding: '3px 10px', borderRadius: '12px', fontWeight: 600, fontSize: '12px' }}>
                                  🔍 {log.keyword}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                {log.month_filter || <span style={{ opacity: 0.4 }}>Tất cả</span>}
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                                <span style={{ 
                                  fontWeight: 'bold', 
                                  color: log.results_count === 0 ? 'var(--status-error)' : 'var(--status-success)',
                                  background: log.results_count === 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                                  padding: '3px 10px', borderRadius: '12px', fontSize: '12px'
                                }}>
                                  {log.results_count} mẫu
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                  {(() => {
                                    const status = resetDevices.find(d => d.device_id === log.device_id);
                                    if (status && status.is_blocked) {
                                      return (
                                        <button
                                          onClick={() => handleUnblockVisitor(log.device_id, log.user_name)}
                                          title="Bỏ chặn thiết bị này"
                                          style={{
                                            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                                            color: 'var(--status-success)', borderRadius: '8px',
                                            padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                                            fontWeight: 600, whiteSpace: 'nowrap'
                                          }}
                                        >
                                          🟢 Gỡ chặn
                                        </button>
                                      );
                                    } else {
                                      return (
                                        <>
                                          <button
                                            onClick={() => handleResetVisitor(log.device_id, log.user_name)}
                                            title="Yêu cầu thiết bị này nhập lại tên vào lần truy cập sau"
                                            disabled={!!status}
                                            style={{
                                              background: status ? 'rgba(255,255,255,0.05)' : 'rgba(245,158,11,0.12)', 
                                              border: status ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(245,158,11,0.3)',
                                              color: status ? 'var(--text-muted)' : 'var(--status-warning)', 
                                              borderRadius: '8px',
                                              padding: '4px 10px', fontSize: '11px', cursor: status ? 'not-allowed' : 'pointer',
                                              fontWeight: 600, whiteSpace: 'nowrap'
                                            }}
                                          >
                                            🔄 {status ? 'Đang chờ nhập' : 'Yêu cầu khai lại'}
                                          </button>
                                          <button
                                            onClick={() => handleBlockVisitor(log.device_id, log.user_name)}
                                            title="Chặn thiết bị này truy cập hệ thống"
                                            style={{
                                              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                                              color: 'var(--status-error)', borderRadius: '8px',
                                              padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                                              fontWeight: 600, whiteSpace: 'nowrap'
                                            }}
                                          >
                                            🚫 Chặn
                                          </button>
                                        </>
                                      );
                                    }
                                  })()}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* OVERCAPACITY BOXES & EXPIRATION REPORTS PAGE */}
            {activeTab === 'archives' && (
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                  <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <Archive size={22} color="var(--accent-blue)" /> Quản Lý Quá Tải Lực Chứa & Hủy Mẫu
                  </h2>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={handleOvercapacityBoxing}>
                      <Archive size={16} /> Đóng thùng mẫu cũ nhất
                    </button>
                    <button className="btn btn-danger" onClick={printDestructionManifest}>
                      <FileText size={16} /> Báo cáo hủy mẫu tuần (PDF)
                    </button>
                  </div>
                </div>

                <div className="grid-2">
                  {/* EXPIRING AND EXPIRED SAMPLES ALERT */}
                  <div className="glass-panel" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
                    <h3 style={{ fontSize: '16px', color: 'var(--status-error)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldAlert size={18} /> Danh Sách Mẫu Hết Hạn ({getExpiredSamples().length})
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {getExpiredSamples().map(s => {
                        const ageMonths = Math.floor((new Date() - new Date(s.packaging_date)) / (1000 * 60 * 60 * 24 * 30.5));
                        const location = s.shelf ? formatLocation(s.shelf, s.slot, s.column_number) : `Thùng ${boxes.find(b => b.id === s.box_id)?.box_name || 'Không có'}`;
                        
                        return (
                          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', fontSize: '13px' }}>
                            <div>
                              <strong>{s.products?.product_name || s.product_name}</strong>
                              <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '2px' }}>
                                Ngày SX bao: {new Date(s.packaging_date).toLocaleDateString()} | <strong>Tuổi: {ageMonths} tháng (Quá hạn)</strong>
                              </div>
                              <div style={{ fontSize: '11px', marginTop: '2px' }}>
                                Vị trí: <strong style={{ color: 'var(--accent-blue)' }}>{location}</strong> | Tồn: {s.available_qty} bao
                              </div>
                            </div>
                            <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px', alignSelf: 'center' }} onClick={() => handleDestroySample(s.id)}>
                              Xác nhận hủy
                            </button>
                          </div>
                        );
                      })}
                      {getExpiredSamples().length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
                          Không có mẫu nào quá hạn 12 tháng.
                        </div>
                      )}
                    </div>

                    {/* APPROACHING EXPIRED WARNING */}
                    <h3 style={{ fontSize: '16px', color: 'var(--status-warning)', marginTop: '24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Info size={18} /> Sắp Hết Hạn Lưu Trữ (11 tháng) ({getApproachingExpiredSamples().length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {getApproachingExpiredSamples().map(s => (
                        <div key={s.id} style={{ padding: '12px', background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '8px', fontSize: '13px' }}>
                          <strong>{s.products?.product_name || s.product_name}</strong>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '2px' }}>
                            Ngày SX bao: {new Date(s.packaging_date).toLocaleDateString()} | <strong>Tuổi: 11 tháng (Còn 1 tháng lưu trữ)</strong>
                          </div>
                        </div>
                      ))}
                      {getApproachingExpiredSamples().length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
                          Không có mẫu nào ở mốc 11 tháng tuổi.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ACTIVE ARCHIVE BOXES LIST */}
                  <div className="glass-panel">
                    <h3 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Box size={18} color="var(--accent-blue)" /> Danh Sách Thùng Đóng Thùng Lưu Trữ ({boxes.length})
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {boxes.map(b => {
                        const boxSamples = samples.filter(s => s.box_id === b.id);
                        return (
                          <div key={b.id} style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ fontSize: '15px' }}>{b.box_name}</strong>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Ngày đóng: {new Date(b.created_at).toLocaleDateString()} | Chứa: <strong>{boxSamples.length} lô mẫu</strong>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => printBoxManifest(b)}>
                                In danh sách (PDF)
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {boxes.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
                          Chưa có thùng lưu trữ nào được đóng gói.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL SLOT MODAL (Visually displaying columns inside slot) */}
      {selectedSlot && (
        <div className="modal-overlay" onClick={() => setSelectedSlot(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Chi tiết: Kệ {selectedSlot.shelf} — Ô {selectedSlot.slot}</h3>
              <button className="close-btn" onClick={() => setSelectedSlot(null)}><X size={18} /></button>
            </div>
            
            <div className="modal-body">
              {/* Slot Settings & Status Display */}
              {profile?.role === 'admin' ? (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', padding: '14px 16px', borderRadius: '10px', marginBottom: '20px' }}>
                  <h5 style={{ fontSize: '13.5px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚙️ Cài đặt trạng thái Ô
                  </h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-primary)' }}>
                      <input 
                        type="checkbox" 
                        checked={modalIsFull} 
                        onChange={e => setModalIsFull(e.target.checked)} 
                        style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                      />
                      Đánh dấu ô đã đầy
                    </label>
                    
                    <div style={{ flex: 1, display: 'flex', gap: '8px', minWidth: '220px' }}>
                      <input 
                        type="text" 
                        placeholder="Ghi chú cho ô này (ví dụ: Đầy mẫu QC, không xếp thêm...)" 
                        value={modalNote}
                        onChange={e => setModalNote(e.target.value)}
                        style={{ flex: 1, padding: '6px 10px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none' }}
                      />
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                        onClick={handleSaveSlotConfig}
                        disabled={savingConfig}
                      >
                        {savingConfig ? 'Đang lưu...' : 'Lưu cài đặt'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                (modalIsFull || modalNote) && (
                  <div style={{ background: modalIsFull ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${modalIsFull ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, padding: '12px 14px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px' }}>
                    {modalIsFull && (
                      <div style={{ color: 'var(--status-error)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: modalNote ? '6px' : '0' }}>
                        ⚠️ THỦ KHO BÁO Ô NÀY ĐÃ ĐẦY!
                      </div>
                    )}
                    {modalNote && (
                      <div style={{ color: '#f59e0b', fontStyle: 'italic' }}>
                        <strong>Ghi chú:</strong> {modalNote}
                      </div>
                    )}
                  </div>
                )
              )}

              {selectedSlot.slot === 5 ? (
                // Loose packs slot 5 layout
                <div>
                  <h4 style={{ fontSize: '15px', color: 'var(--accent-purple)', marginBottom: '12px', fontWeight: 'bold' }}>Ô lẻ Kệ {selectedSlot.shelf} (Loose items)</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Nơi lưu giữ các bao thuốc lá lẻ được bóc ra từ cây thuốc nguyên.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {samples.filter(s => s.shelf === selectedSlot.shelf && s.slot === 5 && s.status === 'stored').map(s => (
                      <div key={s.id} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '6px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {s.products?.product_name || s.product_name}
                            {s.products?.warning_code && (
                              <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                                {s.products.warning_code}
                              </span>
                            )}
                          </span>
                          <span style={{ color: 'var(--status-warning)' }}>{s.available_qty} bao lẻ</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Mẻ sợi: {formatBlendBatch(s.blend_batch)} | Ngày SX bao: {new Date(s.packaging_date).toLocaleDateString()} {formatSamplingBox(s.blend_batch)}
                        </div>
                      </div>
                    ))}
                    {samples.filter(s => s.shelf === selectedSlot.shelf && s.slot === 5 && s.status === 'stored').length === 0 && (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '13px' }}>Không có bao lẻ nào ở ô này.</div>
                    )}
                  </div>
                </div>
              ) : (
                // Columns layout for Slot 1-4
                <div>
                  <h4 style={{ fontSize: '15px', color: 'var(--accent-blue)', marginBottom: '12px', fontWeight: 'bold' }}>Sơ đồ các Cột xếp chồng đứng</h4>
                  
                  {/* Visual columns stacks */}
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-start', margin: '24px 0', overflowX: 'auto', padding: '10px 0' }}>
                    {(() => {
                      const slotSamples = samples.filter(s => s.shelf === selectedSlot.shelf && s.slot === selectedSlot.slot && s.status === 'stored');
                      const occupiedCols = slotSamples.map(s => s.column_number);
                      const maxOccupiedCol = occupiedCols.length > 0 ? Math.max(...occupiedCols) : 0;
                      // Consecutively show 1 to maxOccupiedCol + 1 (caps at 8)
                      const colsToRender = Array.from({ length: Math.min(maxOccupiedCol + 1, 8) }, (_, i) => i + 1);

                      return colsToRender.map(col => {
                        const sampleInCol = getColumnProduct(selectedSlot.shelf, selectedSlot.slot, col);
                        const height = getColumnHeight(selectedSlot.shelf, selectedSlot.slot, col);
                        const format = sampleInCol?.products?.format || 'Kingsize';
                        
                        // Use FORMAT_CAPACITIES, fallback to 6 for Kingsize, 10 for Slim based on user request
                        let maxHeight = FORMAT_CAPACITIES[format]?.height || 7;
                        if (format === 'Kingsize') maxHeight = 6; // User explicit visual preference

                        return (
                          <div key={col} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Cột {col}</span>
                            
                            {/* Vertical Column with stacked rectangles */}
                            <div style={{ 
                              width: '100%', 
                              height: '240px', 
                              border: '2px solid var(--glass-border)', 
                              background: 'rgba(255,255,255,0.02)', 
                              borderRadius: '6px', 
                              position: 'relative', 
                              display: 'flex', 
                              flexDirection: 'column-reverse', 
                              overflow: 'hidden' 
                            }}>
                              {(() => {
                                const colSamples = slotSamples.filter(s => s.column_number === col);
                                // Sort ascending by created_at (oldest first, which renders at the bottom due to column-reverse)
                                colSamples.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                                
                                const totalOccupied = colSamples.reduce((sum, s) => sum + Math.ceil(s.available_qty / 10), 0);
                                const emptySlotsCount = maxHeight - totalOccupied;

                                const elements = [];
                                
                                // 1. Render actual batch blocks
                                colSamples.forEach((s, sIdx) => {
                                  const cartons = Math.ceil(s.available_qty / 10);
                                  const blockHeight = cartons * (240 / maxHeight);
                                  elements.push(
                                    <div key={`batch-${s.id || sIdx}`} style={{
                                      height: `${blockHeight}px`,
                                      width: '100%',
                                      background: 'var(--accent-gradient)',
                                      borderTop: '1px solid rgba(255,255,255,0.15)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '2px',
                                      boxSizing: 'border-box',
                                      textAlign: 'center',
                                      overflow: 'hidden',
                                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.2)',
                                      position: 'relative'
                                    }}>
                                      <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffffff', lineHeight: '1.2', textShadow: '0 1px 2px rgba(0,0,0,0.8)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%' }}>
                                        {s.products?.product_name || s.product_name}
                                      </span>
                                      <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.95)', marginTop: '2px', textShadow: '0 1px 2px rgba(0,0,0,0.8)', fontWeight: 600 }}>
                                        {new Date(s.packaging_date).toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'})}
                                      </span>
                                    </div>
                                  );
                                });

                                // 2. Render empty cells grid (for capacity guide)
                                for (let i = 0; i < emptySlotsCount; i++) {
                                  elements.push(
                                    <div key={`empty-${i}`} style={{
                                      height: `${240 / maxHeight}px`,
                                      width: '100%',
                                      borderTop: i > 0 || totalOccupied > 0 ? '1px dashed rgba(255,255,255,0.06)' : 'none',
                                      background: 'transparent'
                                    }}></div>
                                  );
                                }

                                return elements;
                              })()}
                            </div>

                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: height > 0 ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
                              {height > 0 ? `${height}/${maxHeight} cây` : 'Trống'}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '16px 0' }} />

                  {/* List of samples inside slot */}
                  <h4 style={{ fontSize: '14px', marginBottom: '10px', fontWeight: 'bold' }}>Danh sách mẫu trong ô:</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(() => {
                      const slotSamples = samples.filter(s => s.shelf === selectedSlot.shelf && s.slot === selectedSlot.slot && s.status === 'stored');
                      const occupiedCols = slotSamples.map(s => s.column_number);
                      const maxOccupiedCol = occupiedCols.length > 0 ? Math.max(...occupiedCols) : 0;
                      const colsToRender = Array.from({ length: Math.min(maxOccupiedCol + 1, 8) }, (_, i) => i + 1);

                      return colsToRender.map(col => {
                        const colSamples = slotSamples.filter(s => s.column_number === col);
                        if (colSamples.length === 0) return null;
                        
                        const firstSample = colSamples[0];
                        const format = firstSample.products?.format || 'Kingsize';
                        const maxHeight = FORMAT_CAPACITIES[format]?.height || 7;
                        const totalCartons = colSamples.reduce((sum, s) => sum + Math.ceil(s.available_qty / 10), 0);

                        return (
                          <div key={col} style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', fontSize: '13px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', marginBottom: '10px' }}>
                              <span style={{ background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>Cột {col}</span>
                              <strong style={{ fontSize: '14px' }}>{firstSample.products?.product_name || firstSample.product_name}</strong>
                              {firstSample.products?.warning_code && (
                                <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                                  {firstSample.products.warning_code}
                                </span>
                              )}
                              <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
                                Chiều cao: <strong>{totalCartons}/{maxHeight} cây</strong>
                              </span>
                            </div>

                            {/* Render each stacked batch in this column (sorted newest first, which sits on top) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {(() => {
                                const sortedColSamples = [...colSamples].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                                return sortedColSamples.map((sample, sIdx) => {
                                  const cartons = Math.ceil(sample.available_qty / 10);
                                  // Determine position label
                                  let positionBadge = null;
                                  if (sIdx === 0) {
                                    positionBadge = <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: '10px', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold', marginLeft: '8px' }}>[Trên cùng]</span>;
                                  } else if (sIdx === sortedColSamples.length - 1 && sortedColSamples.length > 1) {
                                    positionBadge = <span style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--status-success)', fontSize: '10px', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold', marginLeft: '8px' }}>[Dưới cùng]</span>;
                                  } else if (sortedColSamples.length > 2) {
                                    positionBadge = <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: '10px', padding: '1px 5px', borderRadius: '4px', marginLeft: '8px' }}>[Ở giữa]</span>;
                                  }

                                  return (
                                    <div key={sample.id || sIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', padding: '8px 12px', borderRadius: '6px', fontSize: '12.5px', border: '1px dotted rgba(255,255,255,0.04)' }}>
                                      <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>
                                          Mẻ sợi: {formatBlendBatch(sample.blend_batch)}
                                          {positionBadge}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                          Ngày SX bao: <strong>{new Date(sample.packaging_date).toLocaleDateString('vi-VN')}</strong> {formatSamplingBox(sample.blend_batch)}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                          Mã QR: <strong style={{ color: 'var(--accent-blue)' }}>{sample.sku}</strong> | Số lượng: <strong>{cartons} cây</strong> ({sample.available_qty} bao)
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => setQrCodeModal(sample)}>
                                          <QrCode size={14} /> QR
                                        </button>
                                        {profile?.role === 'admin' && (
                                          <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setMovingSample(sample)}>
                                              <Move size={14} /> Di chuyển
                                            </button>
                                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--status-error)' }} onClick={() => {
                                              if (confirm("Bạn có chắc chắn muốn xuất hủy thủ công lô mẫu này không?")) {
                                                handleDestroySample(sample.id);
                                              }
                                            }}>
                                              <Trash2 size={14} /> Hủy
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedSlot(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* TRAY ADJUSTER MODAL (SIDE BY SIDE MERGE/SPLIT TOOL) */}
      {showTrayAdjusterModal && (() => {
        const pendingS = samples.filter(s => s.status === 'pending');
        const traysList = [...new Set(pendingS.map(s => s.tray_number).filter(t => t !== null && t !== undefined))].sort((a,b)=>a-b);
        
        // Items in source tray
        const sourceItems = pendingS.filter(s => s.tray_number === parseInt(sourceTrayNum, 10));
        
        // Active destination tray number
        const activeDestNum = isNewDestTray ? parseInt(newDestTrayNum, 10) : parseInt(destTrayNum, 10);
        const destItems = (!isNaN(activeDestNum)) ? pendingS.filter(s => s.tray_number === activeDestNum) : [];
        const destTotalCartons = destItems.reduce((sum, s) => sum + Math.round(s.available_qty / 10), 0);

        // Checkbox select all for source
        const allSourceChecked = sourceItems.length > 0 && sourceItems.every(s => sourceSelectedIds.includes(s.id));
        const toggleAllSource = () => {
          if (allSourceChecked) {
            setSourceSelectedIds([]);
          } else {
            setSourceSelectedIds(sourceItems.map(s => s.id));
          }
        };

        return (
          <div className="modal-overlay" onClick={() => setShowTrayAdjusterModal(false)}>
            <div className="modal-content" style={{ maxWidth: '1150px', width: '95%' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardList size={22} color="var(--accent-blue)" /> Công Cụ Dồn & Tách Khay Mẫu Chờ Bố Trí
                </h3>
                <button className="close-btn" onClick={() => setShowTrayAdjusterModal(false)}><X size={18} /></button>
              </div>

              <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 65px 1fr', gap: '20px', padding: '20px', minHeight: '400px' }}>
                
                {/* COLUMN 1: SOURCE TRAY (SENDER) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                    <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display:'block' }}>1. Khay Muốn Chuyển (Khay Gửi)</label>
                    <select className="form-select" value={sourceTrayNum} onChange={e => {
                      setSourceTrayNum(e.target.value);
                      setSourceSelectedIds([]);
                    }}>
                      <option value="">-- Chọn Khay gửi --</option>
                      {traysList.map(t => (
                        <option key={t} value={t}>Khay số {t} ({pendingS.filter(s => s.tray_number === t).length} mẫu)</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: 1, border: '1px solid var(--glass-border)', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.01)' }}>
                    <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0, zIndex: 5 }}>
                            <th style={{ padding: '8px', width: '32px', borderBottom: '1px solid var(--glass-border)' }}>
                              <input type="checkbox" checked={allSourceChecked} onChange={toggleAllSource} disabled={sourceItems.length === 0} style={{ cursor: 'pointer' }} />
                            </th>
                            {['Sản phẩm', 'Mẻ|Thùng', 'Số cây'].map((h, i) => (
                              <th key={i} style={{ padding: '8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sourceItems.map(s => {
                            const isChecked = sourceSelectedIds.includes(s.id);
                            return (
                              <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', background: isChecked ? 'rgba(37,99,235,0.04)' : 'transparent' }}>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  <input type="checkbox" checked={isChecked} onChange={() => {
                                    setSourceSelectedIds(prev =>
                                      prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                    );
                                  }} style={{ cursor: 'pointer' }} />
                                </td>
                                <td style={{ padding: '6px 8px', fontWeight: 500 }}>{s.products?.product_name}</td>
                                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{s.blend_batch}</td>
                                <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{Math.round(s.available_qty / 10)} cây</td>
                              </tr>
                            );
                          })}
                          {sourceItems.length === 0 && (
                            <tr>
                              <td colSpan="4" style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>Chưa có mẫu hoặc chưa chọn Khay gửi</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* MIDDLE COLUMN: TRANSFER BUTTON */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                  <button className="btn btn-primary"
                    style={{ 
                      padding: '12px 10px', 
                      borderRadius: '8px', 
                      background: sourceSelectedIds.length > 0 ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'rgba(255,255,255,0.03)', 
                      borderColor: sourceSelectedIds.length > 0 ? '#1d4ed8' : 'var(--glass-border)',
                      cursor: sourceSelectedIds.length > 0 ? 'pointer' : 'not-allowed',
                      opacity: sourceSelectedIds.length > 0 ? 1 : 0.4
                    }}
                    onClick={handleTransferBetweenTrays}
                    disabled={sourceSelectedIds.length === 0 || loading}>
                    <span style={{ fontSize: '16px', fontWeight: 'bold', display: 'block' }}>➡</span>
                    <span style={{ fontSize: '10px', marginTop: '4px', display: 'block', whiteSpace: 'nowrap' }}>Chuyển ({sourceSelectedIds.length})</span>
                  </button>
                </div>

                {/* COLUMN 2: DESTINATION TRAY (RECEIVER) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label className="form-label" style={{ fontWeight: 'bold', marginBottom: 0 }}>2. Khay Nhận (Khay Đích)</label>
                      <label style={{ fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input type="checkbox" checked={isNewDestTray} onChange={e => {
                          setIsNewDestTray(e.target.checked);
                          if (e.target.checked) {
                            const maxT = traysList.length > 0 ? Math.max(...traysList) : 0;
                            setNewDestTrayNum(String(maxT + 1));
                          }
                        }} />
                        Tạo khay mới
                      </label>
                    </div>

                    {isNewDestTray ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Nhập số khay mới:</span>
                        <input type="number" min="1" value={newDestTrayNum} onChange={e => setNewDestTrayNum(e.target.value)}
                          style={{ flex: 1, padding: '5px 10px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 'bold', outline: 'none' }} />
                      </div>
                    ) : (
                      <select className="form-select" value={destTrayNum} onChange={e => setDestTrayNum(e.target.value)}>
                        <option value="">-- Chọn Khay nhận --</option>
                        {traysList.map(t => (
                          <option key={t} value={t}>Khay số {t} ({pendingS.filter(s => s.tray_number === t).length} mẫu)</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div style={{ flex: 1, border: '1px solid var(--glass-border)', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.01)' }}>
                    <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0, zIndex: 5 }}>
                            {['Sản phẩm', 'Mẻ|Thùng', 'Số cây'].map((h, i) => (
                              <th key={i} style={{ padding: '8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {destItems.map(s => (
                            <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{s.products?.product_name}</td>
                              <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{s.blend_batch}</td>
                              <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{Math.round(s.available_qty / 10)} cây</td>
                            </tr>
                          ))}
                          {destItems.length === 0 && (
                            <tr>
                              <td colSpan="3" style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>Chưa có mẫu (Khay nhận đang trống)</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {destItems.length > 0 && (
                    <div style={{ 
                      padding: '8px 12px', 
                      background: destTotalCartons > 21 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.06)', 
                      border: `1px solid ${destTotalCartons > 21 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.2)'}`, 
                      borderRadius: '6px', 
                      fontSize: '11.5px', 
                      color: destTotalCartons > 21 ? 'var(--status-error)' : 'var(--status-success)',
                      fontWeight: 'bold',
                      textAlign: 'center'
                    }}>
                      Khay nhận hiện có: {destTotalCartons} cây {destTotalCartons > 21 ? '⚠️ Quá tải (Nên ≤ 21 cây)' : '✓ Đủ tải'}
                    </div>
                  )}
                </div>

              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowTrayAdjusterModal(false)}>Đóng công cụ</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MOVE SAMPLE POSITION MODAL */}
      {movingSample && (
        <div className="modal-overlay" onClick={() => setMovingSample(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowRightLeft size={20} color="var(--accent-blue)" /> Di Chuyển Vị Trí Mẫu
              </h3>
              <button className="close-btn" onClick={() => setMovingSample(null)}><X size={18} /></button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <strong style={{ fontSize: '15px' }}>{movingSample.products?.product_name || movingSample.product_name}</strong>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Mẻ sợi: {formatBlendBatch(movingSample.blend_batch)} | SKU: {movingSample.sku}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Vị trí hiện tại: <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>
                    {movingSample.shelf 
                      ? formatLocation(movingSample.shelf, movingSample.slot, movingSample.column_number)
                      : movingSample.box_id
                        ? `Thùng ${boxes.find(b => b.id === movingSample.box_id)?.box_name || '—'}`
                        : `Khay số ${movingSample.tray_number || '—'} (Chờ bố trí)`}
                  </span>
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Hình thức lưu trữ mới</label>
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                    <input type="radio" name="moveType" value="shelves" checked={moveType === 'shelves'} onChange={() => setMoveType('shelves')} />
                    Lên kệ kho
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                    <input type="radio" name="moveType" value="box" checked={moveType === 'box'} onChange={() => setMoveType('box')} />
                    Vào thùng lưu trữ
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                    <input type="radio" name="moveType" value="pending" checked={moveType === 'pending'} onChange={() => setMoveType('pending')} />
                    Khay chờ bố trí
                  </label>
                </div>
              </div>
              
              {moveType === 'shelves' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Chọn Kệ</label>
                    <select className="form-select" value={moveShelf} onChange={e => setMoveShelf(parseInt(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6].map(shelf => (
                        <option key={shelf} value={shelf}>Kệ {['', 'A', 'B', 'C', 'D', 'E', 'F'][shelf]}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Chọn Ô</label>
                    <select className="form-select" value={moveSlot} onChange={e => setMoveSlot(parseInt(e.target.value))}>
                      {[1, 2, 3, 4, 5].map(slot => (
                        <option key={slot} value={slot}>{slot === 5 ? 'Ô 5 (Lẻ)' : `Ô ${slot}`}</option>
                      ))}
                    </select>
                  </div>
                  
                  {moveSlot !== 5 && (
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Chọn Cột</label>
                      <select className="form-select" value={moveColumn} onChange={e => setMoveColumn(parseInt(e.target.value))}>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(col => (
                          <option key={col} value={col}>Cột {col}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              
              {moveType === 'box' && (
                <div className="form-group">
                  <label className="form-label">Chọn Thùng</label>
                  {boxes.length > 0 ? (
                    <select className="form-select" value={moveBoxId} onChange={e => setMoveBoxId(e.target.value)}>
                      {boxes.map(b => (
                        <option key={b.id} value={b.id}>Thùng {b.box_name} ({b.description || 'Không mô tả'})</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ color: 'var(--status-error)', fontSize: '13px', marginTop: '6px' }}>
                      Chưa có thùng lưu trữ nào được tạo! Hãy tạo thùng trong tab Đóng Thùng trước.
                    </div>
                  )}
                </div>
              )}
              
              {moveType === 'pending' && (
                <div className="form-group">
                  <label className="form-label">Số Khay Chờ Bố Trí</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="Nhập số khay..." 
                    value={moveTrayNumber} 
                    onChange={e => setMoveTrayNumber(e.target.value)} 
                    min="1"
                  />
                </div>
              )}
            </div>
            
            <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setMovingSample(null)}>Hủy</button>
              <button 
                className="btn btn-primary" 
                disabled={moveType === 'box' && boxes.length === 0}
                onClick={() => handleMoveSample(movingSample.id, moveType, {
                  shelf: moveShelf,
                  slot: moveSlot,
                  column_number: moveColumn,
                  box_id: moveBoxId,
                  tray_number: moveTrayNumber ? parseInt(moveTrayNumber) : null
                })}
              >
                Xác nhận di chuyển
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR CODE MODAL FOR PRINTING */}
      {qrCodeModal && (
        <div className="modal-overlay" onClick={() => setQrCodeModal(null)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Mã QR Nhãn Cây Mẫu</h3>
              <button className="close-btn" onClick={() => setQrCodeModal(null)}><X size={18} /></button>
            </div>
            
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
              <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', display: 'inline-block', border: '1px solid #ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginBottom: '20px' }}>
                {/* Real QR image dynamically generated */}
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(JSON.stringify({
                    sku: qrCodeModal.sku,
                    product: qrCodeModal.products?.product_name || qrCodeModal.product_name,
                    warning: qrCodeModal.products?.warning_code || 'Không',
                    order: qrCodeModal.order_number || 'N/A',
                    blend_batch: qrCodeModal.blend_batch,
                    blend_date: qrCodeModal.blend_date,
                    packaging_date: qrCodeModal.packaging_date,
                    sampling_time: qrCodeModal.sampling_time,
                    location: formatLocation(qrCodeModal.shelf, qrCodeModal.slot, qrCodeModal.column_number)
                  }))}`}
                  alt={qrCodeModal.sku} 
                  style={{ width: '160px', height: '160px', display: 'block' }}
                />
                <div style={{ color: '#000', fontSize: '13px', fontWeight: 'bold', marginTop: '8px' }}>{qrCodeModal.sku}</div>
              </div>

              <div style={{ fontSize: '13px', textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div><strong>Sản phẩm:</strong> <span style={{ color: 'var(--text-primary)' }}>{qrCodeModal.products?.product_name || qrCodeModal.product_name}</span></div>
                <div><strong>Cảnh báo bao:</strong> <span style={{ color: 'var(--text-primary)' }}>{qrCodeModal.products?.warning_code || 'Không cảnh báo'}</span></div>
                {qrCodeModal.order_number && <div><strong>Số đơn hàng XK:</strong> <span style={{ color: 'var(--text-primary)' }}>{qrCodeModal.order_number}</span></div>}
                <div><strong>Mẻ sợi:</strong> <span style={{ color: 'var(--text-primary)' }}>{formatBlendBatch(qrCodeModal.blend_batch)}</span></div>
                <div><strong>Ngày SX sợi:</strong> <span style={{ color: 'var(--text-primary)' }}>{new Date(qrCodeModal.blend_date).toLocaleDateString()}</span></div>
                <div><strong>Ngày SX bao:</strong> <span style={{ color: 'var(--text-primary)' }}>{new Date(qrCodeModal.packaging_date).toLocaleDateString()} {formatSamplingBox(qrCodeModal.blend_batch)}</span></div>
                <div><strong>Thời gian lấy:</strong> <span style={{ color: 'var(--text-primary)' }}>{new Date(qrCodeModal.sampling_time).toLocaleString()}</span></div>
                <div><strong>Vị trí lưu kho:</strong> <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>{formatLocation(qrCodeModal.shelf, qrCodeModal.slot, qrCodeModal.column_number)}</span></div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setQrCodeModal(null)}>Đóng</button>
              <button className="btn btn-primary" onClick={() => printQrSticker(qrCodeModal)}>In Nhãn dán</button>
            </div>
          </div>
        </div>
      )}

      {/* OVERCAPACITY BOX PACKING MANIFEST MODAL */}
      {manifestModal && (
        <div className="modal-overlay" onClick={() => setManifestModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Nhãn Phụ Thùng Lưu Trữ Quá Tải</h3>
              <button className="close-btn" onClick={() => setManifestModal(null)}><X size={18} /></button>
            </div>
            
            <div className="modal-body">
              <div style={{ border: '2px dashed var(--accent-blue)', padding: '20px', borderRadius: '12px', background: 'rgba(59,130,246,0.03)', textAlign: 'center', marginBottom: '20px' }}>
                <h4 style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--accent-blue)', textTransform: 'uppercase' }}>{manifestModal.box_name}</h4>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Mã thùng: {manifestModal.id}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Ngày đóng gói: {new Date(manifestModal.created_at).toLocaleDateString()}</div>
              </div>

              <h4 style={{ fontSize: '14px', marginBottom: '10px', fontWeight: 'bold' }}>Danh sách mẫu trong thùng này:</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {manifestModal.samples?.map(s => (
                  <div key={s.id} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '6px', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.products?.product_name || s.product_name}</span>
                    <strong style={{ color: 'var(--accent-blue)' }}>{s.available_qty} bao</strong>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setManifestModal(null)}>Đóng</button>
              <button className="btn btn-primary" onClick={() => printBoxManifest(manifestModal)}>Xuất File PDF In Nhãn Thùng</button>
            </div>
          </div>
        </div>
      )}

      {/* TAKEN LOCATION INFO MODAL (Shown only after take request confirmation) */}
      {takenLocationModal && (
        <div className="modal-overlay" onClick={() => setTakenLocationModal(null)}>
          <div className="modal-content" style={{ maxWidth: '400px', border: '1px solid var(--status-success)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(16,185,129,0.2)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={20} /> Đăng Ký Lấy Mẫu Thành Công!
              </h3>
              <button className="close-btn" onClick={() => setTakenLocationModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
              <p style={{ fontSize: '14px', marginBottom: '16px' }}>
                Đã ghi nhận yêu cầu lấy <strong>{takenLocationModal.qty} bao</strong> của sản phẩm <strong>{takenLocationModal.product_name}</strong>.
              </p>
              <div style={{ padding: '16px', background: 'rgba(16,185,129,0.08)', border: '1px solid var(--status-success)', borderRadius: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Vị trí bạn cần lấy mẫu:</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--status-success)' }}>
                  {takenLocationModal.location}
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Vui lòng đến đúng vị trí trên để lấy mẫu. Hệ thống đã ghi nhận số liệu giảm trừ kho.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" style={{ background: 'var(--status-success)', borderColor: 'var(--status-success)', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setTakenLocationModal(null)}>
                Đã hiểu và đi lấy mẫu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAME PROMPT MODAL */}
      {showNamePrompt && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '400px', border: '1px solid var(--accent-blue)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(99,102,241,0.25)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={20} /> Xin chào! Bạn tên gì?
              </h3>
            </div>
            <div className="modal-body" style={{ padding: '20px 20px' }}>
              <input
                className="form-input"
                type="text"
                placeholder="Nhập tên của bạn..."
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveVisitorName()}
                autoFocus
              />
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { window.location.href = 'https://www.google.com.vn'; }}>
                Bỏ qua
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={saveVisitorName}>
                <Check size={16} /> Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
