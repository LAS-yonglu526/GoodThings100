import { supabase } from '../config/supabase';
import * as SecureStore from 'expo-secure-store';

const ACCOUNTS_KEY = 'gt100_saved_accounts';
const PROFILE_KEY = 'gt100_profile';
const CREDENTIALS_KEY = 'gt100_quick_credentials';

export interface SavedAccount {
  email: string;
  userId: string;
  nickname: string;
  avatarEmoji: string;
  lastLogin: string;
}

export interface StoredCredentials {
  email: string;
  password: string;
  userId: string;
}

export interface UserProfile {
  userId: string;
  nickname: string;
  email: string;
  avatarEmoji: string;
  avatarUrl: string;
  hasPassword: boolean;
}

// ─── 快捷凭证 ──────────────────────────────────

export async function saveQuickCredentials(email: string, password: string, userId: string) {
  const cred: StoredCredentials = { email, password, userId };
  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(cred)).catch(() => {});
}

export async function getQuickCredentials(): Promise<StoredCredentials | null> {
  try {
    const raw = await SecureStore.getItemAsync(CREDENTIALS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    return null;
  }
}

export async function removeQuickCredentials() {
  await SecureStore.deleteItemAsync(CREDENTIALS_KEY).catch(() => {});
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
  const cred = await getQuickCredentials();
  if (cred && cred.userId === userId) {
    await removeQuickCredentials();
  }
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

/** 设置密码 — 悲观更新 + 读回验证：数据库确认后才写本地 */
export async function setPasswordForUser(password: string): Promise<{ error?: string; userId?: string }> {
  const uid = await getCurrentUserId();
  if (!uid) return { error: '登录状态异常，请重新登录' };
  // Step 1: 更新 Supabase Auth 密码
  const { error: authErr } = await supabase.auth.updateUser({ password });
  if (authErr) return { error: authErr.message };
  // Step 2: upsert profiles 表
  const { error: profileErr } = await supabase.from('profiles').upsert({
    user_id: uid,
    has_password: true,
    updated_at: new Date().toISOString(),
  });
  if (profileErr) return { error: `云端同步失败: ${profileErr.message}` };
  // Step 3: 读回验证 — 只有数据库确认 has_password=true 才继续
  const { data: verify, error: verifyErr } = await supabase
    .from('profiles')
    .select('has_password')
    .eq('user_id', uid)
    .single();
  if (verifyErr || !verify || verify.has_password !== true) {
    return { error: `核验失败: ${verifyErr?.message || '数据库中 has_password 仍为 false'}` };
  }
  // Step 4: 写本地
  const email = await getCurrentUserEmail();
  if (email) { await saveQuickCredentials(email, password, uid); }
  await SecureStore.setItemAsync(`gt100_has_pw_${uid}`, 'true').catch(() => {});
  const cached = await getCachedProfile();
  if (cached && cached.userId === uid) {
    await saveProfile({ ...cached, hasPassword: true });
  }
  return { userId: uid };
}

// ─── 邮箱密码登录 ──────────────────────────────────

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ error?: string; userId?: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (data.user) {
    await saveQuickCredentials(email, password, data.user.id);
    await saveSessionToken(data.user.id).catch(() => {});
    try {
      const { data: pd } = await supabase.from('profiles').select('*').eq('user_id', data.user.id).limit(1);
      const nick = pd?.[0]?.nickname || '';
      await upsertAccount(data.user.id, email, nick, pd?.[0]?.avatar_emoji || '👤');
      if (pd?.length) {
        await saveProfile({
          userId: data.user.id,
          nickname: pd[0].nickname || '',
          email,
          avatarEmoji: pd[0].avatar_emoji || '👤',
          avatarUrl: pd[0].avatar_url || '',
          hasPassword: !!pd[0].has_password,
        });
        if (pd[0].has_password) {
          await SecureStore.setItemAsync(`gt100_has_pw_${data.user.id}`, 'true').catch(() => {});
        }
      }
    } catch {}
  }
  return { userId: data.user?.id };
}

// ─── 快捷登录（静默密码登录）────────────────────────────

export async function quickSignIn(): Promise<{ error?: string; userId?: string }> {
  const cred = await getQuickCredentials();
  if (!cred) return { error: '无快捷凭证' };
  return signInWithPassword(cred.email, cred.password);
}

// ─── 退出 / 查当前用户 ────────────────────────────────

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  try {
    await SecureStore.deleteItemAsync(PROFILE_KEY);
  } catch {}
}

// ─── Session 恢复 / 持久化 ────────────────────────────

export async function restoreSession(uid: string): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(`gt100_session_${uid}`);
    if (!raw) return false;
    const { access_token, refresh_token } = JSON.parse(raw);
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error || !data.session) return false;
    return true;
  } catch {
    return false;
  }
}

export async function saveSessionToken(uid: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await SecureStore.setItemAsync(`gt100_session_${uid}`, JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }));
    }
  } catch {}
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
  userId?: string,
): Promise<{ error?: string }> {
  const uid = userId || (await getCurrentUserId());
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
  try {
    const { error } = await supabase.from('profiles').upsert(update);
    if (error) return { error: error.message };
  } catch {}
  if (hasPassword === true) {
    await SecureStore.setItemAsync(`gt100_has_pw_${uid}`, 'true').catch(() => {});
  }
  const profile: UserProfile = { userId: uid, nickname, email, avatarEmoji: avatarEmoji, avatarUrl: avatarUrl || '', hasPassword: hasPassword ?? false };
  await saveProfile(profile);
  await upsertAccount(uid, email, nickname, avatarEmoji);
  return {};
}

/** 加载 profile — 先验证缓存属于当前用户，防止旧账号缓存投毒 */
export async function loadProfile(): Promise<UserProfile | null> {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const cached = await getCachedProfile();
  if (cached && cached.userId === uid) return cached;
  const email = (await getCurrentUserEmail()) || '';
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
      if (p.hasPassword) {
        await SecureStore.setItemAsync(`gt100_has_pw_${uid}`, 'true').catch(() => {});
      }
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