// Supabase Edge Function: admin-create-user
// Tạo tài khoản người dùng an toàn ở phía server bằng SUPABASE_SERVICE_ROLE_KEY
// Chỉ cho phép Admin đang hoạt động (role = 'admin' AND is_active = true) gọi.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Mật khẩu phải có ít nhất 8 ký tự.' };
  }
  if (!/[A-Za-zÀ-ỹ]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ cái.' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ số.' };
  }
  return { valid: true, message: '' };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse({ error: 'Forbidden origin' }, 403, corsHeaders);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[admin-create-user] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ error: 'Dịch vụ tạm thời không khả dụng.' }, 500, corsHeaders);
  }

  // 1. Xác thực người gọi (401 nếu thiếu hoặc token không hợp lệ)
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !callerData?.user?.id) {
    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  // 2. Kiểm tra quyền Admin đang hoạt động (403 nếu không phải Admin hoặc đã bị khóa)
  const { data: callerProfile, error: callerProfErr } = await supabaseAdmin
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', callerData.user.id)
    .maybeSingle();

  if (callerProfErr || !callerProfile || callerProfile.role !== 'admin' || callerProfile.is_active !== true) {
    return jsonResponse({ error: 'Forbidden: Chỉ Admin đang hoạt động mới được phép cấp tài khoản.' }, 403, corsHeaders);
  }

  // 3. Parse & kiểm tra đầu vào ở phía server
  let rawPayload: unknown;
  try {
    rawPayload = await req.json();
  } catch {
    return jsonResponse({ error: 'Dữ liệu yêu cầu không hợp lệ.' }, 400, corsHeaders);
  }

  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return jsonResponse({ error: 'Dữ liệu yêu cầu không hợp lệ.' }, 400, corsHeaders);
  }
  const payload = rawPayload as Record<string, unknown>;

  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const fullName = String(payload.fullName || '').trim();
  const employeeCode = payload.employeeCode ? String(payload.employeeCode).trim() : null;
  const department = payload.department ? String(payload.department).trim() : null;
  const role = String(payload.role || 'staff').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Email không hợp lệ.' }, 400, corsHeaders);
  }
  if (!fullName) {
    return jsonResponse({ error: 'Họ và tên không được để trống.' }, 400, corsHeaders);
  }
  if (role !== 'admin' && role !== 'staff') {
    return jsonResponse({ error: 'Vai trò không hợp lệ.' }, 400, corsHeaders);
  }

  const pwdCheck = validatePasswordStrength(password);
  if (!pwdCheck.valid) {
    return jsonResponse({ error: pwdCheck.message }, 400, corsHeaders);
  }

  // 4. Tạo tài khoản Auth bằng Admin API (tự xác nhận email)
  const { data: createdData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (createErr || !createdData?.user?.id) {
    const rawMsg = String(createErr?.message || '').toLowerCase();
    if (rawMsg.includes('already') || rawMsg.includes('exists') || rawMsg.includes('registered')) {
      return jsonResponse({ error: 'Email này đã tồn tại trong hệ thống.' }, 409, corsHeaders);
    }
    console.error('[admin-create-user] createUser failed:', createErr);
    return jsonResponse({ error: 'Không thể tạo tài khoản. Vui lòng thử lại sau.' }, 500, corsHeaders);
  }

  const createdUser = createdData.user;

  // 5. Khởi tạo hồ sơ trong public.profiles (rollback xóa Auth user nếu lỗi để tránh user mồ côi)
  const { data: profileData, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: createdUser.id,
        email: createdUser.email || email,
        full_name: fullName,
        employee_code: employeeCode || null,
        department: department || null,
        role,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (profileErr) {
    console.error('[admin-create-user] profile upsert failed, rolling back auth user:', profileErr);
    const { error: rollbackErr } = await supabaseAdmin.auth.admin
      .deleteUser(createdUser.id)
      .catch((e) => ({ error: e }));
    if (rollbackErr) {
      console.error('[admin-create-user] rollback deleteUser failed:', rollbackErr);
    }
    return jsonResponse({ error: 'Không thể khởi tạo hồ sơ tài khoản. Vui lòng kiểm tra mã nhân viên hoặc thử lại.' }, 400, corsHeaders);
  }

  return jsonResponse(
    {
      user: {
        id: createdUser.id,
        email: createdUser.email,
      },
      profile: profileData,
    },
    201,
    corsHeaders
  );
});
