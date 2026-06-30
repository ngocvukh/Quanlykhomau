import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  Search, Plus, LogIn, LogOut, Moon, Sun, Layers, Database,
  FileText, Check, X, ShieldAlert, Archive, QrCode, Save,
  ClipboardList, Info, Trash2, User, ChevronRight, Box, ArrowRightLeft, Loader
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

// Format capacity mapping
const FORMAT_CAPACITIES = {
  'Kingsize': { columns: 6, height: 7, total: 42 },
  'SuperSlim': { columns: 6, height: 10, total: 60 },
  'Semi': { columns: 6, height: 7, total: 42 },
  'Demi': { columns: 8, height: 7, total: 56 },
  'Slim': { columns: 6, height: 10, total: 60 }
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

// Format composite blend_batch containing box sequence number (like 123|15 -> Mẻ 123 (Thùng: 15))
const formatBlendBatch = (val) => {
  if (!val) return '';
  const parts = val.split('|');
  if (parts.length === 2) {
    return `Mẻ ${parts[0]} (Thùng lấy mẫu: ${parts[1]})`;
  }
  return val;
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

  // Database States
  const [products, setProducts] = useState([]);
  const [samples, setSamples] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [profilesList, setProfilesList] = useState([]);

  // Application UI States
  const [activeTab, setActiveTab] = useState('search'); // 'search', 'shelves', 'import', 'catalog', 'requests', 'archives'
  const [theme, setTheme] = useState('dark');
  const [toasts, setToasts] = useState([]);
  
  // Offline / Demo Mode fallback (for instant preview without Supabase keys)
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Modal / Detail States
  const [selectedSlot, setSelectedSlot] = useState(null); // { shelf, slot }
  const [qrCodeModal, setQrCodeModal] = useState(null); // sample object
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
  const [importBlendDateStr, setImportBlendDateStr] = useState(getTodayDMY());
  const [importPackagingDateStr, setImportPackagingDateStr] = useState(getTodayDMY());
  const [importSamplingDateStr, setImportSamplingDateStr] = useState(getTodayDMY());
  
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

  // Staff Search Form
  const [searchName, setSearchName] = useState('');
  const [searchSelMonth, setSearchSelMonth] = useState('');
  const [searchSelYear, setSearchSelYear] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [takeQuantities, setTakeQuantities] = useState({});
  const [takeNotes, setTakeNotes] = useState({});

  // Batch Print Label Queue (persisted in LocalStorage)
  const [printQueue, setPrintQueue] = useState(() => {
    const saved = localStorage.getItem('print_queue');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('print_queue', JSON.stringify(printQueue));
  }, [printQueue]);

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
          fetchProfile(session.user.id);
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

  // Fetch user profile from profiles table
  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      setProfile(data);
      if (data.role === 'admin') {
        setActiveTab('shelves');
      }
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
      if (fallback.role === 'admin') setActiveTab('shelves');
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
      setActiveTab(authRole === 'admin' ? 'shelves' : 'search');
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
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword
        });
        if (error) throw error;
        showToast("Đăng ký thành công! Đang tạo thông tin...", "success");
        if (data.user) {
          await createFallbackProfile(data.user.id);
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
      const regex = new RegExp(val, 'i');
      const matches = products.filter(p => regex.test(p.product_name)).slice(0, 10);
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

    const importBlendDate = blendD.toISOString().split('T')[0];
    const importPackagingDate = packD.toISOString().split('T')[0];
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
      entry_date: new Date().toISOString().split('T')[0],
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
      setImportBlendDateStr(getTodayDMY());
      setImportPackagingDateStr(getTodayDMY());
      setImportSamplingDateStr(getTodayDMY());
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
        setImportBlendDateStr(getTodayDMY());
        setImportPackagingDateStr(getTodayDMY());
        setImportSamplingDateStr(getTodayDMY());
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

  // Staff Search Execution
  const executeSearch = (nameVal, monthVal) => {
    if (!nameVal) {
      showToast("Tên sản phẩm là bắt buộc!", "warning");
      return;
    }

    const regex = new RegExp(nameVal, 'i');
    let filtered = samples.filter(s => {
      const prodName = s.products?.product_name || s.product_name || '';
      return regex.test(prodName) && s.status !== 'destroyed';
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
  };

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    executeSearch(searchName, searchMonth);
  };

  const handleSearchInputChange = (val) => {
    setSearchName(val);
    if (val.trim().length >= 1) {
      const regex = new RegExp(val, 'i');
      const matches = products.filter(p => regex.test(p.product_name)).slice(0, 8);
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
        : `Thùng ${boxes.find(b => b.id === sample.box_id)?.box_name || 'Không xác định'}`;
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
          user_id: profile.id,
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
          : `Thùng ${boxes.find(b => b.id === sample.box_id)?.box_name || 'Không xác định'}`;
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
                  <td>${new Date(s.packaging_date).toLocaleDateString()}</td>
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
  const printMultipleQrStickers = (samplesToPrint) => {
    if (!samplesToPrint || samplesToPrint.length === 0) {
      showToast("Không có mẫu nào để in!", "warning");
      return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast("Không thể mở cửa sổ in. Vui lòng tắt trình chặn Pop-up!", "error");
      return;
    }

    const stickersHtml = samplesToPrint.map(s => {
      const qrData = encodeURIComponent(JSON.stringify({
        sku: s.sku,
        product: s.products?.product_name || s.product_name,
        warning: s.products?.warning_code || 'Không',
        order: s.order_number || 'N/A',
        blend_batch: s.blend_batch,
        blend_date: s.blend_date,
        packaging_date: s.packaging_date,
        sampling_time: s.sampling_time,
        location: formatLocation(s.shelf, s.slot, s.column_number)
      }));
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;

      return `
        <div class="sticker">
          <div class="qr-section">
            <img src="${qrUrl}" alt="${s.sku}" />
            <div class="sku-text">${s.sku}</div>
          </div>
          <div class="info-section">
            <div class="info-title">Nhãn Mẫu Thuốc Lá</div>
            <div class="info-row">
              <span class="info-label">Sản phẩm:</span>
              <span class="info-val" style="font-weight: bold;">${s.products?.product_name || s.product_name}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Cảnh báo:</span>
              <span class="info-val">${s.products?.warning_code || 'Không cảnh báo'}</span>
            </div>
            ${s.order_number ? `
            <div class="info-row">
              <span class="info-label">Số Order:</span>
              <span class="info-val">${s.order_number}</span>
            </div>` : ''}
            <div class="info-row">
              <span class="info-label">Mẻ sợi:</span>
              <span class="info-val">${formatBlendBatch(s.blend_batch)}</span>
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
              <span class="info-label">Thời gian lấy:</span>
              <span class="info-val">${new Date(s.sampling_time).toLocaleString()}</span>
            </div>
            <div class="info-row" style="margin-top: 3px;">
              <span class="info-label">Vị trí lưu:</span>
              <span class="info-val" style="font-weight: bold; color: #000;">${formatLocation(s.shelf, s.slot, s.column_number).toUpperCase()}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
      <head>
        <title>In Hàng Loạt Nhãn Cây Mẫu</title>
        <style>
          @page {
            size: 100mm 75mm;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background-color: #fff;
            color: #000;
          }
          .sticker {
            width: 100mm;
            height: 75mm;
            box-sizing: border-box;
            padding: 8px;
            display: flex;
            gap: 8px;
            page-break-after: always;
            overflow: hidden;
            border-bottom: 1px dashed #ccc;
          }
          @media print {
            .sticker {
              border-bottom: none;
            }
          }
          .qr-section {
            width: 32mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border-right: 1px dashed #ccc;
            padding-right: 6px;
          }
          .qr-section img {
            width: 28mm;
            height: 28mm;
            display: block;
          }
          .sku-text {
            font-size: 9px;
            font-weight: bold;
            margin-top: 4px;
            text-align: center;
          }
          .info-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            font-size: 8.5px;
            line-height: 1.3;
          }
          .info-title {
            font-size: 11px;
            font-weight: bold;
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
            width: 24mm;
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
        ${stickersHtml}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
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
                <td class="val">${new Date(sample.packaging_date).toLocaleDateString()}</td>
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
          
          {/* TAB NAVIGATION BAR */}
          <div className="glass-panel" style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {/* Common Tab */}
              <button className={`btn ${activeTab === 'search' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('search')}>
                <Search size={16} /> Tìm Kiếm Mẫu
              </button>

              {/* Admin-only Tabs */}
              {(profile?.role === 'admin') && (
                <>
                  <button className={`btn ${activeTab === 'shelves' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('shelves')}>
                    <Database size={16} /> Sơ Đồ Kệ Kho
                  </button>
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
                  <button className={`btn ${activeTab === 'archives' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('archives')}>
                    <Archive size={16} /> Đóng Thùng & Hủy
                    {getExpiredSamples().length > 0 && (
                      <span style={{ background: 'var(--status-error)', color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold', marginLeft: '4px' }}>
                        {getExpiredSamples().length} quá hạn
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Back button from Guest Guest Mode */}
            {authMode === 'guest' && (
              <button className="btn btn-secondary" style={{ borderColor: 'var(--status-warning)', color: 'var(--status-warning)' }} onClick={() => setAuthMode('login')}>
                Thoát Khách (Đăng Nhập Admin)
              </button>
            )}
          </div>

          {/* TAB CONTENTS */}
          <div style={{ flex: 1 }}>
            {activeTab === 'search' && (
              <div className="glass-panel">
                <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Search size={22} color="var(--accent-blue)" /> Tra Cứu Và Tìm Kiếm Thuốc Lá Mẫu
                </h2>
                
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '24px', position: 'relative' }}>
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
                              const monthVal = (searchSelYear && searchSelMonth) ? `${searchSelYear}-${searchSelMonth}` : '';
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

                {/* SEARCH RESULTS */}
                <div style={{ marginTop: '24px' }}>
                  <h3 style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Kết quả tìm kiếm ({searchResults.length})</h3>
                  
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
                              <div><strong>Ngày SX bao:</strong> {new Date(s.packaging_date).toLocaleDateString()}</div>
                              <div><strong>Tồn khả dụng:</strong> <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{s.available_qty} bao</span> ({Math.floor(s.available_qty/10)} cây, {s.available_qty%10} bao lẻ)</div>
                              {s.order_number && <div><strong>Số đơn hàng:</strong> {s.order_number}</div>}
                              <div><strong>Cảnh báo bao:</strong> {s.products?.warning_code || 'Không'}</div>
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

                                <button 
                                  className="btn btn-primary" 
                                  style={{ height: '36px', padding: '0 16px', fontSize: '13px', alignSelf: 'flex-end' }}
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

                            return (
                              <div 
                                key={slot} 
                                className="glass-panel" 
                                style={{ 
                                  padding: '14px 12px', 
                                  cursor: 'pointer', 
                                  background: isLooseSlot ? 'rgba(139, 92, 246, 0.05)' : hasItems ? 'rgba(59, 130, 246, 0.05)' : 'var(--glass-bg)', 
                                  borderColor: isLooseSlot ? 'rgba(139, 92, 246, 0.3)' : isFull ? 'var(--status-error)' : hasItems ? 'var(--accent-blue)' : 'var(--glass-border)', 
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
                                  {hasItems && !isLooseSlot && <span style={{ color: isFull ? 'var(--status-error)' : 'var(--accent-blue)' }}>{uPct}%</span>}
                                </div>

                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                {hasItems ? (
                                  isLooseSlot ? (
                                    <span>Đang chứa: <strong>{totalItems} bao</strong></span>
                                  ) : (
                                    <span>Đang xếp: <strong>{Math.ceil(totalItems)} cây</strong></span>
                                  )
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>Trống</span>
                                )}
                              </div>

                              {/* Visual filling gauge */}
                              {hasItems && !isLooseSlot && (
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
                        required 
                        value={importBlendDateStr} 
                        onChange={e => setImportBlendDateStr(e.target.value)} 
                        onBlur={e => setImportBlendDateStr(autoFormatDate(e.target.value))}
                        placeholder="DD/MM/YYYY (Ví dụ: 26/05/2026)" 
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ngày sản xuất bao <span style={{ color: 'red' }}>*</span></label>
                      <input 
                        className="form-input" 
                        type="text" 
                        required 
                        value={importPackagingDateStr} 
                        onChange={e => {
                          const val = e.target.value;
                          setImportPackagingDateStr(val);
                          setImportSamplingDateStr(val);
                          const parts = val.split('/');
                          if (parts.length === 3 && parts[2].length === 4) {
                            const d = parseInt(parts[0], 10);
                            const m = parseInt(parts[1], 10) - 1;
                            const y = parseInt(parts[2], 10);
                            const dateObj = new Date(y, m, d);
                            if (!isNaN(dateObj.getTime()) && dateObj.getDate() === d) {
                              dateObj.setDate(dateObj.getDate() - 1);
                              const pD = String(dateObj.getDate()).padStart(2, '0');
                              const pM = String(dateObj.getMonth() + 1).padStart(2, '0');
                              setImportBlendDateStr(`${pD}/${pM}/${dateObj.getFullYear()}`);
                            }
                          }
                        }} 
                        onBlur={e => {
                          const formatted = autoFormatDate(e.target.value);
                          setImportPackagingDateStr(formatted);
                          setImportSamplingDateStr(formatted);
                          const parts = formatted.split('/');
                          if (parts.length === 3) {
                            const d = parseInt(parts[0], 10);
                            const m = parseInt(parts[1], 10) - 1;
                            const y = parseInt(parts[2], 10);
                            const dateObj = new Date(y, m, d);
                            if (!isNaN(dateObj.getTime()) && dateObj.getDate() === d) {
                              dateObj.setDate(dateObj.getDate() - 1);
                              const pD = String(dateObj.getDate()).padStart(2, '0');
                              const pM = String(dateObj.getMonth() + 1).padStart(2, '0');
                              setImportBlendDateStr(`${pD}/${pM}/${dateObj.getFullYear()}`);
                            }
                          }
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
                          required 
                          value={importSamplingDateStr} 
                          onChange={e => setImportSamplingDateStr(e.target.value)} 
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

            {/* BATCH PRINT LABEL QUEUE VIEW */}
            {activeTab === 'labels' && (
              <div className="glass-panel">
                <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <QrCode size={22} color="var(--accent-blue)" /> Hàng Đợi In Nhãn Hàng Loạt ({printQueue.length})
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
                  Tất cả các lô mẫu khi nhập kho sẽ được tự động lưu trữ vào hàng đợi này. Bạn có thể in hàng loạt nhãn dán kích thước 100mm x 75mm cùng lúc.
                </p>

                {printQueue.length > 0 ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                      <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Tổng số nhãn trong hàng đợi: <strong>{printQueue.length} nhãn</strong>.
                      </span>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn btn-secondary" onClick={() => {
                          if (confirm("Bạn có chắc chắn muốn xóa toàn bộ hàng đợi in nhãn?")) {
                            setPrintQueue([]);
                          }
                        }}>
                          Xóa toàn bộ hàng đợi
                        </button>
                        <button className="btn btn-primary" onClick={() => printMultipleQrStickers(printQueue)}>
                          <QrCode size={16} /> In Hàng Loạt ({printQueue.length} Nhãn)
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {printQueue.map((s, idx) => (
                        <div key={s.id || idx} style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>{s.products?.product_name || s.product_name}</strong>
                              <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>{s.sku}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                              <div>Mẻ sợi: <strong>{formatBlendBatch(s.blend_batch)}</strong></div>
                              <div>Ngày SX bao: <strong>{new Date(s.packaging_date).toLocaleDateString()}</strong></div>
                              <div>Vị trí xếp: <strong style={{ color: 'var(--accent-blue)' }}>Kệ {s.shelf} - Ô {s.slot} - Cột {s.column_number}</strong></div>
                            </div>
                          </div>
                          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', borderColor: 'var(--status-error)', color: 'var(--status-error)' }} onClick={() => {
                            setPrintQueue(prev => prev.filter((_, i) => i !== idx));
                          }}>
                            Xóa khỏi hàng đợi
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-muted)' }}>
                    <QrCode size={48} style={{ opacity: 0.15, marginBottom: '16px' }} />
                    <p style={{ fontSize: '15px' }}>Không có nhãn dán nào trong hàng đợi in.</p>
                    <p style={{ fontSize: '13px', marginTop: '4px' }}>Sau khi tiến hành nhập kho mẫu mới ở tab "Nhập Kho Mẫu", nhãn sẽ tự động được xếp vào đây.</p>
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
                  <div className="glass-panel" style={{ maxHeight: '550px', overflowY: 'auto' }}>
                    <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Danh sách sản phẩm gốc ({products.length})</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {products.map((p, idx) => (
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
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => startEditingProduct(p)}>
                            Sửa
                          </button>
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
                          Mẻ sợi: {formatBlendBatch(s.blend_batch)} | Ngày SX bao: {new Date(s.packaging_date).toLocaleDateString()}
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
                              {Array.from({ length: maxHeight }).map((_, idx) => {
                                const isOccupied = idx < height;
                                return (
                                  <div key={idx} style={{
                                    flex: 1,
                                    width: '100%',
                                    borderBottom: idx > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                                    background: isOccupied ? 'rgba(74, 144, 226, 0.25)' : 'transparent',
                                  }}></div>
                                );
                              })}
                              
                              {/* Overlay content */}
                              {sampleInCol && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  left: 0,
                                  width: '100%',
                                  height: `${Math.min(height / maxHeight, 1) * 100}%`,
                                  background: height >= maxHeight ? 'var(--status-error)' : 'var(--accent-gradient)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '4px',
                                  textAlign: 'center',
                                  transition: 'height 0.3s ease',
                                  boxShadow: 'inset 0 0 10px rgba(0,0,0,0.2)'
                                }}>
                                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#ffffff', lineHeight: '1.2', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                    {sampleInCol.products?.product_name || sampleInCol.product_name}
                                  </span>
                                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.9)', marginTop: '4px', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                    {new Date(sampleInCol.packaging_date).toLocaleDateString('vi-VN')}
                                  </span>
                                </div>
                              )}
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
                        const sample = getColumnProduct(selectedSlot.shelf, selectedSlot.slot, col);
                        if (!sample) return null;
                        const format = sample.products?.format || 'Kingsize';
                        const maxHeight = FORMAT_CAPACITIES[format]?.height || 7;
                        const cartons = Math.ceil(sample.available_qty / 10);
                        
                        return (
                          <div key={col} style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Cột {col}</span>
                                <strong>{sample.products?.product_name || sample.product_name}</strong>
                                {sample.products?.warning_code && (
                                  <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                                    {sample.products.warning_code}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Mẻ sợi: {formatBlendBatch(sample.blend_batch)} | Ngày SX bao: {new Date(sample.packaging_date).toLocaleDateString()}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Mã QR: <strong>{sample.sku}</strong> | Chiều cao: <strong>{cartons}/{maxHeight} cây</strong>
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => setQrCodeModal(sample)}>
                                <QrCode size={14} /> QR
                              </button>
                              {profile?.role === 'admin' && (
                                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--status-error)' }} onClick={() => {
                                  if (confirm("Bạn có chắc chắn muốn xuất hủy thủ công lô mẫu này không?")) {
                                    handleDestroySample(sample.id);
                                  }
                                }}>
                                  <Trash2 size={14} /> Hủy
                                </button>
                              )}
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
                <div><strong>Ngày SX bao:</strong> <span style={{ color: 'var(--text-primary)' }}>{new Date(qrCodeModal.packaging_date).toLocaleDateString()}</span></div>
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
    </div>
  );
}
