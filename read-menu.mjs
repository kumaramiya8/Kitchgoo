import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function checkMenu() {
  console.log('Fetching all menu items from Supabase...');
  const { data, error } = await supabase.from('menu').select('*');
  if (error) {
    console.error('❌ Fetch failed:', error.message);
  } else {
    console.log(`✅ Fetched ${data.length} menu items.`);
    if (data.length > 0) {
      console.log('Sample menu items:');
      data.slice(0, 10).forEach(item => {
        console.log(`- [${item.account_id}] ID: ${item.id}, Name: ${item.name}, Price: ${item.price}, Category: ${item.category}, Active: ${item.active}`);
      });
    }
  }
}

checkMenu();
