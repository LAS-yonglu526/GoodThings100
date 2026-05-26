import * as SQLite from 'expo-sqlite';

// 数据表类型定义
export interface GoodItem {
  id: string;
  listId: string;
  title: string;
  status: 'pending' | 'completed';
  completedAt: string | null;
  memoryText: string;
  mediaUris: string; // JSON 字符串数组
}

// 10条测试数据
const SEED_DATA: Omit<GoodItem, 'listId' | 'status' | 'completedAt' | 'memoryText' | 'mediaUris'>[] = [
  { id: 'item_001', title: '一起去海边看日出' },
  { id: 'item_002', title: '给对方写一封手写信' },
  { id: 'item_003', title: '一起做一顿烛光晚餐' },
  { id: 'item_004', title: '深夜聊到凌晨三点' },
  { id: 'item_005', title: '一起养一盆多肉植物' },
  { id: 'item_006', title: '雨天窝在家看一部老电影' },
  { id: 'item_007', title: '一起看一次演唱会' },
  { id: 'item_008', title: '互相给对方取一个外号' },
  { id: 'item_009', title: '逛一次深夜便利店' },
  { id: 'item_010', title: '一起坐摩天轮到最高点' },
];

let db: SQLite.SQLiteDatabase | null = null;

/**
 * 初始化数据库连接并创建表
 */
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('goodthings.db');

  // 创建数据表
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS good_items (
      id TEXT PRIMARY KEY NOT NULL,
      listId TEXT NOT NULL DEFAULT 'list_default',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
      completedAt TEXT,
      memoryText TEXT NOT NULL DEFAULT '',
      mediaUris TEXT NOT NULL DEFAULT '[]'
    );
  `);

  // 检查是否需要插入种子数据
  const countResult = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM good_items'
  );
  if (countResult && countResult.cnt === 0) {
    await seedDatabase(db);
  }

  return db;
}

/**
 * 插入10条测试数据
 */
async function seedDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  for (const item of SEED_DATA) {
    await database.runAsync(
      `INSERT INTO good_items (id, listId, title, status, completedAt, memoryText, mediaUris)
       VALUES (?, ?, ?, 'pending', NULL, '', '[]')`,
      [item.id, 'list_couple_100', item.title]
    );
  }
}

/**
 * 获取数据库实例（需先调用 initDatabase）
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return db;
}

/**
 * 获取所有事项列表
 */
export async function getAllItems(): Promise<GoodItem[]> {
  const database = getDatabase();
  const rows = await database.getAllAsync<GoodItem>(
    'SELECT * FROM good_items ORDER BY id ASC'
  );
  return rows;
}

/**
 * 更新事项状态
 */
export async function updateItemStatus(
  id: string,
  status: 'pending' | 'completed'
): Promise<void> {
  const database = getDatabase();
  const completedAt = status === 'completed' ? new Date().toISOString() : null;
  await database.runAsync(
    'UPDATE good_items SET status = ?, completedAt = ? WHERE id = ?',
    [status, completedAt, id]
  );
}

/**
 * 更新事项的手记和媒体
 */
export async function updateItemMemory(
  id: string,
  memoryText: string,
  mediaUris: string
): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'UPDATE good_items SET memoryText = ?, mediaUris = ? WHERE id = ?',
    [memoryText, mediaUris, id]
  );
}

/**
 * 关闭数据库
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}