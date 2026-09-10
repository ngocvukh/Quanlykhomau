import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://obfdrpqnntylboptkwin.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZmRycHFubnR5bGJvcHRrd2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTY1NjgsImV4cCI6MjA5ODM3MjU2OH0.oTJakm0vtd6gQL-qeT1Qna5M_nKb4o1doed1OARfqdo';
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
