import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

const RATE_LIMIT_KEY = 'qlk_login_rate_limit';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 1000;

/**
 * Kiểm tra độ mạnh mật khẩu: tối thiểu 8 ký tự, ít nhất 1 chữ cái và 1 chữ số
 */
export const validatePasswordStrength = (password = '') => {
  const pwd = String(password);
  const minLength = pwd.length >= 8;
  const hasLetter = /[A-Za-zÀ-ỹ]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const valid = minLength && hasLetter && hasNumber;

  let message = '';
  if (!minLength) {
    message = 'Mật khẩu phải có ít nhất 8 ký tự.';
  } else if (!hasLetter) {
    message = 'Mật khẩu phải chứa ít nhất 1 chữ cái.';
  } else if (!hasNumber) {
    message = 'Mật khẩu phải chứa ít nhất 1 chữ số.';
  }

  return {
    valid,
    message,
    checks: { minLength, hasLetter, hasNumber }
  };
};

const readRateLimitState = () => {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return { failCount: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      failCount: Number(parsed?.failCount) || 0,
      lockedUntil: Number(parsed?.lockedUntil) || 0
    };
  } catch {
    return { failCount: 0, lockedUntil: 0 };
  }
};

const writeRateLimitState = (state) => {
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
};

export const getLoginLockRemainingSeconds = () => {
  const { lockedUntil } = readRateLimitState();
  const remainingMs = lockedUntil - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
};

export const resetLoginRateLimit = () => {
  try {
    localStorage.removeItem(RATE_LIMIT_KEY);
  } catch {
    // ignore
  }
};

const recordLoginFailure = () => {
  const current = readRateLimitState();
  const now = Date.now();
  const baseCount = current.lockedUntil > 0 && now >= current.lockedUntil ? 0 : current.failCount;
  const nextCount = baseCount + 1;

  if (nextCount >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = now + LOCK_DURATION_MS;
    writeRateLimitState({ failCount: nextCount, lockedUntil });
    return { locked: true, remainingSeconds: Math.ceil(LOCK_DURATION_MS / 1000), failCount: nextCount };
  }

  writeRateLimitState({ failCount: nextCount, lockedUntil: 0 });
  return { locked: false, remainingSeconds: 0, failCount: nextCount };
};

/**
 * Đăng nhập bằng email & mật khẩu, có rate-limit client 30s sau 5 lần sai và kiểm tra is_active
 */
export const loginWithPassword = async (email, password) => {
  const remainingSec = getLoginLockRemainingSeconds();
  if (remainingSec > 0) {
    const err = new Error(`Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${remainingSec} giây.`);
    err.code = 'RATE_LIMITED';
    err.remainingSeconds = remainingSec;
    throw err;
  }

  const trimmedEmail = (email || '').trim();
  if (!trimmedEmail || !password) {
    throw new Error('Vui lòng nhập đầy đủ email và mật khẩu.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password
  });

  if (error) {
    const rawMsg = String(error.message || '');
    if (rawMsg.toLowerCase().includes('email not confirmed')) {
      throw new Error(
        'Tài khoản chưa xác nhận email (Email not confirmed). ' +
        'Vui lòng bấm link xác nhận trong hộp thư hoặc nhờ Admin chạy lại file auth_account_management.sql / tắt "Confirm email" trên Supabase.'
      );
    }

    const failure = recordLoginFailure();
    if (failure.locked) {
      const lockErr = new Error(`Sai thông tin đăng nhập ${MAX_FAILED_ATTEMPTS} lần liên tiếp. Tạm khóa đăng nhập ${failure.remainingSeconds} giây.`);
      lockErr.code = 'RATE_LIMITED';
      lockErr.remainingSeconds = failure.remainingSeconds;
      throw lockErr;
    }
    const remainingAttempts = MAX_FAILED_ATTEMPTS - failure.failCount;
    const msg = rawMsg === 'Invalid login credentials'
      ? `Email hoặc mật khẩu không đúng (còn ${remainingAttempts} lần thử).`
      : rawMsg;
    throw new Error(msg);
  }

  resetLoginRateLimit();

  // Kiểm tra trạng thái hoạt động trong profiles
  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profErr) {
    console.error('loginWithPassword profile check error:', profErr);
  }

  if (prof && prof.is_active === false) {
    await supabase.auth.signOut();
    const lockedErr = new Error('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Thủ kho (Admin).');
    lockedErr.code = 'ACCOUNT_DISABLED';
    throw lockedErr;
  }

  return {
    user: data.user,
    session: data.session,
    profile: prof || null
  };
};

