import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://obfdrpqnntylboptkwin.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZmRycHFubnR5bGJvcHRrd2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTY1NjgsImV4cCI6MjA5ODM3MjU2OH0.oTJakm0vtd6gQL-qeT1Qna5M_nKb4o1doed1OARfqdo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching all boxes...');
  const { data: boxes, error: bError } = await supabase.from('boxes').select('*');
  if (bError) {
    console.error('Error fetching boxes:', bError);
    return;
  }
  
  console.log(`Found ${boxes.length} boxes.`);

  console.log('Fetching all boxed samples...');
  const { data: samples, error: sError } = await supabase
    .from('samples')
    .select('box_id')
    .not('box_id', 'is', null);
    
  if (sError) {
    console.error('Error fetching samples:', sError);
    return;
  }
  
  // Get all unique box IDs that have samples
  const boxesWithSamples = new Set(samples.map(s => s.box_id));
  
  // Find empty boxes
  const emptyBoxes = boxes.filter(b => !boxesWithSamples.has(b.id));
  
  console.log(`Found ${emptyBoxes.length} empty boxes out of ${boxes.length} total boxes.`);
  
  if (emptyBoxes.length > 0) {
    const emptyBoxIds = emptyBoxes.map(b => b.id);
    console.log(`Deleting empty boxes: ${emptyBoxes.map(b => b.box_name).join(', ')}...`);
    
    const { error: delError } = await supabase
      .from('boxes')
      .delete()
      .in('id', emptyBoxIds);
      
    if (delError) {
      console.error('Error deleting empty boxes:', delError);
    } else {
      console.log(`Successfully deleted ${emptyBoxes.length} empty boxes.`);
    }
  } else {
    console.log('No empty boxes found.');
  }
}

run();
