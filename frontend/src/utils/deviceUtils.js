// ── Nhận diện model iPhone chuẩn xác qua thông số phần cứng vật lý (Screen, DPR) ──
export const getIphoneModel = () => {
  if (typeof window === 'undefined') return 'iPhone';
  const w = Math.min(window.screen.width, window.screen.height);
  const h = Math.max(window.screen.width, window.screen.height);
  const dpr = Math.round(window.devicePixelRatio || 1);

  // 1. iPhone 16 Series
  if (w === 440 && h === 956) return 'iPhone 16 Pro Max';
  if (w === 402 && h === 874) return 'iPhone 16 Pro';

  // 2. iPhone 15 / 14 Series (Dynamic Island & Notch)
  if (w === 430 && h === 932) return 'iPhone 14 Pro Max / 15 Pro Max';
  if (w === 393 && h === 852) return 'iPhone 14 Pro / 15 / 16';

  // 3. iPhone 12 / 13 / 14 Series
  if (w === 428 && h === 926) return 'iPhone 12 Pro Max / 13 Pro Max';
  if (w === 390 && h === 844) return 'iPhone 12 / 12 Pro / 13 / 14';

  // 4. iPhone 11 / X / XS / XR Series
  if (w === 414 && h === 896) {
    return dpr === 2 ? 'iPhone 11 / XR' : 'iPhone 11 Pro Max / XS Max';
  }
  if (w === 375 && h === 812) return 'iPhone 11 Pro / X / XS';
  if (w === 360 && h === 780) return 'iPhone 12 mini / 13 mini';

  // 5. iPhone SE / 8 / 7 / 6 Series
  if (w === 414 && h === 736) return 'iPhone 7 Plus / 8 Plus';
  if (w === 375 && h === 667) return 'iPhone 7 / 8 / SE';
  if (w === 320 && h === 568) return 'iPhone 5 / 5s / SE1';

  return 'iPhone';
};

// ── Nhận diện iPad ──
export const getIpadModel = () => {
  if (typeof window === 'undefined') return 'iPad';
  const w = Math.min(window.screen.width, window.screen.height);
  const h = Math.max(window.screen.width, window.screen.height);

  if (w === 1024 && h === 1366) return 'iPad Pro 12.9"';
  if (w === 834 && h === 1194) return 'iPad Pro 11"';
  if (w === 834 && h === 1112) return 'iPad Air / Pro 10.5"';
  if (w === 820 && h === 1180) return 'iPad Air 4/5 / Gen 10';
  if (w === 810 && h === 1080) return 'iPad Gen 7/8/9';
  if (w === 744 && h === 1133) return 'iPad mini 6';
  if (w === 768 && h === 1024) return 'iPad 9.7" / mini';
  return 'iPad';
};

