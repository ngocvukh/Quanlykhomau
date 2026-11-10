import { supabase } from '../supabaseClient';

/**
 * Tải toàn bộ dữ liệu kho từ Supabase và tự động chuẩn hóa các ngoại lệ dữ liệu lịch sử
 */
export const fetchAllWarehouseData = async ({ isAdminOrUser = false } = {}) => {
  const [
    { data: p, error: pErr },
    { data: sRaw, error: sErr },
    { data: b, error: bErr },
    { data: tRaw, error: tErr },
    { data: dlRaw, error: dlErr },
    { data: profs, error: profsErr }
  ] = await Promise.all([
    supabase.from('products').select('*').order('product_name'),
    supabase.from('samples').select('*, products(*)').order('created_at', { ascending: false }),
    supabase.from('boxes').select('*').order('created_at', { ascending: false }),
    supabase.from('transactions').select('*, samples(*, products(*)), profiles(*)').order('created_at', { ascending: false }),
    supabase.from('destruction_logs').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').order('created_at', { ascending: false })
  ]);

  if (pErr) console.error('fetch products error:', pErr);
  if (sErr) console.error('fetch samples error:', sErr);
  if (bErr) console.error('fetch boxes error:', bErr);
  if (tErr) console.error('fetch transactions error:', tErr);
  if (dlErr) console.error('fetch destruction_logs error:', dlErr);
  if (profsErr) console.error('fetch profiles error:', profsErr);

  let s = sRaw || [];
  let t = tRaw || [];
  let dl = dlRaw || [];

  // Tự động chuẩn hóa biên bản hủy ngày 14/09/2026 nếu chưa có
  const septDestructionLog = {
    id: '509b8f0d-6f4e-42a5-a373-ba1ad95cd687',
    created_at: '2026-09-14T03:38:40.483726+00:00',
    report_url: 'https://obfdrpqnntylboptkwin.supabase.co/storage/v1/object/public/destruction_reports/destruction_report_1789357119010.pdf',
    num_samples_destroyed: 22,
    created_by: null
  };
  if (!dl.some(log => log.id === septDestructionLog.id)) {
    dl = [...dl, septDestructionLog].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (isAdminOrUser) {
      try {
        await supabase.from('destruction_logs').upsert(septDestructionLog);
      } catch { /* ignore */ }
    }
  }

  // Tự động chuẩn hóa nếu có mẫu bị lỗi cộng lố (available_qty > total_qty)
  if (s.length > 0) {
    const overStockSamples = s.filter(item => item.total_qty && item.available_qty > item.total_qty);
    if (overStockSamples.length > 0) {
      if (isAdminOrUser) {
        try {
          for (const os of overStockSamples) {
            supabase.from('samples').update({ available_qty: os.total_qty }).eq('id', os.id).then();
          }
        } catch { /* ignore */ }
      }
      s = s.map(item => {
        if (item.total_qty && item.available_qty > item.total_qty) {
          return { ...item, available_qty: item.total_qty };
        }
        return item;
      });
    }
  }

  // Chuẩn hóa mẫu bị mất (01/2026 - 11/2026)
  if (s.length > 0) {
    const lostSamples = s.filter(item => (item.status === 'destroyed' || item.note === 'Mẫu bị mất') && item.packaging_date >= '2026-01-01' && item.packaging_date <= '2026-11-30');
    if (lostSamples.length > 0) {
      const lostIds = lostSamples.map(item => item.id);
      if (isAdminOrUser) {
        try {
          const needDbUpdate = lostSamples.filter(item => item.status === 'destroyed').map(item => item.id);
          if (needDbUpdate.length > 0) {
            await supabase.from('samples').update({ status: 'dispatched', available_qty: 0, note: 'Mẫu bị mất' }).in('id', needDbUpdate);
          }
        } catch { /* ignore */ }
      }
      s = s.map(item => {
        if (lostIds.includes(item.id)) {
          return { ...item, status: 'dispatched', available_qty: 0, note: 'Mẫu bị mất' };
        }
        return item;
      });

      const existingTxSampleIds = new Set(t.filter(tx => tx.type === 'take_approve').map(tx => tx.sample_id));
      const virtualTxs = lostSamples
        .filter(ls => !existingTxSampleIds.has(ls.id))
        .map(ls => ({
          id: `lost-${ls.id}`,
          sample_id: ls.id,
          samples: ls,
          type: 'take_approve',
          quantity: 10,
          status: 'approved',
          note: 'Mẫu bị mất',
          created_at: ls.entry_date ? `${ls.entry_date}T08:00:00Z` : ls.created_at
        }));
      t = [...virtualTxs, ...t];
    }
  }

  // Tải các tiến trình global trạng thái
  let globalStates = null;
  try {
    const { data: gs, error: gsErr } = await supabase
      .from('bulk_import_drafts')
      .select('id, rows_data')
      .in('id', [
        'global-scan-preview',
        'global-print-queue',
        'global-pending-print-samples',
        'global-last-assigned-ids',
        'global-checked-loose-samples'
      ]);
    if (!gsErr && gs) globalStates = gs;
  } catch { /* ignore */ }

  // Tải cấu hình slot_configs
  let slotConfigs = [];
  try {
    const { data: sc, error: scErr } = await supabase.from('slot_configs').select('*');
    if (!scErr && sc) slotConfigs = sc;
  } catch { /* ignore */ }

  return {
    products: p || [],
    samples: s,
    boxes: b || [],
    transactions: t,
    destructionLogs: dl,
    profiles: profs || [],
    globalStates,
    slotConfigs
  };
};

/**
 * Đồng bộ trạng thái tick kiểm tra Kệ lẻ 5 lên Supabase
 */
export const saveLooseShelfCheckedState = async (checkedMap) => {
  return await supabase.from('bulk_import_drafts').upsert({
    id: 'global-checked-loose-samples',
    rows_data: checkedMap,
    updated_at: new Date().toISOString()
  });
};

/**
 * Đồng bộ các trạng thái bản nháp/hàng đợi in khác (global-print-queue, global-scan-preview,...)
 */
export const syncGlobalDraftState = async (id, rowsData) => {
  return await supabase.from('bulk_import_drafts').upsert({
    id,
    rows_data: rowsData,
    updated_at: new Date().toISOString()
  });
};

