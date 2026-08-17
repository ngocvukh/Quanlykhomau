import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://obfdrpqnntylboptkwin.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZmRycHFubnR5bGJvcHRrd2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTY1NjgsImV4cCI6MjA5ODM3MjU2OH0.oTJakm0vtd6gQL-qeT1Qna5M_nKb4o1doed1OARfqdo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching samples created today (2026-08-17)...');
  const { data: createdSamples, error: fetchError } = await supabase
    .from('samples')
    .select('id, sku, status, created_at, updated_at')
    .gte('created_at', '2026-08-17T00:00:00.000Z')
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('Error fetching:', fetchError);
    return;
  }

  console.log(`Found ${createdSamples.length} samples created today.`);
  
  if (createdSamples.length > 0) {
    const idsToReset = createdSamples.map(s => s.id);
    
    // Attempt login if needed, or just run the raw fetch with the anon key
    // In many of these supabase apps, RLS is either disabled or allows anon update.
    console.log('Resetting samples created today to pending...');
    const { data: updated, error: updateError } = await supabase
      .from('samples')
      .update({
        status: 'pending',
        shelf: null,
        slot: null,
        column_number: null,
        box_id: null
      })
      .in('id', idsToReset)
      .select();

    if (updateError) {
      console.error('Error updating:', updateError);
    } else {
      console.log(`Successfully reset ${updated?.length || 0} samples to pending.`);
    }
  }

  console.log('Fetching samples updated today (2026-08-17)...');
  const { data: updatedSamples, error: fetchUpdateError } = await supabase
    .from('samples')
    .select('id, sku, status, created_at, updated_at, shelf, box_id')
    .gte('updated_at', '2026-08-17T00:00:00.000Z')
    .order('updated_at', { ascending: false });

  if (!fetchUpdateError) {
    console.log(`Found ${updatedSamples.length} samples updated today.`);
    if (updatedSamples.length > 0) {
      console.log(updatedSamples.slice(0, 10));
    }
  }
}

run();