/**
 * Gửi email đặt lại mật khẩu
 */
export const sendPasswordResetEmail = async (email) => {
  const trimmedEmail = (email || '').trim();
  if (!trimmedEmail) {
    throw new Error('Vui lòng nhập địa chỉ email.');
  }

  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
    redirectTo
  });

  if (error) throw error;
  return { success: true };
};

/**
 * Đổi mật khẩu cho người dùng đang đăng nhập (xác thực mật khẩu cũ trước)
 */
export const changeMyPassword = async (email, oldPassword, newPassword) => {
  if (!email) {
    throw new Error('Không xác định được email tài khoản hiện tại.');
  }
  if (!oldPassword) {
    throw new Error('Vui lòng nhập mật khẩu hiện tại.');
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    throw new Error(strength.message);
  }

  if (oldPassword === newPassword) {
    throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');
  }

  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email,
    password: oldPassword
  });

  if (verifyErr) {
    throw new Error('Mật khẩu hiện tại không chính xác.');
  }

  const { data, error: updateErr } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (updateErr) throw updateErr;
  return data;
};

/**
 * Cập nhật email đăng nhập của người dùng hiện tại
 */
export const updateMyEmail = async (newEmail) => {
  const trimmed = (newEmail || '').trim();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('Địa chỉ email mới không hợp lệ.');
  }

  const { data, error } = await supabase.auth.updateUser({
    email: trimmed
  });

  if (error) throw error;

  // Đồng bộ email sang profiles nếu có RPC (bọc try/catch an toàn)
  try {
    await supabase.rpc('rpc_sync_my_email');
  } catch {
    // ignore if email confirmation is pending or RPC unavailable
  }

  return data;
};

/**
 * Hoàn tất đặt lại mật khẩu từ liên kết PASSWORD_RECOVERY
 */
export const completePasswordRecovery = async (newPassword) => {
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    throw new Error(strength.message);
  }

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;
  return data;
};

const isMissingRpcError = (error) => {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    msg.includes('could not find the function') ||
    (msg.includes('function') && msg.includes('does not exist'))
  );
};

const isMissingColumnError = (error) => {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  return error.code === '42703' || error.code === 'PGRST204' || (msg.includes('column') && (msg.includes('does not exist') || msg.includes('schema cache')));
};