// ── Hỗ trợ lấy tên thiết bị chi tiết & cụ thể ──
export const getDeviceDescription = async () => {
  if (typeof navigator === 'undefined') return 'Thiết bị không rõ';
  const ua = navigator.userAgent || '';

  // 1. Apple iPhone
  if (/iPhone/i.test(ua)) {
    return getIphoneModel();
  }

  // 2. Apple iPad (bao gồm cả iPadOS gửi UserAgent Mac)
  const isIpad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (isIpad) {
    return getIpadModel();
  }

  // 3. Android Phone / Tablet
  if (/Android/i.test(ua)) {
    // Thử lấy model chính xác từ Client Hints API
    if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
      try {
        const hints = await navigator.userAgentData.getHighEntropyValues(['model']);
        if (hints && hints.model) {
          const m = hints.model.trim();
          if (/^SM-S928/i.test(m)) return 'Samsung S24 Ultra';
          if (/^SM-S918/i.test(m)) return 'Samsung S23 Ultra';
          if (/^SM-S908/i.test(m)) return 'Samsung S22 Ultra';
          if (/^SM-S92/i.test(m)) return 'Samsung S24 Series';
          if (/^SM-S91/i.test(m)) return 'Samsung S23 Series';
          if (/^SM-S90/i.test(m)) return 'Samsung S22 Series';
          if (/^SM-/i.test(m)) return `Samsung (${m})`;
          if (/^Pixel/i.test(m)) return `Google ${m}`;
          return `Android (${m})`;
        }
      } catch {}
    }

    // Fallback qua phân tích UserAgent
    const match = ua.match(/Android\s+[^;]+;\s+([^;\)]+?)(?:\s+Build|\s*;|\))/i);
    if (match && match[1]) {
      let rawModel = match[1].replace(/Build\/.+/i, '').trim();
      if (/^SM-S928/i.test(rawModel)) return 'Samsung S24 Ultra';
      if (/^SM-S918/i.test(rawModel)) return 'Samsung S23 Ultra';
      if (/^SM-S908/i.test(rawModel)) return 'Samsung S22 Ultra';
      if (/^SM-S92/i.test(rawModel)) return 'Samsung S24 Series';
      if (/^SM-S91/i.test(rawModel)) return 'Samsung S23 Series';
      if (/^SM-S90/i.test(rawModel)) return 'Samsung S22 Series';
      if (/^SM-/i.test(rawModel)) return `Samsung (${rawModel})`;
      if (/^Pixel/i.test(rawModel)) return `Google ${rawModel}`;
      return `Android (${rawModel})`;
    }
    return 'Android';
  }

  // 4. Máy tính (PC / Mac / Linux)
  let os = 'PC';
  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows/i.test(ua)) os = 'Windows';
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
export const getDisplayDeviceName = (did) => {
  if (!did) return 'Không rõ';
  const match = did.match(/\(([^)]+)\)/);
  return match ? match[1] : did.slice(0, 12) + '...';
};

// ── Rút gọn tên thiết bị để hiển thị gọn gàng trong bảng dữ liệu ──
export const formatCompactDeviceName = (name) => {
  if (!name || typeof name !== 'string') return name || '—';
  const s = name.trim();
  const directMap = {
    'iPhone 12 / 12 Pro / 13 / 14': 'iP 12-14',
    'iPhone 14 Pro Max / 15 Pro Max': 'iP 14/15 PM',
    'iPhone 12 Pro Max / 13 Pro Max': 'iP 12/13 PM',
    'iPhone 14 Pro / 15 / 16': 'iP 14P/15/16',
    'iPhone 16 Pro Max': 'iP 16 PM',
    'iPhone 16 Pro': 'iP 16 Pro',
    'iPhone 11 Pro Max / XS Max': 'iP 11PM/XS',
    'iPhone 11 Pro / X / XS': 'iP 11P/X/XS',
    'iPhone 11 / XR': 'iP 11/XR',
    'iPhone 12 mini / 13 mini': 'iP 12/13m',
    'iPhone 7 Plus / 8 Plus': 'iP 7+/8+',
    'iPhone 7 / 8 / SE': 'iP 7/8/SE',
    'iPhone 5 / 5s / SE1': 'iP 5/SE',
    'iPad Pro 12.9"': 'iPad P12',
    'iPad Pro 11"': 'iPad P11',
    'iPad Air / Pro 10.5"': 'iPad Air/P',
    'iPad Air 4/5 / Gen 10': 'iPad Air/G10',
    'iPad Gen 7/8/9': 'iPad G7-9',
    'Samsung S24 Ultra': 'SS S24U',
    'Samsung S23 Ultra': 'SS S23U',
    'Samsung S22 Ultra': 'SS S22U',
    'Samsung S24 Series': 'SS S24',
    'Samsung S23 Series': 'SS S23',
    'Samsung S22 Series': 'SS S22'
  };
  if (directMap[s]) return directMap[s];

  return s
    .replace(/^iPhone\b/i, 'iP')
    .replace(/^Samsung\b/i, 'SS')
    .replace(/^Windows\s*10\/11/i, 'Win')
    .replace(/^Windows\b/i, 'Win');
};

// ── Device Fingerprint (thuần JS, không cần thư viện ngoài) ──
export const generateDeviceId = async () => {
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
    const deviceName = await getDeviceDescription();
    return `dev-${Math.abs(hash).toString(36)} (${deviceName})`;
  } catch {
    const deviceName = await getDeviceDescription().catch(() => 'Thiết bị');
    return `dev-${Math.random().toString(36).slice(2, 10)} (${deviceName})`;
  }
};

