import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://obfdrpqnntylboptkwin.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZmRycHFubnR5bGJvcHRrd2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTY1NjgsImV4cCI6MjA5ODM3MjU2OH0.oTJakm0vtd6gQL-qeT1Qna5M_nKb4o1doed1OARfqdo';
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
