import * as SQLite from 'expo-sqlite';

// ====== 类型定义 ======
export interface GoodList {
  id: string;
  userId: string;
  title: string;
  themeType: string;
  iconEmoji: string;
  coverColor: string;
  itemLimit: number;
  createdAt: string;
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

// ====== 初始化 ======
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('goodthings.db');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      themeType TEXT NOT NULL DEFAULT 'custom',
      iconEmoji TEXT NOT NULL DEFAULT '✨',
      coverColor TEXT NOT NULL DEFAULT '#E8ECF1',
      itemLimit INTEGER NOT NULL DEFAULT 100,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS good_items (
      id TEXT PRIMARY KEY NOT NULL,
      listId TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
      completedAt TEXT,
      memoryText TEXT NOT NULL DEFAULT '',
      mediaUris TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (listId) REFERENCES lists(id) ON DELETE CASCADE
    );
  `);

  return db;
}

function getDB(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('数据库未初始化');
  return db;
}

// ====== List CRUD ======
export async function createList(
  id: string,
  title: string,
  themeType: string,
  iconEmoji: string,
  coverColor: string,
  itemLimit: number
): Promise<void> {
  const database = getDB();
  await database.runAsync(
    'INSERT INTO lists (id, userId, title, themeType, iconEmoji, coverColor, itemLimit, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, '', title, themeType, iconEmoji, coverColor, itemLimit, new Date().toISOString()]
  );
}

export async function getAllLists(): Promise<GoodList[]> {
  const database = getDB();
  return database.getAllAsync<GoodList>('SELECT * FROM lists ORDER BY createdAt DESC');
}

export async function updateListTitle(id: string, title: string): Promise<void> {
  const database = getDB();
  await database.runAsync('UPDATE lists SET title = ? WHERE id = ?', [title, id]);
}

export async function deleteList(id: string): Promise<void> {
  const database = getDB();
  await database.runAsync('DELETE FROM good_items WHERE listId = ?', [id]);
  await database.runAsync('DELETE FROM lists WHERE id = ?', [id]);
}

/** 批量导入模板条目 */
export async function bulkInsertItems(
  listId: string,
  titles: string[]
): Promise<void> {
  const database = getDB();
  for (let i = 0; i < titles.length; i++) {
    const id = `${listId}_${String(i + 1).padStart(3, '0')}`;
    await database.runAsync(
      'INSERT INTO good_items (id, listId, title) VALUES (?, ?, ?)',
      [id, listId, titles[i]]
    );
  }
}

// ====== Item CRUD ======
export async function getItemsByList(listId: string): Promise<GoodItem[]> {
  const database = getDB();
  return database.getAllAsync<GoodItem>(
    'SELECT * FROM good_items WHERE listId = ? ORDER BY id ASC',
    [listId]
  );
}

export async function getAllItems(): Promise<GoodItem[]> {
  const database = getDB();
  return database.getAllAsync<GoodItem>('SELECT * FROM good_items ORDER BY id ASC');
}

export async function updateItemStatus(
  id: string,
  listId: string,
  status: 'pending' | 'completed'
): Promise<void> {
  const database = getDB();
  const completedAt = status === 'completed' ? new Date().toISOString() : null;
  await database.runAsync(
    'UPDATE good_items SET status = ?, completedAt = ? WHERE id = ? AND listId = ?',
    [status, completedAt, id, listId]
  );
}

export async function updateItemTitle(
  id: string,
  listId: string,
  title: string
): Promise<void> {
  const database = getDB();
  await database.runAsync(
    'UPDATE good_items SET title = ? WHERE id = ? AND listId = ?',
    [title, id, listId]
  );
}

export async function deleteItem(id: string, listId: string): Promise<void> {
  const database = getDB();
  await database.runAsync('DELETE FROM good_items WHERE id = ? AND listId = ?', [
    id,
    listId,
  ]);
}

export async function addItem(listId: string, title: string): Promise<void> {
  const database = getDB();
  const id = `${listId}_${Date.now()}`;
  await database.runAsync(
    'INSERT INTO good_items (id, listId, title) VALUES (?, ?, ?)',
    [id, listId, title]
  );
}

export async function updateItemMemory(
  id: string,
  listId: string,
  memoryText: string,
  mediaUris: string
): Promise<void> {
  const database = getDB();
  await database.runAsync(
    'UPDATE good_items SET memoryText = ?, mediaUris = ? WHERE id = ? AND listId = ?',
    [memoryText, mediaUris, id, listId]
  );
}

/** 获取 listId 下当前条目数 */
export async function getItemCount(listId: string): Promise<number> {
  const database = getDB();
  const r = await database.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM good_items WHERE listId = ?',
    [listId]
  );
  return r?.cnt ?? 0;
}

// ====== 导出全部数据（用于备份） ======
export async function exportAllData(): Promise<{ lists: GoodList[]; items: GoodItem[] }> {
  const lists = await getAllLists();
  const items = await getAllItems();
  return { lists, items };
}

/** 恢复数据（覆盖本地） */
export async function importData(
  lists: GoodList[],
  items: GoodItem[]
): Promise<void> {
  const database = getDB();
  await database.execAsync('DELETE FROM good_items');
  await database.execAsync('DELETE FROM lists');

  for (const l of lists) {
    await database.runAsync(
      'INSERT INTO lists (id, userId, title, themeType, iconEmoji, coverColor, itemLimit, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [l.id, l.userId || '', l.title, l.themeType, l.iconEmoji, l.coverColor, l.itemLimit, l.createdAt]
    );
  }

  for (const i of items) {
    await database.runAsync(
      'INSERT INTO good_items (id, listId, title, status, completedAt, memoryText, mediaUris) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [i.id, i.listId, i.title, i.status, i.completedAt, i.memoryText, i.mediaUris]
    );
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}