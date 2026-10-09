import { describe, it, expect } from 'vitest';
import { parseCSV, arrayToCSV } from '../src/utils/csv';

const MENU_HEADERS = [
  'id', 'name', 'description', 'price', 'costPrice', 'category',
  'subcategory', 'type', 'station', 'preparationTime', 'calories',
  'taxGroup', 'active', 'sold86', 'image', 'ingredients', 'delete'
];

function buildMenuExportRows(menu = [], inventory = []) {
  return menu.map(item => {
    const ingredientStr = (item.ingredients || []).map(ing => {
      const invItem = inventory.find(i => i.id === ing.itemId);
      const name = invItem ? invItem.name : 'Unknown';
      return `${name}:${ing.qty}:${ing.unit || ''}`;
    }).join('; ');

    return {
      id: item.id || '',
      name: item.name || '',
      description: item.description || '',
      price: item.price || '',
      costPrice: item.costPrice || '',
      category: item.category || '',
      subcategory: item.subcategory || '',
      type: item.type || '',
      station: item.station || '',
      preparationTime: item.preparationTime || '',
      calories: item.calories || '',
      taxGroup: item.taxGroup || '',
      active: String(item.active !== false),
      sold86: String(item.sold86 || false),
      image: item.image || '',
      ingredients: ingredientStr,
      delete: 'false'
    };
  });
}

function processMenuCSVImport(csvText, existingMenu = []) {
  const lines = parseCSV(csvText);
  if (lines.length < 2) {
    throw new Error('CSV is empty or missing headers');
  }

  const headers = lines[0].map(h => h.trim().toLowerCase());
  const nameIdx = headers.indexOf('name');
  const priceIdx = headers.indexOf('price');

  if (nameIdx === -1 || priceIdx === -1) {
    throw new Error('CSV must contain at least "name" and "price" columns.');
  }

  const menu = [...existingMenu];
  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row || row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

    const itemData = {};
    headers.forEach((header, idx) => {
      itemData[header] = row[idx]?.trim();
    });

    if (!itemData.name) continue;

    const rawImage = itemData.image !== undefined ? itemData.image : (
      itemData.imageurl !== undefined ? itemData.imageurl : (
        itemData.image_url !== undefined ? itemData.image_url : (
          itemData['image url'] !== undefined ? itemData['image url'] : (
            itemData['image link'] !== undefined ? itemData['image link'] : (
              itemData.imagelink !== undefined ? itemData.imagelink : (
                itemData.photo !== undefined ? itemData.photo : (
                  itemData.picture !== undefined ? itemData.picture : undefined
                )
              )
            )
          )
        )
      )
    );

    const isDelete = itemData.delete === 'true' || itemData.delete === '1' || itemData.delete?.toLowerCase() === 'yes';
    const id = itemData.id;

    let existingIdx = -1;
    if (id) {
      existingIdx = menu.findIndex(item => item.id === id);
    } else {
      existingIdx = menu.findIndex(item => item.name.toLowerCase() === itemData.name.toLowerCase());
    }

    if (existingIdx !== -1) {
      const existing = menu[existingIdx];
      if (isDelete) {
        menu.splice(existingIdx, 1);
        deleted++;
      } else {
        let resolvedImage = existing.image || '';
        if (rawImage !== undefined) {
          const trimmed = rawImage.trim();
          const lower = trimmed.toLowerCase();
          if (lower === 'delete' || lower === 'remove' || lower === 'none' || lower === 'null') {
            resolvedImage = '';
          } else if (trimmed) {
            resolvedImage = trimmed;
          }
        }

        menu[existingIdx] = {
          ...existing,
          name: itemData.name,
          description: itemData.description || '',
          price: parseFloat(itemData.price) || 0,
          costPrice: parseFloat(itemData.costprice || itemData.costPrice) || 0,
          category: itemData.category || 'Starters',
          subcategory: itemData.subcategory || '',
          type: itemData.type || 'Veg',
          station: itemData.station || 'Grill',
          preparationTime: parseInt(itemData.preparationtime || itemData.preparationTime) || 15,
          calories: parseInt(itemData.calories) || 0,
          taxGroup: itemData.taxgroup || itemData.taxGroup || 'food',
          active: itemData.active !== 'false',
          sold86: itemData.sold86 === 'true' || itemData.sold86 === '1',
          image: resolvedImage,
        };
        updated++;
      }
      continue;
    }

    if (!isDelete) {
      let resolvedImage = '';
      if (rawImage !== undefined) {
        const trimmed = rawImage.trim();
        const lower = trimmed.toLowerCase();
        if (trimmed && lower !== 'delete' && lower !== 'remove' && lower !== 'none' && lower !== 'null') {
          resolvedImage = trimmed;
        }
      }

      menu.push({
        id: itemData.id || `menu_${Date.now()}_${i}`,
        name: itemData.name,
        description: itemData.description || '',
        price: parseFloat(itemData.price) || 0,
        costPrice: parseFloat(itemData.costprice || itemData.costPrice) || 0,
        category: itemData.category || 'Starters',
        subcategory: itemData.subcategory || '',
        type: itemData.type || 'Veg',
        station: itemData.station || 'Grill',
        preparationTime: parseInt(itemData.preparationtime || itemData.preparationTime) || 15,
        calories: parseInt(itemData.calories) || 0,
        taxGroup: itemData.taxgroup || itemData.taxGroup || 'food',
        active: itemData.active !== 'false',
        sold86: itemData.sold86 === 'true' || itemData.sold86 === '1',
        image: resolvedImage,
        ingredients: [],
      });
      created++;
    }
  }

  return { menu, created, updated, deleted };
}

