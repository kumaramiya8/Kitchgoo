import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function checkSettings() {
  console.log('Fetching all settings from Supabase...');
  const { data, error } = await supabase.from('settings').select('*');
  if (error) {
    console.error('❌ Fetch failed:', error.message);
  } else {
    console.log(`✅ Fetched ${data.length} settings rows.`);
    data.forEach(row => {
      console.log(`- [${row.account_id}] Section: ${row.section_name}`);
      if (row.section_name === 'menuCategories') {
        console.log('  Value:', JSON.stringify(row.value, null, 2));
      }
    });
  }
}

checkSettings();