const fallbackProvisionProfile = async ({
  userId,
  email,
  fullName,
  employeeCode,
  department,
  role,
  secondaryClient,
  hasSecondarySession
}) => {
  const basePayload = {
    id: userId,
    full_name: fullName,
    employee_code: employeeCode || null,
    department: department || null,
    role
  };
  const extendedPayload = {
    ...basePayload,
    email,
    is_active: true
  };

  const tryUpsert = async (client) => {
    let res = await client
      .from('profiles')
      .upsert(extendedPayload, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (res.error && isMissingColumnError(res.error)) {
      res = await client
        .from('profiles')
        .upsert(basePayload, { onConflict: 'id' })
        .select()
        .maybeSingle();
    }
    return res;
  };

  // 1. Thử bằng phiên Admin hiện tại (hoạt động nếu RLS đã mở quyền INSERT/UPDATE cho Admin)
  const adminRes = await tryUpsert(supabase);
  if (!adminRes.error) {
    return { data: adminRes.data || extendedPayload, error: null };
  }

  // 2. Nếu chưa chạy SQL mới và email confirmation đang tắt, thử bằng phiên user vừa tạo (chỉ áp dụng cho role 'staff' theo RLS cũ)
  if (hasSecondarySession && secondaryClient && role === 'staff') {
    const selfRes = await tryUpsert(secondaryClient);
    if (!selfRes.error) {
      return { data: selfRes.data || extendedPayload, error: null };
    }
    return { data: null, error: selfRes.error };
  }

  return { data: null, error: adminRes.error };
};

/**
 * Admin cấp tài khoản mới bằng secondary client (không làm đăng xuất phiên Admin hiện tại)
 */
export const adminCreateUserAccount = async ({
  email,
  password,
  fullName,
  employeeCode = '',
  department = '',
  role = 'staff'
}) => {
  const trimmedEmail = (email || '').trim();
  const trimmedName = (fullName || '').trim();
  const normalizedRole = role === 'admin' ? 'admin' : 'staff';
  const trimmedEmpCode = employeeCode ? employeeCode.trim() : null;
  const trimmedDept = department ? department.trim() : null;

  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new Error('Email không hợp lệ.');
  }
  if (!trimmedName) {
    throw new Error('Họ và tên không được để trống.');
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    throw new Error(strength.message);
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Chưa cấu hình kết nối Supabase.');
  }

  // Kiểm tra trước sự tồn tại của RPC và quyền Admin để tránh tạo Auth user mồ côi nếu chưa chạy SQL
  const { error: probeError } = await supabase.rpc('rpc_admin_provision_profile', {
    p_user_id: null,
    p_email: trimmedEmail,
    p_full_name: trimmedName,
    p_employee_code: trimmedEmpCode,
    p_department: trimmedDept,
    p_role: normalizedRole
  });

  if (probeError) {
    if (isMissingRpcError(probeError)) {
      if (normalizedRole === 'admin') {
        throw new Error(
          'Hàm RPC "rpc_admin_provision_profile" chưa được cài đặt trên Supabase. ' +
          'Vui lòng chạy file backend/security/auth_account_management.sql trong Supabase SQL Editor trước khi cấp tài khoản Admin.'
        );
      }
    } else if (!String(probeError.message || '').includes('Thiếu user_id')) {
      throw new Error(probeError.message || 'Không có quyền cấp tài khoản.');
    }
  }

  const secondaryClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'qlk-admin-provision-temp'
    }
  });

  try {
    const { data: signUpData, error: signUpError } = await secondaryClient.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: trimmedName
        }
      }
    });

    if (signUpError) {
      const signUpMsg = String(signUpError.message || '').toLowerCase();
      if (signUpMsg.includes('already registered') || signUpMsg.includes('already been registered')) {
        throw new Error('Email này đã tồn tại trong hệ thống.');
      }
      throw new Error(signUpError.message || 'Không thể tạo tài khoản Auth.');
    }

    const createdUser = signUpData?.user;
    if (!createdUser?.id) {
      throw new Error('Không nhận được mã người dùng sau khi tạo tài khoản.');
    }

    if (Array.isArray(createdUser.identities) && createdUser.identities.length === 0) {
      throw new Error('Email này đã tồn tại trong hệ thống.');
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_admin_provision_profile', {
      p_user_id: createdUser.id,
      p_email: trimmedEmail,
      p_full_name: trimmedName,
      p_employee_code: trimmedEmpCode,
      p_department: trimmedDept,
      p_role: normalizedRole
    });

    if (rpcError) {
      if (isMissingRpcError(rpcError)) {
        const fallback = await fallbackProvisionProfile({
          userId: createdUser.id,
          email: trimmedEmail,
          fullName: trimmedName,
          employeeCode: trimmedEmpCode,
          department: trimmedDept,
          role: normalizedRole,
          secondaryClient,
          hasSecondarySession: Boolean(signUpData?.session)
        });

        if (!fallback.error) {
          return {
            user: createdUser,
            profile: fallback.data
          };
        }

        throw new Error(
          'Đã tạo Auth user nhưng lỗi khởi tạo hồ sơ: Hàm RPC "rpc_admin_provision_profile" chưa được cài đặt trên Supabase. ' +
          'Vui lòng chạy file backend/security/auth_account_management.sql trong Supabase SQL Editor rồi thử lại. ' +
          `(Chi tiết fallback: ${fallback.error.message})`
        );
      }

      throw new Error('Đã tạo Auth user nhưng lỗi khởi tạo hồ sơ: ' + rpcError.message);
    }

    return {
      user: createdUser,
      profile: rpcData
    };
  } finally {
    await secondaryClient.auth.signOut().catch(() => {});
  }
};