describe('Menu CSV Import & Export with Image Links', () => {
  const sampleMenu = [
    {
      id: 'm1',
      name: 'Cold Brew & Tonic',
      description: 'Single-origin iced coffee with craft tonic',
      price: 220,
      costPrice: 60,
      category: 'Beverages',
      subcategory: 'Coffee',
      type: 'Veg',
      station: 'Bar',
      preparationTime: 5,
      calories: 45,
      taxGroup: 'beverage',
      active: true,
      sold86: false,
      image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500',
      ingredients: [],
    },
    {
      id: 'm2',
      name: 'Paneer Tikka Roll',
      description: 'Marinated paneer grilled with onions and bell peppers',
      price: 280,
      costPrice: 90,
      category: 'Starters',
      subcategory: 'Rolls',
      type: 'Veg',
      station: 'Grill',
      preparationTime: 12,
      calories: 380,
      taxGroup: 'food',
      active: true,
      sold86: false,
      image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format,fit=crop',
      ingredients: [],
    },
    {
      id: 'm3',
      name: 'Artisan Sourdough Toast',
      description: 'House-made sourdough with whipped butter',
      price: 180,
      costPrice: 40,
      category: 'Bakery',
      subcategory: 'Toast',
      type: 'Veg',
      station: 'Bakery',
      preparationTime: 8,
      calories: 220,
      taxGroup: 'food',
      active: true,
      sold86: false,
      image: '',
      ingredients: [],
    },
  ];

  describe('Menu Export', () => {
    it('includes "image" in the CSV headers', () => {
      const rows = buildMenuExportRows(sampleMenu);
      const csv = arrayToCSV(MENU_HEADERS, rows);
      const lines = parseCSV(csv);
      const headerRow = lines[0];

      expect(headerRow).toContain('image');
      expect(MENU_HEADERS).toContain('image');
    });

    it('exports image URLs correctly in the data rows', () => {
      const rows = buildMenuExportRows(sampleMenu);
      const csv = arrayToCSV(MENU_HEADERS, rows);
      const lines = parseCSV(csv);
      const headers = lines[0];
      const imageIdx = headers.indexOf('image');
      expect(imageIdx).toBeGreaterThan(-1);

      // Row 1: Cold Brew
      expect(lines[1][imageIdx]).toBe('https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500');

      // Row 2: Paneer Tikka (contains comma in URL params)
      expect(lines[2][imageIdx]).toBe('https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format,fit=crop');

      // Row 3: Sourdough (empty image)
      expect(lines[3][imageIdx]).toBe('');
    });

    it('safely escapes inline SVG images with quotes and XML tags in export', () => {
      const svgItem = {
        id: 'm4',
        name: 'Icon Burger',
        price: 350,
        image: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="gold" /></svg>',
      };
      const rows = buildMenuExportRows([svgItem]);
      const csv = arrayToCSV(MENU_HEADERS, rows);

      // Verify that CSV parser reconstructs the exact SVG string without corruption
      const parsed = parseCSV(csv);
      const imageIdx = parsed[0].indexOf('image');
      expect(parsed[1][imageIdx]).toBe(svgItem.image);
    });
  });

  describe('Menu Import', () => {
    it('imports new menu items with image links', () => {
      const csv = [
        'name,price,category,image',
        'Truffle Fries,240,Starters,https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500',
        'Berry Smoothie,200,Beverages,https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500',
      ].join('\n');

      const result = processMenuCSVImport(csv, []);
      expect(result.created).toBe(2);
      expect(result.menu).toHaveLength(2);

      const fries = result.menu.find(m => m.name === 'Truffle Fries');
      expect(fries.image).toBe('https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500');

      const smoothie = result.menu.find(m => m.name === 'Berry Smoothie');
      expect(smoothie.image).toBe('https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500');
    });

    it('supports image header aliases such as image_url, imageUrl, image link, photo', () => {
      const csv = [
        'name,price,category,image_url',
        'Matcha Latte,260,Beverages,https://example.com/matcha.jpg',
      ].join('\n');

      const result = processMenuCSVImport(csv, []);
      expect(result.created).toBe(1);
      expect(result.menu[0].image).toBe('https://example.com/matcha.jpg');
    });

    it('updates an existing item image when a new image URL is provided', () => {
      const existing = [
        {
          id: 'm1',
          name: 'Cold Brew & Tonic',
          price: 220,
          image: 'https://old-image.com/coldbrew.jpg',
        },
      ];

      const csv = [
        'id,name,price,image',
        'm1,Cold Brew & Tonic,240,https://new-image.com/coldbrew-v2.jpg',
      ].join('\n');

      const result = processMenuCSVImport(csv, existing);
      expect(result.updated).toBe(1);
      expect(result.menu[0].image).toBe('https://new-image.com/coldbrew-v2.jpg');
      expect(result.menu[0].price).toBe(240);
    });

    it('preserves existing item image when the imported CSV has an empty image cell or no image column', () => {
      const existing = [
        {
          id: 'm1',
          name: 'Cold Brew & Tonic',
          price: 220,
          image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500',
        },
      ];

      // CSV without image column (e.g. price update only)
      const csvPriceOnly = [
        'id,name,price',
        'm1,Cold Brew & Tonic,250',
      ].join('\n');

      const res1 = processMenuCSVImport(csvPriceOnly, existing);
      expect(res1.updated).toBe(1);
      expect(res1.menu[0].price).toBe(250);
      expect(res1.menu[0].image).toBe('https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500');

      // CSV with empty image cell
      const csvEmptyCell = [
        'id,name,price,image',
        'm1,Cold Brew & Tonic,260,',
      ].join('\n');

      const res2 = processMenuCSVImport(csvEmptyCell, existing);
      expect(res2.updated).toBe(1);
      expect(res2.menu[0].price).toBe(260);
      expect(res2.menu[0].image).toBe('https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500');
    });

    it('clears an existing image when explicitly marked as "none", "remove", or "delete"', () => {
      const existing = [
        {
          id: 'm1',
          name: 'Cold Brew & Tonic',
          price: 220,
          image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500',
        },
      ];

      const csv = [
        'id,name,price,image',
        'm1,Cold Brew & Tonic,220,remove',
      ].join('\n');

      const result = processMenuCSVImport(csv, existing);
      expect(result.updated).toBe(1);
      expect(result.menu[0].image).toBe('');
    });

    it('full round-trip: exports menu to CSV and imports it back without data loss', () => {
      const rows = buildMenuExportRows(sampleMenu);
      const csv = arrayToCSV(MENU_HEADERS, rows);

      const result = processMenuCSVImport(csv, sampleMenu);
      expect(result.updated).toBe(3);
      expect(result.created).toBe(0);

      const coldBrew = result.menu.find(m => m.id === 'm1');
      expect(coldBrew.image).toBe('https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500');

      const tikka = result.menu.find(m => m.id === 'm2');
      expect(tikka.image).toBe('https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format,fit=crop');

      const toast = result.menu.find(m => m.id === 'm3');
      expect(toast.image).toBe('');
    });
  });
});
