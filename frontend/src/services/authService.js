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
    const lowerMsg = rawMsg.toLowerCase();
    if (lowerMsg.includes('email not confirmed')) {
      throw new Error('Tài khoản chưa xác nhận email. Vui lòng kiểm tra hộp thư hoặc liên hệ Thủ kho (Admin).');
    }
    if (lowerMsg.includes('user is banned') || lowerMsg.includes('banned')) {
      const lockedErr = new Error('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Thủ kho (Admin).');
      lockedErr.code = 'ACCOUNT_DISABLED';
      throw lockedErr;
    }

    const failure = recordLoginFailure();
    if (failure.locked) {
      const lockErr = new Error(`Sai thông tin đăng nhập ${MAX_FAILED_ATTEMPTS} lần liên tiếp. Tạm khóa đăng nhập ${failure.remainingSeconds} giây.`);
      lockErr.code = 'RATE_LIMITED';
      lockErr.remainingSeconds = failure.remainingSeconds;
      throw lockErr;
    }
    const remainingAttempts = MAX_FAILED_ATTEMPTS - failure.failCount;
    if (rawMsg === 'Invalid login credentials') {
      throw new Error(`Email hoặc mật khẩu không đúng (còn ${remainingAttempts} lần thử).`);
    }
    console.error('loginWithPassword auth error:', error);
    throw new Error('Không thể đăng nhập lúc này. Vui lòng kiểm tra thông tin và thử lại.');
  }

  resetLoginRateLimit();

  // Kiểm tra trạng thái hoạt động trong profiles (fail-closed: thiếu profile hoặc lỗi truy vấn -> đăng xuất ngay)
  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profErr || !prof) {
    if (profErr) console.error('loginWithPassword profile check error:', profErr);
    await supabase.auth.signOut();
    const missingErr = new Error('Tài khoản chưa được kích hoạt hồ sơ hoặc không thể xác minh trạng thái. Vui lòng liên hệ Thủ kho (Admin).');
    missingErr.code = 'PROFILE_MISSING';
    throw missingErr;
  }

  if (prof.is_active === false) {
    await supabase.auth.signOut();
    const lockedErr = new Error('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Thủ kho (Admin).');
    lockedErr.code = 'ACCOUNT_DISABLED';
    throw lockedErr;
  }

  return {
    user: data.user,
    session: data.session,
    profile: prof
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

const isEdgeFunctionUnavailableError = (error) => {
  if (!error) return false;
  const name = String(error.name || '');
  const msg = String(error.message || '').toLowerCase();
  const status = error.context?.status;
  return (
    status === 404 ||
    name === 'FunctionsFetchError' ||
    name === 'FunctionsRelayError' ||
    msg.includes('failed to send a request to the edge function') ||
    msg.includes('function not found') ||
    msg.includes('not found')
  );
};

/**
 * Admin cấp tài khoản mới:
 * 1. Ưu tiên gọi Supabase Edge Function `admin-create-user` (server-side Service Role Key, chống tài khoản mồ côi).
 * 2. Fallback an toàn sang secondaryClient + RPC `rpc_admin_provision_profile` nếu Edge Function chưa được deploy.
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

  // 1. Thử tạo tài khoản qua Supabase Edge Function (server-side)
  try {
    const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: trimmedEmail,
        password,
        fullName: trimmedName,
        employeeCode: trimmedEmpCode,
        department: trimmedDept,
        role: normalizedRole
      }
    });

    if (!fnError && fnData?.profile) {
      return {
        user: fnData.user,
        profile: fnData.profile
      };
    }

    if (fnError && !isEdgeFunctionUnavailableError(fnError)) {
      let errMessage = 'Không thể cấp tài khoản mới. Vui lòng thử lại.';
      try {
        if (fnError.context && typeof fnError.context.json === 'function') {
          const body = await fnError.context.json();
          if (body?.error) errMessage = body.error;
        }
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(errMessage);
    }
  } catch (edgeErr) {
    if (!isEdgeFunctionUnavailableError(edgeErr)) {
      throw edgeErr;
    }
  }

  // 2. Fallback an toàn khi Edge Function chưa được deploy: kiểm tra trước RPC & quyền Admin
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Chưa cấu hình kết nối hệ thống.');
  }

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
      console.error('adminCreateUserAccount: provisioning RPC not installed');
      throw new Error('Chức năng cấp tài khoản hiện chưa sẵn sàng. Vui lòng liên hệ Quản trị viên hệ thống.');
    }
    if (!String(probeError.message || '').includes('Thiếu user_id')) {
      console.error('adminCreateUserAccount probe error:', probeError);
      throw new Error('Bạn không có quyền cấp tài khoản hoặc phiên đăng nhập đã hết hạn.');
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
      console.error('adminCreateUserAccount signUp error:', signUpError);
      throw new Error('Không thể tạo tài khoản mới. Vui lòng thử lại sau.');
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
      console.error('adminCreateUserAccount provision error:', rpcError);
      throw new Error('Không thể hoàn tất khởi tạo hồ sơ tài khoản. Vui lòng kiểm tra thông tin hoặc liên hệ Quản trị viên.');
    }

    return {
      user: createdUser,
      profile: rpcData
    };
  } finally {
    await secondaryClient.auth.signOut().catch(() => {});
  }
};
