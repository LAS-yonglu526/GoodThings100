import { supabase } from '../config/supabase';

/**
 * 统一共享系统 —— 清单级多对多共享
 * 底层用 list_members 表，支持 2人伴侣 或 N人小队
 */

// ─── 类型定义 ────────────────────────────────────────

export interface ListMember {
  listId: string;
  userId: string;
  nickname: string;
  avatarEmoji: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

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

export interface SharedMemory {
  id: string;
  list_id: string;
  item_id: string;
  author_uid: string;
  memory_text: string;
  media_uris: string;
  created_at: string;
}

export type SharedItemChange = {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  item: Partial<SharedItem>;
};

// ─── 清单级邀请码（新系统）──────────────────────────

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** 生成清单邀请码，写入 list_invites 表 */
export async function generateListInvite(
  listId: string,
  uid: string,
): Promise<{ code?: string; error?: string }> {
  const code = genCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('list_invites').insert({
    code,
    list_id: listId,
    from_uid: uid,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };
  return { code };
}

/** 通过邀请码加入共享清单 */
export async function joinListByCode(
  code: string,
  uid: string,
): Promise<{ error?: string; listId?: string }> {
  const { data: invites, error: findErr } = await supabase
    .from('list_invites')
    .select('*')
    .eq('code', code)
    .is('claimed_by', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1);

  if (findErr) return { error: findErr.message };
  if (!invites || invites.length === 0) return { error: '邀请码无效或已过期' };

  const invite = invites[0];
  if (invite.from_uid === uid) return { error: '不能加入自己的清单' };

  // 检查是否已在清单中
  const { data: existing } = await supabase
    .from('list_members')
    .select('*')
    .eq('list_id', invite.list_id)
    .eq('user_id', uid)
    .limit(1);
  if (existing && existing.length > 0) return { error: '你已在此清单中' };

  // 标记邀请码已使用
  await supabase.from('list_invites').update({ claimed_by: uid }).eq('code', code);

  // 写入 list_members
  const { error: insertErr } = await supabase.from('list_members').insert({
    list_id: invite.list_id,
    user_id: uid,
    role: 'member',
    joined_at: new Date().toISOString(),
  });
  if (insertErr) return { error: insertErr.message };

  return { listId: invite.list_id };
}

// ─── list_members 成员管理 ──────────────────────────

/** 获取清单的所有成员 */
export async function getListMembers(listId: string): Promise<ListMember[]> {
  const { data, error } = await supabase
    .from('list_members')
    .select('*')
    .eq('list_id', listId)
    .order('joined_at', { ascending: true });
  if (error || !data) return [];

  // 批量查 profiles 获取 nickname/avatar
  const userIds = data.map((d: any) => d.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, nickname, avatar_emoji')
    .in('user_id', userIds);
  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

  return data.map((d: any) => ({
    listId: d.list_id,
    userId: d.user_id,
    nickname: profileMap[d.user_id]?.nickname || '',
    avatarEmoji: profileMap[d.user_id]?.avatar_emoji || '👤',
    role: d.role,
    joinedAt: d.joined_at,
  }));
}

/** 移除成员（仅 owner） */
export async function removeMemberFromList(
  listId: string,
  targetUid: string,
  ownerUid: string,
): Promise<{ error?: string }> {
  // 验证操作者是 owner
  const { data: owner } = await supabase
    .from('list_members')
    .select('role')
    .eq('list_id', listId)
    .eq('user_id', ownerUid)
    .single();
  if (!owner || owner.role !== 'owner') return { error: '仅群主可以移除成员' };

  const { error } = await supabase
    .from('list_members')
    .delete()
    .eq('list_id', listId)
    .eq('user_id', targetUid);
  if (error) return { error: error.message };
  return {};
}

/** 主动退出清单 */
export async function leaveList(listId: string, uid: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('list_members')
    .delete()
    .eq('list_id', listId)
    .eq('user_id', uid);
  if (error) return { error: error.message };
  return {};
}

/** 获取我参与的所有共享清单 */
export async function getMySharedLists(uid: string): Promise<{ listId: string; role: string }[]> {
  const { data } = await supabase
    .from('list_members')
    .select('list_id, role')
    .eq('user_id', uid);
  return ((data || []) as any[]).map((d: any) => ({ listId: d.list_id, role: d.role }));
}

/** 初始化清单为共享（创建时由 owner 调用，写入 owner 记录） */
export async function initListSharing(
  listId: string,
  uid: string,
): Promise<{ error?: string }> {
  const { error } = await supabase.from('list_members').insert({
    list_id: listId,
    user_id: uid,
    role: 'owner',
    joined_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return {};
}

// ─── 旧伴侣方法兼容（内部用新系统）───────────────

/** 生成邀请码 — 兼容旧调用 */
export async function createInvite(uid: string): Promise<{ code?: string; error?: string }> {
  // 用旧的 invites 表保持兼容
  const code = genCode() + '-legacy';
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('invites').insert({
    from_uid: uid,
    code,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };
  return { code };
}

export async function claimInvite(uid: string, code: string): Promise<{ error?: string; partnerUid?: string }> {
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
  const existing = await getCouplePartner(uid);
  if (existing) return { error: '你已有绑定的伴侣' };
  const partnerExisting = await getCouplePartner(invite.from_uid);
  if (partnerExisting) return { error: '对方已有绑定的伴侣' };
  await supabase.from('invites').update({ claimed_by: uid }).eq('id', invite.id);
  const { error: coupleErr } = await supabase.from('couples').insert({
    partner1_uid: invite.from_uid,
    partner2_uid: uid,
    status: 'active',
  });
  if (coupleErr) return { error: coupleErr.message };
  return { partnerUid: invite.from_uid };
}

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

export async function unbindCouple(uid: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('couples')
    .delete()
    .or(`partner1_uid.eq.${uid},partner2_uid.eq.${uid}`);
  if (error) return { error: error.message };
  return {};
}

export async function getCoupleStatus(uid: string): Promise<{
  partnered: boolean;
  partnerUid: string | null;
}> {
  const partnerUid = await getCouplePartner(uid);
  return { partnered: !!partnerUid, partnerUid };
}

// ─── 共享清单同步 ──────────────────────────────────

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

export async function fetchPartnerSharedLists(partnerUid: string): Promise<SharedList[]> {
  const { data } = await supabase
    .from('shared_lists')
    .select('*')
    .eq('owner_uid', partnerUid);
  return (data || []) as SharedList[];
}

export async function fetchSharedItems(listId: string): Promise<SharedItem[]> {
  const { data } = await supabase
    .from('shared_items')
    .select('*')
    .eq('list_id', listId)
    .order('id', { ascending: true });
  return (data || []) as SharedItem[];
}

// ─── 共同回忆墙 ────────────────────────────────────

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

export async function fetchMemories(listId: string): Promise<SharedMemory[]> {
  const { data } = await supabase
    .from('shared_memories')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: false });
  return (data || []) as SharedMemory[];
}

// ─── Realtime 订阅 ────────────────────────────────

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
      (payload) => { if (typeof onInsert === 'function') onInsert(payload.new as SharedItem); },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'shared_items',
        filter: `list_id=eq.${listId}`,
      },
      (payload) => { if (typeof onUpdate === 'function') onUpdate(payload.new as SharedItem); },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'shared_items',
        filter: `list_id=eq.${listId}`,
      },
      (payload) => { if (typeof onDelete === 'function') onDelete((payload.old as any).id); },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

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
      (payload) => { if (typeof onNew === 'function') onNew(payload.new as SharedMemory); },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}