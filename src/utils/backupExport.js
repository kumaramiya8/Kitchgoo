/**
 * Kitchgoo — Full Application Data & Settings Backup Utility
 *
 * Captures all tenant settings and database collections (menu, inventory,
 * orders, staff, customers, reservations, cash drawer, and audit logs)
 * into a structured, portable JSON backup file.
 */

import { getAll, getSettings, getCurrentTenant } from '../db/database';
import { FLEX_COLLECTIONS, ROW_TABLES } from '../../shared/seeds';

/**
 * Gathers complete tenant state and produces a backup payload.
 */
export function exportFullAppData() {
  const tenant = getCurrentTenant();
  const settings = getSettings();
  const allCollectionNames = [...ROW_TABLES, ...FLEX_COLLECTIONS];

  const data = {};
  const stats = {};
  let totalRecords = 0;

  for (const col of allCollectionNames) {
    try {
      const items = getAll(col);
      data[col] = items || [];
      const count = Array.isArray(items)
        ? items.length
        : (items && typeof items === 'object' ? Object.keys(items).length : 0);
      stats[col] = count;
      totalRecords += count;
    } catch (e) {
      console.warn(`[Backup] Could not export collection '${col}':`, e);
      data[col] = [];
      stats[col] = 0;
    }
  }

  const payload = {
    metadata: {
      application: 'Kitchgoo Restaurant Operating System',
      schemaVersion: '1.0',
      tenant,
      exportedAt: new Date().toISOString(),
      totalCollections: allCollectionNames.length,
      totalRecords,
      collectionStats: stats,
    },
    settings,
    data,
  };

  return payload;
}

/**
 * Trigger browser download of full JSON backup file.
 */
export function downloadJSONBackup(filename, data) {
  if (typeof window === 'undefined' || !window.document) return;
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.json') ? filename : `${filename}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
