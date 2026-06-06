import * as SQLite from 'expo-sqlite';

export interface GoodList {
  id: string;
  userId: string;
  title: string;
  themeType: string;
  iconEmoji: string;
  coverColor: string;
  itemLimit: number;
  createdAt: string;
  isShared: number;
}

export interface GoodItem {
  id: string;
  listId: string;
  title: string;
  status: 'pending' | 'completed';
  completedAt: string | null;
  memoryText: string;
  mediaUris: string;
}

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('goodthings.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY NOT NULL, userId TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,
      themeType TEXT NOT NULL DEFAULT 'custom', iconEmoji TEXT NOT NULL DEFAULT '✨',
      coverColor TEXT NOT NULL DEFAULT '#E8ECF1', itemLimit INTEGER NOT NULL DEFAULT 100,
      createdAt TEXT NOT NULL, isShared INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS good_items (
      id TEXT PRIMARY KEY NOT NULL, listId TEXT NOT NULL, title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', completedAt TEXT,
      memoryText TEXT NOT NULL DEFAULT '', mediaUris TEXT NOT NULL DEFAULT '[]'
    );
  `);
  return db;
}
function getDB(): SQLite.SQLiteDatabase { if (!db) throw new Error('DB uninit'); return db; }

export async function createList(id: string, title: string, themeType: string, iconEmoji: string, coverColor: string, itemLimit: number) {
  await getDB().runAsync('INSERT INTO lists (id, userId, title, themeType, iconEmoji, coverColor, itemLimit, createdAt, isShared) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, '', title, themeType, iconEmoji, coverColor, itemLimit, new Date().toISOString(), 0]);
}
export async function createSharedList(id: string, title: string, themeType: string, iconEmoji: string, coverColor: string, itemLimit: number) {
  await getDB().runAsync('INSERT INTO lists (id, userId, title, themeType, iconEmoji, coverColor, itemLimit, createdAt, isShared) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, '', title, themeType, iconEmoji, coverColor, itemLimit, new Date().toISOString(), 1]);
}
export async function getAllLists(): Promise<GoodList[]> { return getDB().getAllAsync<GoodList>('SELECT * FROM lists ORDER BY createdAt DESC'); }
export async function getSharedLists(): Promise<GoodList[]> { return getDB().getAllAsync<GoodList>('SELECT * FROM lists WHERE isShared = 1 ORDER BY createdAt DESC'); }
export async function deleteList(id: string) { await getDB().runAsync('DELETE FROM good_items WHERE listId = ?', [id]); await getDB().runAsync('DELETE FROM lists WHERE id = ?', [id]); }
export async function bulkInsertItems(listId: string, titles: string[]) {
  const d = getDB();
  for (let i = 0; i < titles.length; i++) {
    await d.runAsync('INSERT INTO good_items (id, listId, title) VALUES (?, ?, ?)', [`${listId}_${String(i + 1).padStart(3, '0')}`, listId, titles[i]]);
  }
}
export async function getItemsByList(listId: string): Promise<GoodItem[]> { return getDB().getAllAsync<GoodItem>('SELECT * FROM good_items WHERE listId = ? ORDER BY id ASC', [listId]); }
export async function getAllItems(): Promise<GoodItem[]> { return getDB().getAllAsync<GoodItem>('SELECT * FROM good_items ORDER BY id ASC'); }
export async function updateItemStatus(id: string, listId: string, status: 'pending' | 'completed') {
  const at = status === 'completed' ? new Date().toISOString() : null;
  await getDB().runAsync('UPDATE good_items SET status = ?, completedAt = ? WHERE id = ? AND listId = ?', [status, at, id, listId]);
}
export async function updateItemTitle(id: string, listId: string, title: string) { await getDB().runAsync('UPDATE good_items SET title = ? WHERE id = ? AND listId = ?', [title, id, listId]); }
export async function deleteItem(id: string, listId: string) { await getDB().runAsync('DELETE FROM good_items WHERE id = ? AND listId = ?', [id, listId]); }
export async function addItem(listId: string, title: string) { await getDB().runAsync('INSERT INTO good_items (id, listId, title) VALUES (?, ?, ?)', [`${listId}_${Date.now()}`, listId, title]); }
export async function upsertItem(id: string, listId: string, title: string) {
  const existing = await getDB().getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM good_items WHERE id = ? AND listId = ?', [id, listId]);
  if (existing?.cnt) {
    await getDB().runAsync('UPDATE good_items SET title = ? WHERE id = ? AND listId = ?', [title, id, listId]);
  } else {
    await getDB().runAsync('INSERT INTO good_items (id, listId, title) VALUES (?, ?, ?)', [id, listId, title]);
  }
}
export async function updateListItemLimit(listId: string, newLimit: number) { await getDB().runAsync('UPDATE lists SET itemLimit = ? WHERE id = ?', [newLimit, listId]); }
export async function updateItemMemory(id: string, listId: string, memoryText: string, mediaUris: string) {
  await getDB().runAsync('UPDATE good_items SET memoryText = ?, mediaUris = ? WHERE id = ? AND listId = ?', [memoryText, mediaUris, id, listId]);
}
export async function getItemCount(listId: string): Promise<number> {
  const r = await getDB().getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM good_items WHERE listId = ?', [listId]);
  return r?.cnt ?? 0;
}
export async function updateListTitle(listId: string, title: string) { await getDB().runAsync('UPDATE lists SET title = ? WHERE id = ?', [title, listId]); }
export async function getCompletedCount(listId: string): Promise<number> {
  const r = await getDB().getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM good_items WHERE listId = ? AND status = ?', [listId, 'completed']);
  return r?.cnt ?? 0;
}
export async function exportAllData(): Promise<{ lists: GoodList[]; items: GoodItem[] }> {
  return { lists: await getAllLists(), items: await getAllItems() };
}
export async function importData(lists: GoodList[], items: GoodItem[]) {
  const d = getDB();
  await d.execAsync('DELETE FROM good_items'); await d.execAsync('DELETE FROM lists');
  for (const l of lists) await d.runAsync('INSERT INTO lists (id, userId, title, themeType, iconEmoji, coverColor, itemLimit, createdAt, isShared) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [l.id, l.userId || '', l.title, l.themeType, l.iconEmoji, l.coverColor, l.itemLimit, l.createdAt, l.isShared ?? 0]);
  for (const i of items) await d.runAsync('INSERT INTO good_items (id, listId, title, status, completedAt, memoryText, mediaUris) VALUES (?, ?, ?, ?, ?, ?, ?)', [i.id, i.listId, i.title, i.status, i.completedAt, i.memoryText, i.mediaUris]);
}
export async function closeDatabase() { if (db) { await db.closeAsync(); db = null; } }

/** 获取已完成条目标题列表，用于分享卡片展示 */
export async function getCompletedItemTitles(listId: string): Promise<string[]> {
  const rows = await getDB().getAllAsync<{ title: string }>(
    'SELECT title FROM good_items WHERE listId = ? AND status = ? ORDER BY completedAt DESC',
    [listId, 'completed']
  );
  return rows.map(r => r.title);
}