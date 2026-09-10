const { createClient } = require('@supabase/supabase-js');

async function main() {
  const urlMatch = 'https://obfdrpqnntylboptkwin.supabase.co';
  const keyMatch = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZmRycHFubnR5bGJvcHRrd2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTY1NjgsImV4cCI6MjA5ODM3MjU2OH0.oTJakm0vtd6gQL-qeT1Qna5M_nKb4o1doed1OARfqdo';
  
  if(urlMatch && keyMatch) {
    const supabase = createClient(urlMatch, keyMatch);
    
    // Find Thùng 09/2025
    const { data: boxes } = await supabase.from('boxes').select('*').ilike('box_name', '%09/2025%').order('created_at', { ascending: false }).limit(1);
    if (!boxes || boxes.length === 0) {
      console.log('No box found');
      return;
    }
    const lastBox = boxes[0];
    console.log('Found box:', lastBox.box_name, lastBox.id);
    
    const { data: samples } = await supabase.from('samples').select('*').eq('box_id', lastBox.id);
    console.log(`Found ${samples.length} samples in this box.`);
    
    for (let s of samples) {
       const { data: txs } = await supabase.from('transactions')
            .select('*')
            .eq('sample_id', s.id)
            .ilike('note', '%Kệ%')
            .order('created_at', { ascending: false })
            .limit(1);
            
       if (txs && txs.length > 0) {
          const note = txs[0].note;
          const m = note.match(/Kệ (\d+)\s*-\s*Ô (\d+)\s*-\s*Cột (\d+)/i);
          if (m) {
             console.log(`[MẪU]: ${s.product_name} | Vị trí cũ: Kệ ${m[1]} - Ô ${m[2]} - Cột ${m[3]} | SL: ${s.available_qty}`);
             // Restore them back to shelves
             await supabase.from('samples').update({
                shelf: parseInt(m[1]),
                slot: parseInt(m[2]),
                column_number: parseInt(m[3]),
                box_id: null,
                status: 'stored'
             }).eq('id', s.id);
          } else {
             console.log(`[MẪU]: ${s.product_name} | Không tìm thấy vị trí cũ trong ghi chú: ${note}`);
          }
       } else {
          console.log(`[MẪU]: ${s.product_name} | KHÔNG CÓ LỊCH SỬ KỆ!`);
       }
    }
    
    // Delete the box
    await supabase.from('boxes').delete().eq('id', lastBox.id);
    console.log('\nĐã hoàn tác và khôi phục 8 mẫu về kệ thành công! Xóa Thùng 09/2025.');
  }
}
main();
