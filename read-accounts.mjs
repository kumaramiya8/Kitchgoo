import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function checkAccounts() {
  console.log('Fetching all accounts from Supabase...');
  const { data: accounts, error: accError } = await supabase.from('accounts').select('*');
  if (accError) {
    console.error('❌ Accounts fetch failed:', accError.message);
  } else {
    console.log(`✅ Accounts:`, accounts);
  }

  console.log('Fetching all users from Supabase...');
  const { data: users, error: userError } = await supabase.from('users').select('*');
  if (userError) {
    console.error('❌ Users fetch failed:', userError.message);
  } else {
    console.log(`✅ Users:`);
    users.forEach(u => {
      console.log(`- [${u.account_id}] Name: ${u.name}, Email: ${u.email}, Role: ${u.role}`);
    });
  }
}

checkAccounts();
