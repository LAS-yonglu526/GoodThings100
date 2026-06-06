import { supabase } from '../config/supabase';

/**
 * 双人模式服务 —— 结对绑定、邀请码、共享清单同步、回忆墙
 */

// ─── 邀请码 ────────────────────────────────────────

/** 生成长串邀请码 */
export function generateInviteCode(): string {
  const r1=Math.random().toString(16).slice(2,10);const ts=Date.now().toString(16).slice(-4);const r2=Math.random().toString(16).slice(2,6);return `${r1}-${ts}-${r2}`;
}

/** 当前用户创建邀请码，写入 Supabase invites 表 */
export async function createInvite(uid: string): Promise<{ code?: string; error?: string }> {
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h过期
  const { error } = await supabase.from('invites').insert({
    from_uid: uid,
    code,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };
  return { code };
}

/** 对方输入邀请码，完成绑定 */
export async function claimInvite(uid: string, code: string): Promise<{ error?: string; partnerUid?: string }> {
  // 查找有效邀请码
  const { data: invites, error: findErr } = await supabase
    .from('invites')
    .select('*')
    .eq('code', code)
    .is('claimed_by', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1);

  if (findErr) return { error: findErr.message };
  if (!invites || invites.length === 0) return { error: '邀请码无效或已过期' };

  const invite = invites[0];
  if (invite.from_uid === uid) return { error: '不能绑定自己' };

  // 检查是否已有绑定
  const existing = await getCouplePartner(uid);
  if (existing) return { error: '你已有绑定的伴侣' };

  const partnerExisting = await getCouplePartner(invite.from_uid);
  if (partnerExisting) return { error: '对方已有绑定的伴侣' };

  // 标记邀请码已使用
  await supabase.from('invites').update({ claimed_by: uid }).eq('id', invite.id);

  // 创建 couple 记录
  const { error: coupleErr } = await supabase.from('couples').insert({
    partner1_uid: invite.from_uid,
    partner2_uid: uid,
    status: 'active',
  });

  if (coupleErr) return { error: coupleErr.message };
  return { partnerUid: invite.from_uid };
}

/** 获取伴侣 UID */
export async function getCouplePartner(uid: string): Promise<string | null> {
  const { data } = await supabase
    .from('couples')
    .select('*')
    .or(`partner1_uid.eq.${uid},partner2_uid.eq.${uid}`)
    .eq('status', 'active')
    .limit(1);

  if (!data || data.length === 0) return null;
  const row = data[0];
  return row.partner1_uid === uid ? row.partner2_uid : row.partner1_uid;
}

/** 解除绑定 */
export async function unbindCouple(uid: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('couples')
    .delete()
    .or(`partner1_uid.eq.${uid},partner2_uid.eq.${uid}`);
  if (error) return { error: error.message };
  return {};
}

/** 获取绑定状态（含状态标记） */
export async function getCoupleStatus(uid: string): Promise<{
  partnered: boolean;
  partnerUid: string | null;
}> {
  const partnerUid = await getCouplePartner(uid);
  return { partnered: !!partnerUid, partnerUid };
}


// ─── 共享清单同步 ──────────────────────────────────

export interface SharedList {
  list_id: string;
  owner_uid: string;
  partner_uid: string;
  title: string;
  theme_type: string;
  icon_emoji: string;
  cover_color: string;
  item_limit: number;
  created_at: string;
}

export interface SharedItem {
  id: string;
  list_id: string;
  title: string;
  status: 'pending' | 'completed';
  completed_at: string | null;
  completed_by: string | null;
  memory_text: string;
  media_uris: string;
}

/** 推送共享清单到 Supabase */
export async function pushSharedList(
  listId: string,
  uid: string,
  partnerUid: string,
  title: string,
  themeType: string,
  iconEmoji: string,
  coverColor: string,
  itemLimit: number,
  createdAt: string,
): Promise<{ error?: string }> {
  const { error } = await supabase.from('shared_lists').upsert({
    list_id: listId,
    owner_uid: uid,
    partner_uid: partnerUid,
    title,
    theme_type: themeType,
    icon_emoji: iconEmoji,
    cover_color: coverColor,
    item_limit: itemLimit,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return {};
}

/** 批量推送共享清单胶囊 */
export async function pushSharedItems(
  listId: string,
  items: { id: string; title: string }[],
): Promise<{ error?: string }> {
  if (items.length === 0) return {};
  const payload = items.map(i => ({
    id: i.id,
    list_id: listId,
    title: i.title,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('shared_items').upsert(payload);
  if (error) return { error: error.message };
  return {};
}

/** 同步共享胶囊状态变更 */
export async function pushItemStatusChange(
  itemId: string,
  listId: string,
  status: 'pending' | 'completed',
  completedBy: string,
): Promise<{ error?: string }> {
  const at = status === 'completed' ? new Date().toISOString() : null;
  const { error } = await supabase.from('shared_items').upsert({
    id: itemId,
    list_id: listId,
    status,
    completed_at: at,
    completed_by: completedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return {};
}

/** 拉取伴侣的共享清单列表 */
export async function fetchPartnerSharedLists(partnerUid: string): Promise<SharedList[]> {
  const { data } = await supabase
    .from('shared_lists')
    .select('*')
    .eq('owner_uid', partnerUid);
  return (data || []) as SharedList[];
}

/** 拉取共享清单的胶囊 */
export async function fetchSharedItems(listId: string): Promise<SharedItem[]> {
  const { data } = await supabase
    .from('shared_items')
    .select('*')
    .eq('list_id', listId)
    .order('id', { ascending: true });
  return (data || []) as SharedItem[];
}


// ─── 共同回忆墙 ────────────────────────────────────

export interface SharedMemory {
  id: string;
  list_id: string;
  item_id: string;
  author_uid: string;
  memory_text: string;
  media_uris: string;
  created_at: string;
}

/** 推送手记到回忆墙 */
export async function pushMemory(
  memoryId: string,
  listId: string,
  itemId: string,
  authorUid: string,
  memoryText: string,
  mediaUris: string,
): Promise<{ error?: string }> {
  const { error } = await supabase.from('shared_memories').upsert({
    id: memoryId,
    list_id: listId,
    item_id: itemId,
    author_uid: authorUid,
    memory_text: memoryText,
    media_uris: mediaUris,
    created_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return {};
}

/** 获取回忆时间线 */
export async function fetchMemories(listId: string): Promise<SharedMemory[]> {
  const { data } = await supabase
    .from('shared_memories')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: false });
  return (data || []) as SharedMemory[];
}


// ─── Realtime 订阅 ────────────────────────────────

export type SharedItemChange = {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  item: Partial<SharedItem>;
};

/** 订阅共享清单的实时变更 */
export function subscribeSharedItems(
  listId: string,
  onInsert: (item: SharedItem) => void,
  onUpdate: (item: SharedItem) => void,
  onDelete: (id: string) => void,
) {
  const channel = supabase
    .channel(`shared_items_${listId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'shared_items',
        filter: `list_id=eq.${listId}`,
      },
      (payload) => onInsert(payload.new as SharedItem),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'shared_items',
        filter: `list_id=eq.${listId}`,
      },
      (payload) => onUpdate(payload.new as SharedItem),
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'shared_items',
        filter: `list_id=eq.${listId}`,
      },
      (payload) => onDelete((payload.old as any).id),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** 订阅回忆墙变更 */
export function subscribeMemories(
  listId: string,
  onNew: (memory: SharedMemory) => void,
) {
  const channel = supabase
    .channel(`shared_memories_${listId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'shared_memories',
        filter: `list_id=eq.${listId}`,
      },
      (payload) => onNew(payload.new as SharedMemory),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}