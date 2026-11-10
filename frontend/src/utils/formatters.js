import QRCode from 'qrcode';

// ── Tách tên người yêu cầu và mục đích từ ghi chú yêu cầu lấy mẫu ──
// Ghi chú cũ có dạng "[Khách: Tên] Mục đích" → trả về { name, purpose }
export const UNKNOWN_REQUESTER = 'Không xác định';

export const parseRequestNote = (note) => {
  const raw = (note || '').trim();
  let name = '';
  let deviceId = '';
  let rejectReason = '';
  let rest = raw;

  const mReject = rest.match(/\[(?:Lý do từ chối|Từ chối):\s*([^\]]*)\]/i);
  if (mReject) {
    rejectReason = (mReject[1] || '').trim();
    rest = rest.replace(mReject[0], '').trim();
  }

  const m = rest.match(/^\[(?:Khách|Người yêu cầu):\s*([^\]]*)\]\s*/i);
  if (m) {
    name = (m[1] || '').trim();
    if (!name || name === 'Khách ẩn danh' || name === UNKNOWN_REQUESTER) name = '';
    rest = rest.slice(m[0].length).trim();
  }

  const mDev = rest.match(/\[dev:\s*([^\]]+)\]/i);
  if (mDev) {
    deviceId = (mDev[1] || '').trim();
    rest = rest.replace(mDev[0], '').trim();
  }

  return { name, purpose: rest, deviceId, rejectReason };
};

export const getRequesterLabel = (tx) => {
  const fullName = (tx?.profiles?.full_name || '').trim();
  const empCode = (tx?.profiles?.employee_code || '').trim();
  if (fullName) return empCode ? `${fullName} (${empCode})` : fullName;
  const { name } = parseRequestNote(tx?.note);
  return name || UNKNOWN_REQUESTER;
};

// HTML Escape helper for safe document.write / innerHTML templates
export const escapeHtml = (str) => String(str ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

// Format capacity mapping (Mỗi ô kệ rộng tối đa 700mm)
export const SLOT_MAX_WIDTH_MM = 700;
export const FORMAT_CAPACITIES = {
  'Kingsize': { width: 90, columns: 7, height: 6, total: 42 },
  'SuperSlim': { width: 105, columns: 6, height: 10, total: 60 },
  'Semi': { width: 98, columns: 7, height: 6, total: 42 },
  'Demi': { width: 90, columns: 7, height: 7, total: 49 },
  'Slim': { width: 105, columns: 6, height: 10, total: 60 }
};

export const getFormatSpec = (fmt) => FORMAT_CAPACITIES[fmt] || FORMAT_CAPACITIES['Kingsize'];

// Tạo mã QR dạng SVG nội tuyến (Offline 100%, không bao giờ mất mã QR khi in)
export const generateQrSvgMarkup = (text) => {
  try {
    const qr = QRCode.create(text || 'N/A', { errorCorrectionLevel: 'Q' });
    const size = qr.modules.size;
    const data = qr.modules.data;
    const margin = 1;
    const total = size + margin * 2;
    let path = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (data[r * size + c]) {
          path += `M${c + margin},${r + margin}h1v1h-1z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" style="width:100%;height:auto;display:block;aspect-ratio:1/1;"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
  } catch (e) {
    console.error('QR generation error:', e);
    return '';
  }
};

export const liveFormatDate = (value, prevValue) => {
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
export const autoFormatDate = (value) => {
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
export const autoFormatTime = (value) => {
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
export const formatBlendBatch = (val) => {
  if (!val) return '';
  const parts = val.split('|');
  if (parts.length === 2) {
    return `Mẻ ${parts[0]}`;
  }
  return val;
};

export const formatSamplingBox = (val) => {
  if (!val) return '';
  const parts = val.split('|');
  if (parts.length === 2) {
    return `(Thùng lấy mẫu: ${parts[1]})`;
  }
  return '';
};

// Format location into coordinate A1, B5, etc.
export const formatLocation = (shelf, slot, column) => {
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

// ── Giải mã Code 6 ký tự sản phẩm xuất khẩu (bảng mã SINGAPOREZ) thành ngày sản xuất ──
export const decodeExportProductionCode = (rawInput) => {
  if (!rawInput) return null;
  const code = rawInput.trim().toUpperCase();
  if (!/^[SINGAPOREZ]{6}$/.test(code)) return null;

  const dayMap = { S: 1, I: 2, N: 3, G: 4, A: 5, P: 6, O: 7 };
  const dayNameMap = { S: 'Thứ Hai', I: 'Thứ Ba', N: 'Thứ Tư', G: 'Thứ Năm', A: 'Thứ Sáu', P: 'Thứ Bảy', O: 'Chủ Nhật' };
  const digitMap = { S: 1, I: 2, N: 3, G: 4, A: 5, P: 6, O: 7, R: 8, E: 9, Z: 0 };
  const yearMap = { S: 2021, I: 2022, N: 2023, G: 2024, A: 2025, P: 2026, O: 2027, R: 2028, E: 2029, Z: 2030 };

  const isoDayOfWeek = dayMap[code[0]]; // 1 (Thứ Hai) -> 7 (Chủ Nhật)
  if (!isoDayOfWeek) return null;

  const d2 = digitMap[code[1]];
  const d3 = digitMap[code[2]];
  const year = yearMap[code[5]];
  if (d2 === undefined || d3 === undefined || !year) return null;

  const week = d2 * 10 + d3;
  if (week < 1 || week > 53) return null;

  // Tính ngày theo chuẩn ISO-8601 week date (Tuần 1 là tuần có ngày 04/01)
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Chủ Nhật = 7
  const week1Monday = new Date(year, 0, 4 - (jan4Day - 1));

  const targetDate = new Date(week1Monday);
  targetDate.setDate(week1Monday.getDate() + (week - 1) * 7 + (isoDayOfWeek - 1));

  const dd = String(targetDate.getDate()).padStart(2, '0');
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const yyyy = targetDate.getFullYear();

  return {
    code,
    dayName: dayNameMap[code[0]],
    week,
    year,
    dateObj: targetDate,
    dmy: `${dd}/${mm}/${yyyy}`,
    ymd: `${yyyy}-${mm}-${dd}`
  };
};

