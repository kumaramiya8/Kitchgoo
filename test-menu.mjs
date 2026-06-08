import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function testInsert() {
  console.log('Testing menu insertion...');
  const newItem = {
    id: 'test_' + Date.now(),
    account_id: 'Kitchgoo',
    name: 'Test Burger',
    price: 150,
    category: 'Starters',
    subcategory: '',
    reporting_group: 'Food Sales',
    type: 'Veg',
    active: true,
    description: 'A test burger',
    preparation_time: 15,
    station: 'Main Kitchen',
    modifier_groups: [],
    tax_group: 'food',
    calories: 300,
    allergens: [],
    dietary_labels: [],
    cost_price: 50,
    sold_86: false,
    price_tiers: {}
  };

  const { data, error } = await supabase.from('menu').insert(newItem).select();
  if (error) {
    console.error('❌ Insert failed:', error.message);
    console.error('Full Error:', error);
  } else {
    console.log('✅ Insert succeeded!', data);
  }
}

testInsert();
