import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = (env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/) || [])[1]?.trim();
const supabaseKey = (env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/) || [])[1]?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching most recently created samples...');
  const { data: createdSamples, error: fetchError } = await supabase
    .from('samples')
    .select('id, sku, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(40);

  if (fetchError) {
    console.error('Error fetching:', fetchError);
    return;
  }

  console.log(`Found ${createdSamples.length} recently created samples.`);
  
  const idsToReset = createdSamples.map(s => s.id);
  
  console.log('Resetting 40 newest samples to pending...');
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
    console.log(`Successfully reset ${updated.length} samples to pending.`);
  }

  // Also let's check the 17 recently updated samples (which were boxed/evicted)
  console.log('\nChecking for samples updated recently but not created recently (the 17 evicted ones)...');
  const { data: evictedSamples, error: evictFetchError } = await supabase
    .from('samples')
    .select('id, sku, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (!evictFetchError) {
     const onlyUpdated = evictedSamples.filter(s => !idsToReset.includes(s.id));
     console.log(`Found ${onlyUpdated.length} other recently updated samples. Top 5:`);
     console.log(onlyUpdated.slice(0, 5));
  }
}

run();
