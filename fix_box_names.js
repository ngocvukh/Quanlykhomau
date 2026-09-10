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
  
  const boxMap = new Map();
  for (const b of boxes) {
    boxMap.set(b.id, b);
  }
  
  // A helper to normalize "Thùng 9/2025" to "Thùng 09/2025"
  const normalizeName = (name) => name.trim().replace(
    /(\d{1,2})\/(\d{4})/,
    (_, m, y) => `${m.padStart(2, '0')}/${y}`
  );
  
  console.log('Fetching all boxed samples...');
  const { data: samples, error: sError } = await supabase
    .from('samples')
    .select('id, box_id, packaging_date, sku')
    .not('box_id', 'is', null);
    
  if (sError) {
    console.error('Error fetching samples:', sError);
    return;
  }
  
  console.log(`Found ${samples.length} boxed samples.`);
  
  let fixedCount = 0;
  
  for (const s of samples) {
    const currentBox = boxMap.get(s.box_id);
    if (!currentBox || !s.packaging_date) continue;
    
    const pDate = new Date(s.packaging_date);
    const correctMonth = pDate.getMonth() + 1;
    const correctYear = pDate.getFullYear();
    const correctBoxName = `Thùng ${String(correctMonth).padStart(2, '0')}/${correctYear}`;
    
    const currentNormalizedName = normalizeName(currentBox.box_name);
    
    if (currentNormalizedName !== correctBoxName) {
      console.log(`Sample ${s.sku} is in ${currentNormalizedName}, should be in ${correctBoxName}`);
      
      // Find existing box with correct name
      let targetBox = boxes.find(b => normalizeName(b.box_name) === correctBoxName);
      
      if (!targetBox) {
        console.log(`Creating new box: ${correctBoxName}`);
        const { data: newBox, error: insError } = await supabase
          .from('boxes')
          .insert({ box_name: correctBoxName })
          .select()
          .single();
          
        if (insError) {
          console.error('Error creating box:', insError);
          continue;
        }
        
        targetBox = newBox;
        boxes.push(newBox);
        boxMap.set(newBox.id, newBox);
      }
      
      // Move sample
      const { error: updError } = await supabase
        .from('samples')
        .update({ box_id: targetBox.id })
        .eq('id', s.id);
        
      if (updError) {
        console.error(`Error updating sample ${s.sku}:`, updError);
      } else {
        fixedCount++;
      }
    }
  }
  
  console.log(`Finished fixing. Moved ${fixedCount} samples to correct boxes.`);
}

run();
