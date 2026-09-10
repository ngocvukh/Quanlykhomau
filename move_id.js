import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://obfdrpqnntylboptkwin.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZmRycHFubnR5bGJvcHRrd2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTY1NjgsImV4cCI6MjA5ODM3MjU2OH0.oTJakm0vtd6gQL-qeT1Qna5M_nKb4o1doed1OARfqdo';
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
