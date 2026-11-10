import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = (env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/) || [])[1]?.trim();
const supabaseKey = (env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/) || [])[1]?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: samples } = await supabase.from('samples').select('id, sku').in('sku', ['QR-ZON-3809-913', 'QR-BLU-3809-504', 'QR-ATL-9909-950']);
  const targetBoxId = '924be28f-bcd9-48d1-9d33-1b77ee47d1ce'; // Thùng 10/2025
  
  for (const s of samples) {
    const { data, error } = await supabase
      .from('samples')
      .update({ box_id: targetBoxId })
      .eq('id', s.id)
      .select();
    console.log('Update', s.sku, data?.length, error);
  }
}
run();
