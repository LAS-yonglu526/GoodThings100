/**
 * @copyright 2025 L.A.S 庸禄 (LAS-yonglu526). All rights reserved.
 * 好事100 (GoodThings100) — 数字清单 App
 */

import { supabase } from '../config/supabase';
import { updateItemStatus, createSharedList, upsertItem, initDatabase } from './database';

/**
 * 统一共享系统 —— 清单级多对多共享
 * 
 * 核心表：list_members (唯一信源)
 * 同步管道：shared_lists / shared_items / shared_memories (Realtime)
 * 
 * 伴侣仅为社交标签，不影响数据权限。权限完全由 list_members 控制。
 */

// ─── 类型定义 ────────────────────────────────────────

export interface ListMember {
  listId: string;
  userId: string;
  nickname: string;
  avatarEmoji: string;
  role: 'owner' | 'member';
  joinedAt: string;
  coupleTag?: boolean;
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

export interface SharedListSummary {
  listId: string;
  title: string;
  iconEmoji: string;
  themeType: string;
  isCouple: boolean;
  memberCount: number;
  members: { avatarEmoji: string; nickname: string; userId: string }[];
  latestActivity?: { text: string; time: string };
}

// ─── 邀请码（6位数字，24h过期）─────────────────────

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function generateListInvite(
  listId: string,
  uid: string,
): Promise<{ code?: string; error?: string }> {
  const code = genCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await supabase.from('list_invites').insert({
    code,
    list_id: listId,
    from_uid: uid,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };
  return { code };
}

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

  // 成员上限检查（TODO: 正式上线后启用，当前测试阶段跳过）
  // const { count } = await supabase
  //   .from('list_members')
  //   .select('*', { count: 'exact', head: true })
  //   .eq('list_id', invite.list_id);
  // if (count && count >= 4) return { error: '该清单成员已满（最多4人），请升级解锁更多' };

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

  // 同步清单 + 胶囊到本地 SQLite
  try {
    await initDatabase();
    const { data: sl } = await supabase.from('shared_lists').select('*').eq('list_id', invite.list_id).limit(1);
    if (sl && sl.length > 0) {
      const list = sl[0] as any;
      await createSharedList(list.list_id, list.title, list.theme_type, list.icon_emoji, list.cover_color, list.item_limit, uid);
    }
    const { data: items } = await supabase.from('shared_items').select('*').eq('list_id', invite.list_id);
    if (items) {
      for (const item of items as any[]) {
        await upsertItem(item.id, item.list_id, item.title);
      }
    }
  } catch {}

  return { listId: invite.list_id };
}

/** 群主切换清单的情侣视觉标签 */
export async function toggleCoupleTag(
  listId: string,
  uid: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const { data: owner } = await supabase
    .from('list_members')
    .select('role')
    .eq('list_id', listId)
    .eq('user_id', uid)
    .single();
  if (!owner || owner.role !== 'owner') return { error: '仅群主可以修改' };

  const { error } = await supabase
    .from('list_members')
    .update({ couple_tag: enabled })
    .eq('list_id', listId);
  if (error) return { error: error.message };
  return {};
}

// ─── list_members 成员管理 ──────────────────────────

export async function getListMembers(listId: string): Promise<ListMember[]> {
  const { data, error } = await supabase
    .from('list_members')
    .select('*')
    .eq('list_id', listId)
    .order('joined_at', { ascending: true });
  if (error || !data) return [];

  const userIds = (data as any[]).map((d: any) => d.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, nickname, avatar_emoji')
    .in('user_id', userIds);
  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

  return (data as any[]).map((d: any) => ({
    listId: d.list_id,
    userId: d.user_id,
    nickname: profileMap[d.user_id]?.nickname || '',
    avatarEmoji: profileMap[d.user_id]?.avatar_emoji || '👤',
    role: d.role,
    joinedAt: d.joined_at,
    coupleTag: d.couple_tag === true,
  }));
}

export async function removeMemberFromList(
  listId: string,
  targetUid: string,
  ownerUid: string,
): Promise<{ error?: string }> {
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

export async function leaveList(listId: string, uid: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('list_members')
    .delete()
    .eq('list_id', listId)
    .eq('user_id', uid);
  if (error) return { error: error.message };
  return {};
}

// ─── 清单级共享初始化（增强版）──────────────────────

/**
 * 初始化清单共享：写入 owner 记录 + 自动推 shared_lists/shared_items
 * 
 * @param listId 清单ID
 * @param uid owner UID
 * @param partnerUid 可选：同时加入的伴侣UID（打 coupleTag）
 * @param title 清单标题
 * @param themeType 主题
 * @param iconEmoji 图标
 * @param coverColor 主题色
 * @param itemLimit 胶囊上限
 * @param items 所有胶囊（用于推送到 shared_items）
 * @param createdAt 创建时间
 */
export async function initListSharing(
  listId: string,
  uid: string,
  title: string,
  themeType: string,
  iconEmoji: string,
  coverColor: string,
  itemLimit: number,
  items: { id: string; title: string }[],
  createdAt: string,
  partnerUid?: string,
): Promise<{ error?: string }> {
  // 1. 写入 owner 记录
  const { error: ownerErr } = await supabase.from('list_members').insert({
    list_id: listId,
    user_id: uid,
    role: 'owner',
    joined_at: new Date().toISOString(),
  });
  if (ownerErr) return { error: ownerErr.message };

  // 2. 如果指定了伴侣，自动加入并标记 couple_tag
  if (partnerUid && partnerUid !== uid) {
    await supabase.from('list_members').insert({
      list_id: listId,
      user_id: partnerUid,
      role: 'member',
      couple_tag: true,
      joined_at: new Date().toISOString(),
    });
  }

  // 3. 推 shared_lists（使用 partner_uid 存占位——后续可能多个member，这里暂用 owner 填充）
  const { error: slErr } = await supabase.from('shared_lists').upsert({
    list_id: listId,
    owner_uid: uid,
    partner_uid: partnerUid || uid,
    title,
    theme_type: themeType,
    icon_emoji: iconEmoji,
    cover_color: coverColor,
    item_limit: itemLimit,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
  });
  if (slErr) return { error: slErr.message };

  // 4. 批量推 shared_items
  if (items.length > 0) {
    const payload = items.slice(0, itemLimit).map(i => ({
      id: i.id,
      list_id: listId,
      title: i.title,
      status: 'pending',
      updated_at: new Date().toISOString(),
    }));
    const { error: siErr } = await supabase.from('shared_items').upsert(payload);
    if (siErr) return { error: siErr.message };
  }

  return {};
}

// ─── 获取共享清单汇总（设置页用）─────────────────────

/** 获取我参与的所有共享清单（我创建的 + 我加入的） */
export async function getMySharedLists(uid: string): Promise<SharedListSummary[]> {
  const { data: allMy } = await supabase
    .from('list_members')
    .select('list_id, role')
    .eq('user_id', uid);
  if (!allMy || allMy.length === 0) return [];

  const listIds = [...new Set((allMy as any[]).map((d: any) => d.list_id))];

  const { data: members } = await supabase.from('list_members').select('*').in('list_id', listIds);
  if (!members) return [];

  const groups: Record<string, any[]> = {};
  (members as any[]).forEach((m: any) => { if (!groups[m.list_id]) groups[m.list_id] = []; groups[m.list_id].push(m); });

  const sharedListIds = Object.keys(groups).filter(k => groups[k].length >= 2);
  if (sharedListIds.length === 0) return [];

  const { data: slData } = await supabase.from('shared_lists').select('*').in('list_id', sharedListIds);
  const slMap: Record<string, any> = {}; (slData || []).forEach((sl: any) => { slMap[sl.list_id] = sl; });

  const allUserIds = [...new Set((members as any[]).map((m: any) => m.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('user_id, nickname, avatar_emoji').in('user_id', allUserIds);
  const profileMap: Record<string, any> = {}; (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

  const { data: recentItems } = await supabase
    .from('shared_items').select('list_id, title, completed_by, completed_at')
    .in('list_id', sharedListIds).eq('status', 'completed').not('completed_by', 'is', null)
    .order('completed_at', { ascending: false }).limit(sharedListIds.length * 3);
  const latestByList: Record<string, any> = {};
  (recentItems || []).forEach((ri: any) => { if (!latestByList[ri.list_id]) latestByList[ri.list_id] = ri; });

  return sharedListIds.map(listId => {
    const sl = slMap[listId] || {};
    const memberList = (groups[listId] || []).map((m: any) => ({
      userId: m.user_id, avatarEmoji: profileMap[m.user_id]?.avatar_emoji || '👤', nickname: profileMap[m.user_id]?.nickname || '',
    }));
    const hasCouple = (groups[listId] || []).some((m: any) => m.couple_tag === true);
    const latest = latestByList[listId];
    const latestActivity = latest ? { text: `${profileMap[latest.completed_by]?.nickname || '某人'} 完成了「${latest.title}」`, time: latest.completed_at } : undefined;
    return { listId, title: sl.title || '', iconEmoji: sl.icon_emoji || '✨', themeType: sl.theme_type || 'custom', isCouple: hasCouple, memberCount: memberList.length, members: memberList.slice(0, 5), latestActivity };
  });
}

/** @deprecated 请使用 getMySharedLists */
export async function getMySharedListsAsOwner(uid: string): Promise<SharedListSummary[]> {
  // 1. 找到我是 owner 的 list_id
  const { data: owned } = await supabase
    .from('list_members')
    .select('list_id')
    .eq('user_id', uid)
    .eq('role', 'owner');
  if (!owned || owned.length === 0) return [];

  const listIds = (owned as any[]).map((d: any) => d.list_id);

  // 2. 查哪些清单有额外成员
  const { data: members } = await supabase
    .from('list_members')
    .select('*')
    .in('list_id', listIds);
  if (!members) return [];

  // 分组
  const groups: Record<string, any[]> = {};
  (members as any[]).forEach((m: any) => {
    if (!groups[m.list_id]) groups[m.list_id] = [];
    groups[m.list_id].push(m);
  });

  // 过滤：至少有2个成员（含owner自己）
  const sharedListIds = Object.keys(groups).filter(k => groups[k].length >= 2);
  if (sharedListIds.length === 0) return [];

  // 3. 从 shared_lists 拿元数据
  const { data: slData } = await supabase
    .from('shared_lists')
    .select('*')
    .in('list_id', sharedListIds);
  const slMap: Record<string, any> = {};
  (slData || []).forEach((sl: any) => { slMap[sl.list_id] = sl; });

  // 4. 批量查 profiles
  const allUserIds = [...new Set((members as any[]).map((m: any) => m.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, nickname, avatar_emoji')
    .in('user_id', allUserIds);
  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

  // 5. 查最近动态（从 shared_items 取最近一条状态变更）
  const { data: recentItems } = await supabase
    .from('shared_items')
    .select('list_id, title, completed_by, completed_at')
    .in('list_id', sharedListIds)
    .eq('status', 'completed')
    .not('completed_by', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(sharedListIds.length * 3);
  
  const latestByList: Record<string, any> = {};
  (recentItems || []).forEach((ri: any) => {
    if (!latestByList[ri.list_id]) latestByList[ri.list_id] = ri;
  });

  // 组装
  return sharedListIds.map(listId => {
    const sl = slMap[listId] || {};
    const memberList = (groups[listId] || []).map((m: any) => ({
      userId: m.user_id,
      avatarEmoji: profileMap[m.user_id]?.avatar_emoji || '👤',
      nickname: profileMap[m.user_id]?.nickname || '',
    }));
    const hasCouple = (groups[listId] || []).some((m: any) => m.couple_tag === true);
    const latest = latestByList[listId];
    const latestActivity = latest ? {
      text: `${profileMap[latest.completed_by]?.nickname || '某人'} 完成了「${latest.title}」`,
      time: latest.completed_at,
    } : undefined;

    return {
      listId,
      title: sl.title || '',
      iconEmoji: sl.icon_emoji || '✨',
      themeType: sl.theme_type || 'custom',
      isCouple: hasCouple,
      memberCount: memberList.length,
      members: memberList.slice(0, 5),
      latestActivity,
    };
  });
}

/** 获取"我加入的、别人创建的"清单列表（首页用） */
export async function getMyJoinedLists(uid: string): Promise<SharedListSummary[]> {
  const { data: joined } = await supabase
    .from('list_members')
    .select('list_id')
    .eq('user_id', uid)
    .eq('role', 'member');
  if (!joined || joined.length === 0) return [];

  const listIds = (joined as any[]).map((d: any) => d.list_id);

  // 批量拿 list_members
  const { data: allMembers } = await supabase
    .from('list_members')
    .select('*')
    .in('list_id', listIds);
  const groups: Record<string, any[]> = {};
  (allMembers || []).forEach((m: any) => {
    if (!groups[m.list_id]) groups[m.list_id] = [];
    groups[m.list_id].push(m);
  });

  const allUserIds = [...new Set((allMembers || []).map((m: any) => m.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, nickname, avatar_emoji')
    .in('user_id', allUserIds);
  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

  const { data: slData } = await supabase
    .from('shared_lists')
    .select('*')
    .in('list_id', listIds);
  const slMap: Record<string, any> = {};
  (slData || []).forEach((sl: any) => { slMap[sl.list_id] = sl; });

  // 最近动态
  const { data: recentItems } = await supabase
    .from('shared_items')
    .select('list_id, title, completed_by, completed_at')
    .in('list_id', listIds)
    .eq('status', 'completed')
    .not('completed_by', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(listIds.length * 3);
  const latestByList: Record<string, any> = {};
  (recentItems || []).forEach((ri: any) => {
    if (!latestByList[ri.list_id]) latestByList[ri.list_id] = ri;
  });

  return listIds.map(listId => {
    const sl = slMap[listId] || {};
    const memberList = (groups[listId] || []).map((m: any) => ({
      userId: m.user_id,
      avatarEmoji: profileMap[m.user_id]?.avatar_emoji || '👤',
      nickname: profileMap[m.user_id]?.nickname || '',
    }));
    const hasCouple = (groups[listId] || []).some((m: any) => m.couple_tag === true);
    const latest = latestByList[listId];
    const latestActivity = latest ? {
      text: `${profileMap[latest.completed_by]?.nickname || '某人'} 完成了「${latest.title}」`,
      time: latest.completed_at,
    } : undefined;

    return {
      listId,
      title: sl.title || '',
      iconEmoji: sl.icon_emoji || '✨',
      themeType: sl.theme_type || 'custom',
      isCouple: hasCouple,
      memberCount: memberList.length,
      members: memberList.slice(0, 5),
      latestActivity,
    };
  });
}

// ─── 级联取消共享 ──────────────────────────────────

/**
 * Owner 取消整个清单的共享，级联清理所有关联数据
 */
export async function unshareList(listId: string, uid: string): Promise<{ error?: string }> {
  // 验证操作者是 owner
  const { data: owner } = await supabase
    .from('list_members')
    .select('role')
    .eq('list_id', listId)
    .eq('user_id', uid)
    .single();
  if (!owner || owner.role !== 'owner') return { error: '仅群主可以取消共享' };

  // 级联删除
  await supabase.from('list_invites').delete().eq('list_id', listId);
  await supabase.from('shared_items').delete().eq('list_id', listId);
  await supabase.from('shared_memories').delete().eq('list_id', listId);
  await supabase.from('shared_lists').delete().eq('list_id', listId);
  await supabase.from('list_members').delete().eq('list_id', listId);

  return {};
}

// ─── 胶囊同步管道 ──────────────────────────────────

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
      (payload) => {
        const newItem = payload.new as SharedItem;
        if (typeof onUpdate === 'function') onUpdate(newItem);
        // 持久化到本地 SQLite，防止重启丢状态
        try {
          updateItemStatus(newItem.id, newItem.list_id, newItem.status);
        } catch {}
      },
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

/** 订阅 list_members 变更（成员增删通知） */
export function subscribeListMembers(
  listId: string,
  onDelete: (userId: string) => void,
) {
  const channel = supabase
    .channel(`list_members_${listId}`)
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'list_members',
        filter: `list_id=eq.${listId}`,
      },
      (payload) => { if (typeof onDelete === 'function') onDelete((payload.old as any).user_id); },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ══════════════════════════════════════════════════
// 以下为旧伴侣系统兼容层（逐步废弃）
// ══════════════════════════════════════════════════

/** @deprecated 请使用 initListSharing + generateListInvite */
export async function createInvite(uid: string): Promise<{ code?: string; error?: string }> {
  const code = genCode() + '-legacy';
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await supabase.from('invites').insert({
    from_uid: uid,
    code,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };
  return { code };
}

/** @deprecated 请使用 joinListByCode */
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

/** @deprecated */
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

/** @deprecated 请使用 unshareList + leaveList */
export async function unbindCouple(uid: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('couples')
    .delete()
    .or(`partner1_uid.eq.${uid},partner2_uid.eq.${uid}`);
  if (error) return { error: error.message };
  return {};
}

/** @deprecated 请使用 getMyJoinedLists */
export async function getCoupleStatus(uid: string): Promise<{
  partnered: boolean;
  partnerUid: string | null;
}> {
  const partnerUid = await getCouplePartner(uid);
  return { partnered: !!partnerUid, partnerUid };
}

/** @deprecated 请使用 initListSharing */
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

/** @deprecated */
export async function fetchPartnerSharedLists(partnerUid: string): Promise<SharedList[]> {
  const { data } = await supabase
    .from('shared_lists')
    .select('*')
    .eq('owner_uid', partnerUid);
  return (data || []) as SharedList[];
}