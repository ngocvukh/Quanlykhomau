import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = (env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/) || [])[1]?.trim();
const supabaseKey = (env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/) || [])[1]?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching boxes...');
  const { data: boxes, error: bError } = await supabase.from('boxes').select('*');
  
  if (bError) {
    console.error('Error fetching boxes:', bError);
    return;
  }
  
  const sourceBoxes = boxes.filter(b => b.box_name.includes('9/2026') || b.box_name.includes('09/2026'));
  let targetBox = boxes.find(b => b.box_name.includes('10/2025'));
  
  if (sourceBoxes.length === 0) {
    console.log('No source box 9/2026 found.');
    return;
  }
  
  if (!targetBox) {
    console.log('Target box 10/2025 not found. Creating it...');
    const { data: newBox, error: insError } = await supabase
      .from('boxes')
      .insert({ box_name: 'Thùng 10/2025' })
      .select()
      .single();
      
    if (insError) {
      console.error('Error creating box:', insError);
      return;
    }
    targetBox = newBox;
  }
  
  const sourceBoxIds = sourceBoxes.map(b => b.id);
  console.log(`Found source boxes: ${sourceBoxes.map(b => b.box_name).join(', ')}. Target: ${targetBox.box_name}`);
  
  const { data: samples, error: sError } = await supabase
    .from('samples')
    .update({ box_id: targetBox.id })
    .in('box_id', sourceBoxIds)
    .select();
    
  if (sError) {
    console.error('Error moving samples:', sError);
  } else {
    console.log(`Successfully moved ${samples.length} samples to Thùng 10/2025.`);
    
    // Optionally delete the old source boxes
    const { error: delError } = await supabase
      .from('boxes')
      .delete()
      .in('id', sourceBoxIds);
      
    if (delError) {
      console.log('Error deleting old boxes:', delError);
    } else {
      console.log('Successfully deleted the empty Thùng 9/2026 boxes.');
    }
  }
}

run();
