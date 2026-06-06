import { supabase } from '../config/supabase';
import * as SecureStore from 'expo-secure-store';

const ACCOUNTS_KEY = 'gt100_saved_accounts';
const PROFILE_KEY = 'gt100_profile';

export interface SavedAccount {
  email: string;
  userId: string;
  nickname: string;
  avatarEmoji: string;
  lastLogin: string;
}

export interface UserProfile {
  userId: string;
  nickname: string;
  email: string;
  avatarEmoji: string;
  avatarUrl: string;
  hasPassword: boolean;
}

// ─── 账号存储 ──────────────────────────────────────

export async function getSavedAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveAccounts(accounts: SavedAccount[]) {
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function upsertAccount(uid: string, email: string, nickname: string, avatarEmoji: string = "👤") {
  const accounts = await getSavedAccounts();
  const idx = accounts.findIndex(a => a.userId === uid);
  const entry: SavedAccount = { email, userId: uid, nickname, avatarEmoji, lastLogin: new Date().toISOString() };
  if (idx >= 0) accounts[idx] = entry;
  else accounts.unshift(entry);
  if (accounts.length > 5) accounts.splice(5);
  await saveAccounts(accounts);
}

export async function removeSavedAccount(userId: string) {
  const accounts = await getSavedAccounts();
  await saveAccounts(accounts.filter(a => a.userId !== userId));
}

// ─── 用户资料缓存 ──────────────────────────────────

async function getCachedProfile(): Promise<UserProfile | null> {
  try {
    const raw = await SecureStore.getItemAsync(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveProfile(profile: UserProfile) {
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
}

// ─── 邮箱 OTP ──────────────────────────────────────

export async function sendEmailOTP(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) return { error: error.message };
  return {};
}

export async function verifyEmailOTP(
  email: string,
  token: string
): Promise<{ error?: string; userId?: string }> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return { error: error.message };
  await upsertAccount(data.user!.id, email, '', '👤');
  return { userId: data.user?.id };
}

// ─── 注册（OTP 验证后设密码 + 用户名）───────────────

/** OTP 验证邮箱后，设置密码完成注册 */
export async function setPasswordForUser(password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  // 标记 has_password
  const uid = await getCurrentUserId();
  if (uid) {
    await supabase.from('profiles').upsert({
      user_id: uid,
      has_password: true,
      updated_at: new Date().toISOString(),
    });
  }
  return {};
}

// ─── 邮箱密码登录 ──────────────────────────────────

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ error?: string; userId?: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (data.user) {
    // 登录成功后加载/同步 profile 缓存
    const { data: pd } = await supabase.from('profiles').select('*').eq('user_id', data.user.id).limit(1);
    const nick = pd?.[0]?.nickname || '';
    await upsertAccount(data.user.id, email, nick, pd?.[0]?.avatar_emoji || '👤');
    if (pd?.length) {
      await saveProfile({
        userId: data.user.id,
        nickname: pd[0].nickname || '',
        email,
        avatarEmoji: pd[0].avatar_emoji || '👤',
        hasPassword: !!pd[0].has_password,
      });
    }
  }
  return { userId: data.user?.id };
}

// ─── 退出 / 查当前用户 ────────────────────────────────

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function getCurrentUserEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email ?? null;
}

// ─── Supabase profiles 同步 ───────────────────────────

export async function syncProfile(
  nickname: string,
  avatarEmoji: string = '👤',
  hasPassword?: boolean,
  avatarUrl?: string,
): Promise<{ error?: string }> {
  const uid = await getCurrentUserId();
  if (!uid) return { error: '未登录' };
  const email = (await getCurrentUserEmail()) || '';
  const update: any = {
    user_id: uid,
    nickname,
    email,
    avatar_emoji: avatarEmoji,
    updated_at: new Date().toISOString(),
  };
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl;
  if (hasPassword !== undefined) update.has_password = hasPassword;
  const { error } = await supabase.from('profiles').upsert(update);
  if (error) return { error: error.message };
  const profile: UserProfile = { userId: uid, nickname, email, avatarEmoji: avatarEmoji, avatarUrl: avatarUrl || '', hasPassword: hasPassword ?? false };
  await saveProfile(profile);
  await upsertAccount(uid, email, nickname, avatarEmoji);
  return {};
}

export async function loadProfile(): Promise<UserProfile | null> {
  const cached = await getCachedProfile();
  if (cached) return cached;
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const email = (await getCurrentUserEmail()) || '';
  // profiles 表可能不存在 → 容错返回默认，避免无限循环弹密码提示
  try {
    const { data } = await supabase.from('profiles').select('*').eq('user_id', uid).limit(1);
    if (data && data.length > 0) {
      const p: UserProfile = {
        userId: uid,
        nickname: data[0].nickname || '',
        email: data[0].email || email,
        avatarEmoji: data[0].avatar_emoji || '👤',
        avatarUrl: data[0].avatar_url || '',
        hasPassword: !!data[0].has_password,
      };
      await saveProfile(p);
      return p;
    }
  } catch {}
  const fallback: UserProfile = { userId: uid, nickname: '', email, avatarEmoji: '👤', avatarUrl: '', hasPassword: false };
  await saveProfile(fallback);
  return fallback;
}

// ─── 备份恢复 ────────────────────────────────────────

export async function backupToCloud(lists: any[], items: any[]): Promise<{ error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { error: '未登录' };
  await supabase.from('user_lists').delete().eq('user_id', userId);
  await supabase.from('user_items').delete().eq('user_id', userId);
  if (lists.length > 0) {
    const { error: listsErr } = await supabase.from('user_lists').insert(lists.map(l => ({ ...l, user_id: userId })));
    if (listsErr) return { error: listsErr.message };
  }
  if (items.length > 0) {
    const { error: itemsErr } = await supabase.from('user_items').insert(items.map(i => ({ ...i, user_id: userId })));
    if (itemsErr) return { error: itemsErr.message };
  }
  return {};
}

export async function restoreFromCloud(): Promise<{ lists: any[]; items: any[]; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { lists: [], items: [], error: '未登录' };
  const { data: lists, error: listsErr } = await supabase.from('user_lists').select('*').eq('user_id', userId);
  if (listsErr) return { lists: [], items: [], error: listsErr.message };
  const { data: items, error: itemsErr } = await supabase.from('user_items').select('*').eq('user_id', userId);
  if (itemsErr) return { lists: [], items: [], error: itemsErr.message };
  return {
    lists: (lists || []).map(({ user_id, ...rest }: any) => rest),
    items: (items || []).map(({ user_id, ...rest }: any) => rest),
  };
}