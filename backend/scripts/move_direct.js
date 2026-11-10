import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = (env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/) || [])[1]?.trim();
const supabaseKey = (env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/) || [])[1]?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sourceBoxId = 'ec8925e8-f997-4abb-aa1a-cea929e35850';
  const targetBoxId = '924be28f-bcd9-48d1-9d33-1b77ee47d1ce'; // Thùng 10/2025
  
  const { data, error } = await supabase
    .from('samples')
    .update({ box_id: targetBoxId })
    .eq('box_id', sourceBoxId)
    .select();
    
  console.log('Update result:', data?.length, error);
  
  const { data: del, error: e2 } = await supabase.from('boxes').delete().eq('id', sourceBoxId);
  console.log('Delete result:', e2);
}
run();
