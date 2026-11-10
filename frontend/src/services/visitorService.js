import { supabase } from '../supabaseClient';

/**
 * Tải danh sách hồ sơ hệ thống, nhật ký khách và thiết bị reset/bị chặn
 */
export const fetchProfilesAndVisitors = async () => {
  const [{ data: profs, error: pErr }, { data: vLogs, error: vErr }, { data: resets, error: rErr }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('search_logs').select('*').order('searched_at', { ascending: false }).limit(2000),
    supabase.from('visitor_resets').select('device_id, is_blocked, reset_by')
  ]);

  if (pErr) console.error('fetchProfiles error:', pErr);
  if (vErr) console.error('fetchVisitorLogs error:', vErr);
  if (rErr) console.error('fetchResets error:', rErr);

  // Tự động dọn dẹp các bản ghi mồ côi trong visitor_resets (không có nhật ký và không bị chặn)
  const orphanResetIds = (resets || [])
    .filter(r => !r.is_blocked && !(vLogs || []).some(l => l.device_id === r.device_id))
    .map(r => r.device_id);
  if (orphanResetIds.length > 0) {
    supabase.from('visitor_resets').delete().in('device_id', orphanResetIds).then(() => {});
  }

  return {
    profiles: profs || [],
    visitorLogs: vLogs || [],
    resetDevices: resets || []
  };
};

/**
 * Admin chặn vĩnh viễn thiết bị
 */
export const blockVisitorDevice = async (devId) => {
  return await supabase.from('visitor_resets').upsert({
    device_id: devId,
    is_blocked: true,
    reset_by: 'admin'
  });
};

/**
 * Gỡ chặn thiết bị
 */
export const unblockVisitorDevice = async (devId) => {
  return await supabase.from('visitor_resets').delete().eq('device_id', devId);
};

/**
 * Đặt lệnh yêu cầu thiết bị khai lại tên vào lần truy cập sau
 */
export const resetVisitorDeviceName = async (targetDevId) => {
  return await supabase.from('visitor_resets').upsert({
    device_id: targetDevId,
    is_blocked: false,
    reset_by: 'admin_reset'
  });
};

/**
 * Admin đổi tên trực tiếp cho khách và đồng bộ giao dịch
 */
export const renameVisitorDevice = async ({ targetDevId, trimmedName, affectedTxs = [] }) => {
  // 1. Thêm log mới vào search_logs để đảm bảo timestamp mới nhất luôn trỏ về tên này
  if (targetDevId) {
    await supabase.from('search_logs').insert({
      device_id: targetDevId,
      user_name: trimmedName,
      keyword: '[Admin đổi tên]',
      results_count: 0
    });
    try {
      await supabase.from('search_logs').update({ user_name: trimmedName }).eq('device_id', targetDevId);
    } catch { /* ignore */ }
  }

  // 2. Cập nhật ghi chú trên tất cả các giao dịch lấy mẫu của khách này
  for (const tx of affectedTxs) {
    const updatedNote = tx.note.replace(/\[(?:Khách|Người yêu cầu):\s*[^\]]*\]/i, `[Khách: ${trimmedName}]`);
    if (updatedNote !== tx.note) {
      await supabase.from('transactions').update({ note: updatedNote }).eq('id', tx.id);
    }
  }

  // 3. Đặt cờ trong visitor_resets để thiết bị khách tự động cập nhật tên mới
  if (targetDevId) {
    await supabase.from('visitor_resets').upsert({
      device_id: targetDevId,
      is_blocked: false,
      reset_by: `rename:${trimmedName}`
    });
  }
};

/**
 * Xóa thiết bị khỏi danh sách đã lưu (chỉ xóa device_id, giữ nguyên 100% lịch sử tra cứu & giao dịch)
 */
export const unlinkVisitorDevice = async (devId) => {
  return await Promise.all([
    supabase.from('search_logs').update({ device_id: null }).eq('device_id', devId),
    supabase.from('visitor_resets').delete().eq('device_id', devId)
  ]);
};

/**
 * Cập nhật thông tin tài khoản người dùng
 */
export const updateUserProfile = async (targetId, updates) => {
  return await supabase.from('profiles').update(updates).eq('id', targetId);
};

/**
 * Xóa tài khoản người dùng
 */
export const deleteUserProfile = async (profId) => {
  return await supabase.from('profiles').delete().eq('id', profId);
};

