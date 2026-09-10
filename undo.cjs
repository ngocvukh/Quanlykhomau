const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const code = fs.readFileSync('./src/supabaseClient.js', 'utf8');
  const urlMatch = code.match(/supabaseUrl\s*=\s*['"`]([^'"`]+)/);
  const keyMatch = code.match(/supabaseAnonKey\s*=\s*['"`]([^'"`]+)/);
  
  if(urlMatch && keyMatch) {
    const supabase = createClient(urlMatch[1], keyMatch[1]);
    
    // Find the latest box
    const { data: boxes } = await supabase.from('boxes').select('*').order('created_at', { ascending: false }).limit(1);
    if (!boxes || boxes.length === 0) {
      console.log('No boxes found');
      return;
    }
    const lastBox = boxes[0];
    console.log('Latest box:', lastBox);
    
    // Check if we can find where they were?
    // Unfortunately, we didn't save the old locations in a transaction.
    // If the database doesn't have an audit log, the old shelf/slot is lost forever in Supabase.
    // Let's check if there are any transactions for these samples that might indicate where they were put IN.
    const { data: samples } = await supabase.from('samples').select('*').eq('box_id', lastBox.id);
    console.log('Samples in this box:', samples.length);
    
    for (let s of samples) {
       // Try to find a transaction where it was imported or assigned
       const { data: txs } = await supabase.from('transactions')
            .select('*')
            .eq('sample_id', s.id)
            .ilike('note', '%Kệ%')
            .order('created_at', { ascending: false })
            .limit(1);
            
       if (txs && txs.length > 0) {
          const note = txs[0].note;
          console.log(`Sample ${s.id} - Tx Note: ${note}`);
          // Parse note: "Nhập kho lưu vào Kệ X - Ô Y - Cột Z"
          const m = note.match(/Kệ (\d+) - Ô (\d+) - Cột (\d+)/);
          if (m) {
             console.log(`=> Found location: Shelf ${m[1]}, Slot ${m[2]}, Col ${m[3]}`);
             // Restore
             await supabase.from('samples').update({
                shelf: parseInt(m[1]),
                slot: parseInt(m[2]),
                column_number: parseInt(m[3]),
                box_id: null,
                status: 'stored'
             }).eq('id', s.id);
          }
       }
    }
    
    // Delete the box
    await supabase.from('boxes').delete().eq('id', lastBox.id);
    console.log('Done restoring and deleted the box.');
  }
}
main();
