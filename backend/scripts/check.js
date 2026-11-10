import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = (env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/) || [])[1]?.trim();
const supabaseKey = (env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/) || [])[1]?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: boxes } = await supabase.from('boxes').select('*');
  console.log('All Boxes:');
  boxes.forEach(b => console.log(b.id, b.box_name));
  
  const { data: samples } = await supabase.from('samples').select('sku, box_id, packaging_date').in('sku', ['QR-ZON-3809-913', 'QR-BLU-3809-504', 'QR-ATL-9909-950']);
  console.log('\nSamples:');
  console.log(samples);
}

check();
