import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {
  sendEmailOTP, verifyEmailOTP, signOut, getCurrentUserId,
  signInWithPassword, setPasswordForUser, quickSignIn,
  getSavedAccounts, removeSavedAccount, SavedAccount,
  syncProfile, loadProfile, UserProfile,
  saveSessionToken,
} from '../services/auth';
import {
  getMySharedLists, SharedListSummary,
  unshareList, joinListByCode,
} from '../services/couple';
import { pickAndCompressAvatar } from '../services/imageStorage';
import { supabase } from '../config/supabase';

interface Props {
  onBack: () => void;
  onOpenSharing?: (listId: string) => void;
  onJoinedList?: () => void;
}

type LoginMode = 'choose_account' | 'password_login' | 'email_otp' | 'register_set_password' | 'register_set_name';

export default function SettingsScreen({ onBack, onOpenSharing, onJoinedList }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>('password_login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [busy, setBusy] = useState(false);
  const [showEditNickname, setShowEditNickname] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const passwordPromptedRef = useRef(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [hasPasswordLocal, setHasPasswordLocal] = useState(false);
  const [otpForReset, setOtpForReset] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [sharedLists, setSharedLists] = useState<SharedListSummary[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);

  const AVATARS = ['👤','🐱','🐶','🦊','🐼','🐨','🐰','🐸','🦄','🌟','🌸','🍀','🎨','🎵','🚀','💎','🔥','🌈'];

  const initBiometrics = async () => {
    try { const val = await SecureStore.getItemAsync('gt100_biometrics'); setUseBiometrics(val === 'true'); } catch {}
  };
  const toggleBiometrics = async () => {
    const next = !useBiometrics; setUseBiometrics(next);
    await SecureStore.setItemAsync('gt100_biometrics', next ? 'true' : 'false');
  };
  const handleSetAvatar = async (emoji: string) => {
    setShowAvatarPicker(false); setBusy(true);
    await syncProfile(profile?.nickname || '', emoji, undefined, ''); setBusy(false); refreshState();
  };
  const handleUploadAvatar = async () => {
    setShowAvatarPicker(false);
    try {
      const uri = await pickAndCompressAvatar();
      if (uri) { setBusy(true); await syncProfile(profile?.nickname || '', profile?.avatarEmoji || '👤', undefined, uri); setBusy(false); refreshState(); }
    } catch (err: any) { Alert.alert('上传失败', err.message || '请重试'); }
  };

  const refreshState = () => {
    getCurrentUserId().then(async (uid) => {
      setUserId(uid);
      if (uid) {
        let hasPwLocal = false;
        try { const localPw = await SecureStore.getItemAsync(`gt100_has_pw_${uid}`); if (localPw === 'true') hasPwLocal = true; } catch {}
        const p = await loadProfile(); setProfile(p);
        const hasPw = hasPwLocal || (p?.hasPassword === true); setHasPasswordLocal(hasPw);
        if (p?.hasPassword && !hasPwLocal) { await SecureStore.setItemAsync(`gt100_has_pw_${uid}`, 'true').catch(() => {}); }
        getSavedAccounts().then(setSavedAccounts);
        getMySharedLists(uid).then(setSharedLists).catch(() => {});
      } else {
        setProfile(null); setSharedLists([]);
        getSavedAccounts().then(setSavedAccounts);
      }
    });
  };
  useEffect(() => { refreshState(); initBiometrics(); }, []);

  const handleSendOTP = async () => {
    if (!email.trim() || !email.includes('@')) { Alert.alert('请输入有效邮箱'); return; }
    setBusy(true); const { error } = await sendEmailOTP(email.trim()); setBusy(false);
    if (error) Alert.alert('发送失败', error); else { setStep('otp'); Alert.alert('已发送', '请检查邮箱验证码'); }
  };
  const handleVerify = async () => {
    if (!otp.trim()) { Alert.alert('请输入验证码'); return; }
    setBusy(true); const { error } = await verifyEmailOTP(email.trim(), otp.trim()); setBusy(false);
    if (error) { Alert.alert('验证失败', error); return; }
    const uid = await getCurrentUserId(); if (uid) await saveSessionToken(uid).catch(() => {});
    const p = await loadProfile(); setProfile(p); setShowLogin(false);
    if (otpForReset) { setOtpForReset(false); setLoginMode('register_set_password'); return; }
    let hasPw = false;
    try { const localPw = await SecureStore.getItemAsync(`gt100_has_pw_${uid}`); if (localPw === 'true') hasPw = true; } catch {}
    if (!hasPw && p?.hasPassword) hasPw = true;
    if (!hasPw && uid) {
      try { const { data } = await supabase.from('profiles').select('has_password').eq('user_id', uid).limit(1); if (data?.[0]?.has_password) hasPw = true; } catch {}
    }
    if (hasPw) { setHasPasswordLocal(true); if (uid) await SecureStore.setItemAsync(`gt100_has_pw_${uid}`, 'true').catch(() => {}); refreshState(); return; }
    if (!passwordPromptedRef.current) {
      passwordPromptedRef.current = true;
      setTimeout(() => Alert.alert('设置密码', '可以设置密码和用户名', [
        { text: '下次再说', style: 'cancel', onPress: refreshState },
        { text: '设置', onPress: () => { setPassword(''); setPasswordConfirm(''); setLoginMode('register_set_password'); setShowLogin(true); }},
      ]), 500);
    } else { refreshState(); }
  };
  const handlePasswordLogin = async () => {
    if (!email.trim() || !password.trim()) { Alert.alert('请输入邮箱和密码'); return; }
    setBusy(true); const { error } = await signInWithPassword(email.trim(), password); setBusy(false);
    if (error) { Alert.alert('登录失败', error, [{ text: '用验证码登录', onPress: () => { setLoginMode('email_otp'); setStep('email'); } }, { text: '取消', style: 'cancel' }]); return; }
    const uid2 = await getCurrentUserId(); if (uid2) await saveSessionToken(uid2); setShowLogin(false); refreshState();
  };
  const pendingUidRef = useRef<string | null>(null);
  const handleRegisterSetPassword = async () => {
    if (!password || password.length < 6) { Alert.alert('密码至少6位'); return; }
    if (password !== passwordConfirm) { Alert.alert('两次密码不一致'); return; }
    setBusy(true); const { error, userId: newUid } = await setPasswordForUser(password); setBusy(false);
    if (error) { Alert.alert('设置失败', error); return; }
    pendingUidRef.current = newUid || null; setHasPasswordLocal(true); setLoginMode('register_set_name'); setEditNickname('');
  };
  const handleRegisterSetName = async () => {
    const name = editNickname.trim() || '好事用户';
    if (new TextEncoder().encode(name).length > 36) { Alert.alert('用户名过长', '最多12个中文或24个英文字符'); return; }
    setBusy(true); await syncProfile(name, '👤', true, undefined, pendingUidRef.current || undefined); setBusy(false);
    setShowLogin(false); Alert.alert('欢迎！', '账号设置完成，开始记录好事吧'); refreshState();
  };
  const handleLoginWithAccount = async (acct: SavedAccount) => {
    setShowLogin(false); const sid = await getCurrentUserId();
    if (sid === acct.userId) { refreshState(); return; }
    const bioVal = await SecureStore.getItemAsync('gt100_biometrics');
    if (bioVal === 'true') {
      try {
        const result = await LocalAuthentication.authenticateAsync({ promptMessage: '验证身份以登录' });
        if (result.success) {
          const { error: qErr, userId: qUid } = await quickSignIn(acct.userId);
          if (!qErr && qUid) { refreshState(); return; }
          setEmail(acct.email); setStep('otp'); setLoginMode('email_otp'); setShowLogin(true);
          const { error: otpErr } = await sendEmailOTP(acct.email);
          if (!otpErr) return; setStep('email'); Alert.alert('发送失败', '请检查网络后重试'); return;
        }
      } catch {}
      setEmail(acct.email);
      Alert.alert('验证未通过', `${acct.nickname || acct.email}`, [
        { text: '验证码登录', onPress: () => { setStep('email'); setLoginMode('email_otp'); setShowLogin(true); } },
        { text: '密码登录', onPress: () => { setPassword(''); setLoginMode('password_login'); setShowLogin(true); } },
        { text: '取消', style: 'cancel' },
      ]); return;
    }
    setEmail(acct.email);
    Alert.alert('选择登录方式', `${acct.nickname || acct.email}`, [
      { text: '验证码登录', onPress: () => { setStep('email'); setLoginMode('email_otp'); setShowLogin(true); } },
      { text: '密码登录', onPress: () => { setPassword(''); setLoginMode('password_login'); setShowLogin(true); } },
      { text: '取消', style: 'cancel' },
    ]);
  };
  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) { Alert.alert('密码至少6位'); return; }
    if (newPassword !== newPasswordConfirm) { Alert.alert('两次密码不一致'); return; }
    setBusy(true); const { error } = await setPasswordForUser(newPassword); setBusy(false);
    if (error) { Alert.alert('修改失败', error); return; }
    setShowChangePassword(false); setNewPassword(''); setNewPasswordConfirm(''); setHasPasswordLocal(true); Alert.alert('密码已更新'); refreshState();
  };
  const handleSaveNickname = async () => {
    const name = editNickname.trim(); if (!name) { Alert.alert('请输入用户名'); return; }
    if (new TextEncoder().encode(name).length > 36) { Alert.alert('用户名过长', '最多12个中文或24个英文字符'); return; }
    setBusy(true); await syncProfile(name, profile?.avatarEmoji || '👤'); setBusy(false);
    setShowEditNickname(false); refreshState();
  };
  const handleLogout = () => Alert.alert('退出登录', '确定要退出吗？', [
    { text: '取消', style: 'cancel' },
    { text: '退出', style: 'destructive', onPress: async () => { await signOut(); refreshState(); }},
  ]);
  const handleUnshareList = (listId: string, title: string) => {
    if (!userId) return;
    Alert.alert('取消共享', `确定取消「${title}」的共享？\n所有成员将被移除。`, [
      { text: '取消', style: 'cancel' },
      { text: '确认取消', style: 'destructive', onPress: async () => {
        setBusy(true); const { error } = await unshareList(listId, userId); setBusy(false);
        if (error) { Alert.alert('失败', error); return; } refreshState();
      }},
    ]);
  };
  const handleJoinByCode = async () => {
    if (!joinCode.trim()) { Alert.alert('请输入分享码'); return; }
    if (!userId) { Alert.alert('请先登录'); return; }
    setJoinBusy(true); const { error } = await joinListByCode(joinCode.trim().toUpperCase(), userId); setJoinBusy(false);
    if (error) { Alert.alert('加入失败', error); return; }
    setJoinCode(''); Alert.alert('加入成功', '共享清单已同步到首页，返回即可查看');
    refreshState();
    if (typeof onJoinedList === 'function') onJoinedList();
  };
  const formatTime = (iso: string) => {
    try {
      const diff = Date.now() - new Date(iso).getTime(); const mins = Math.floor(diff / 60000);
      if (mins < 1) return '刚刚'; if (mins < 60) return `${mins}分钟前`;
      const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}小时前`; return `${Math.floor(hrs / 24)}天前`;
    } catch { return ''; }
  };

  return (
    <View style={ss.root}>
      <View style={ss.safeArea}>
        <BlurView intensity={60} tint="light" style={ss.header}>
          <TouchableOpacity onPress={onBack} style={ss.backBtn}><Text style={ss.backText}>←</Text></TouchableOpacity>
          <Text style={ss.headerLabel}>设置</Text>
          <View style={ss.backBtn} />
        </BlurView>

        <ScrollView style={ss.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* 账号 */}
          <Text style={ss.sectionTitle}>账号</Text>
          {userId ? (
            <View style={ss.sectionCard}>
              <View style={ss.rowBetween}>
                <View style={ss.userInfo}>
                  <TouchableOpacity onPress={() => setShowAvatarPicker(true)}>
                    {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} /> : <Text style={ss.userAvatar}>{profile?.avatarEmoji || '👤'}</Text>}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}><Text style={ss.userName}>{profile?.nickname || '未设置用户名'}</Text><Text style={ss.userEmail}>{profile?.email || userId}</Text></View>
                </View>
                <TouchableOpacity onPress={() => { setEditNickname(profile?.nickname || ''); setShowEditNickname(true); }} style={ss.smallBtn}><Text style={ss.smallBtnText}>✏️</Text></TouchableOpacity>
              </View>
              <View style={ss.accountMetaBox}>
                <View style={ss.metaRow}><Text style={ss.metaLabel}>邮箱已验证</Text><Text style={ss.metaOk}>已认证</Text></View>
                <View style={ss.metaRow}>
                  <Text style={ss.metaLabel}>密码保护</Text>
                  {hasPasswordLocal ? (
                    <TouchableOpacity onPress={() => { setNewPassword(''); setNewPasswordConfirm(''); setShowChangePassword(true); }}>
                      <Text style={ss.metaLink}>修改 →</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => Alert.alert('设置密码', '设置密码后可用邮箱+密码登录', [
                      { text: '稍后', style: 'cancel' }, { text: '设置', onPress: () => { setPassword(''); setPasswordConfirm(''); setLoginMode('register_set_password'); setShowLogin(true); }},
                    ])}><Text style={ss.metaWarn}>设置 →</Text></TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ) : (
            <View style={ss.sectionCard}>
              {savedAccounts.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={ss.smallLabel}>快捷登录（免密）</Text>
                  {savedAccounts.slice(0, 3).map(a => (
                    <TouchableOpacity key={a.userId} style={ss.acctRow} onPress={() => handleLoginWithAccount(a)}>
                      <Text style={ss.acctIcon}>{a.avatarEmoji || "👤"}</Text>
                      <View style={{ flex: 1 }}><Text style={ss.acctName} numberOfLines={1}>{a.nickname || a.email}</Text><Text style={ss.acctEmail} numberOfLines={1}>{a.email}</Text></View>
                      <TouchableOpacity onPress={() => Alert.alert('删除账号', '从列表中移除此账号？', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => { removeSavedAccount(a.userId); setSavedAccounts(s => s.filter(x => x.userId !== a.userId)); }}])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={ss.acctDel}>🗑</Text></TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                  <View style={{ height: 1, backgroundColor: 'rgba(45,52,54,0.08)', marginVertical: 12 }} />
                </View>
              )}
              <TouchableOpacity style={ss.loginBtn} onPress={() => { setLoginMode('email_otp'); setShowLogin(true); setEmail(''); setPassword(''); setPasswordConfirm(''); setOtp(''); setStep('email'); }}>
                <Text style={ss.loginBtnText}>登录 / 注册</Text><Text style={ss.loginHint}>首次请用验证码登录</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 我的共享 */}
          {userId && (
            <View style={{ marginTop: 24 }}>
              <View style={ss.sectionHead}>
                <View style={[ss.sectionDot, { backgroundColor: '#6EB5FF' }]} />
                <Text style={ss.sectionTitle}>管理共享中的清单</Text>
              </View>

              <View style={ss.joinCard}>
                <View style={ss.joinRow}>
                  <TextInput
                    style={ss.joinInput} placeholder="输入分享码加入他人的清单" placeholderTextColor="#B2BEC3"
                    value={joinCode} onChangeText={setJoinCode} autoCapitalize="characters" maxLength={6}
                    returnKeyType="done" onSubmitEditing={handleJoinByCode}
                  />
                  <TouchableOpacity style={[ss.joinBtn, { opacity: joinBusy ? 0.6 : 1 }]} onPress={handleJoinByCode} disabled={joinBusy}>
                    <Text style={ss.joinBtnText}>{joinBusy ? '加入中' : '加入'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={ss.joinHint}>好友分享给你的 6 位邀请码，输入后即可同步共享清单</Text>
              </View>

              {sharedLists.length === 0 ? (
                <View style={ss.hintCard}><Text style={ss.hintText}>还没有共享清单 · 长按首页卡片开启</Text></View>
              ) : (
                sharedLists.map(sl => (
                  <View key={sl.listId} style={[ss.sharedListItem, sl.isCouple && ss.sharedListItemCouple]}>
                    <View style={ss.sharedListHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Text style={ss.sharedListIcon}>{sl.iconEmoji}</Text>
                        <Text style={ss.sharedListTitle} numberOfLines={1}>{sl.title}</Text>
                        {sl.isCouple && <Text style={ss.coupleTag}>💕</Text>}
                        <View style={[ss.memberCountBadge, { backgroundColor: sl.isCouple ? '#E8A0BF22' : 'rgba(0,0,0,0.06)' }]}>
                          <Text style={[ss.memberCountText, { color: sl.isCouple ? '#E8A0BF' : '#7A8A9E' }]}>{sl.memberCount}人</Text>
                        </View>
                      </View>
                      <TouchableOpacity style={[ss.manageBtn, { backgroundColor: sl.isCouple ? '#E8A0BF22' : 'rgba(0,0,0,0.05)' }]} onPress={() => { if (typeof onOpenSharing === 'function') onOpenSharing(sl.listId); }}>
                        <Text style={[ss.manageBtnText, { color: sl.isCouple ? '#E8A0BF' : '#2D3436' }]}>管理 →</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={ss.sharedMemberRow}>
                      {sl.members.map((m, i) => (<View key={m.userId} style={[ss.memberAvatarChip, i > 0 && { marginLeft: -8 }]}><Text style={{ fontSize: 16 }}>{m.avatarEmoji}</Text></View>))}
                      <Text style={ss.memberNames} numberOfLines={1}>{sl.members.map(m => m.nickname || '用户').join('、')}</Text>
                    </View>
                    {sl.latestActivity ? (
                      <View style={ss.sharedActivity}><Text style={ss.activityText} numberOfLines={1}>{sl.latestActivity.text}</Text><Text style={ss.activityTime}>{formatTime(sl.latestActivity.time)}</Text></View>
                    ) : <Text style={ss.noActivity}>暂无最近动态</Text>}
                    <TouchableOpacity onPress={() => handleUnshareList(sl.listId, sl.title)} style={ss.unshareTouch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={ss.unshareText}>取消共享</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* 安全 */}
          <View style={{ marginTop: 24 }}>
            <View style={ss.sectionHead}><View style={[ss.sectionDot, { backgroundColor: '#B2BEC3' }]} /><Text style={ss.sectionTitle}>安全</Text></View>
            <View style={ss.sectionCard}>
              <View style={ss.securityRow}>
                <Text style={ss.metaLabel}>快速验证</Text>
                <TouchableOpacity onPress={toggleBiometrics}><View style={useBiometrics ? ss.toggleOn : ss.toggleOff}><View style={[ss.toggleThumb, useBiometrics && ss.toggleThumbOn]} /></View></TouchableOpacity>
              </View>
              <Text style={ss.toggleHint}>开启后可用设备锁 / 生物识别快速验证</Text>
            </View>
          </View>

          {/* 关于 */}
          <View style={{ marginTop: 24 }}>
            <View style={ss.sectionHead}><View style={[ss.sectionDot, { backgroundColor: '#B2BEC3' }]} /><Text style={ss.sectionTitle}>关于</Text></View>
            <View style={ss.aboutCard}><Text style={ss.aboutText}>好事100 · v1.3</Text><Text style={ss.aboutSub}>100件事 · 100种仪式感</Text></View>
          </View>

          {/* 退出 */}
          {userId && (
            <TouchableOpacity style={ss.exitBtn} onPress={handleLogout} activeOpacity={0.7}>
              <Text style={ss.exitText}>退出登录</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Modals */}
      {showLogin && (<View style={ss.loginOverlay}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={ss.loginModal}>
        {loginMode === 'choose_account' ? (<><Text style={ss.loginTitle}>选择账号</Text>{savedAccounts.map(a => <TouchableOpacity key={a.userId} style={ss.acctCard} onPress={() => handleLoginWithAccount(a)}><Text style={ss.acctNameBold}>{a.nickname || a.email}</Text><Text style={ss.acctEmailSm}>{a.email}</Text></TouchableOpacity>)}<TouchableOpacity style={ss.loginActionBtn} onPress={() => { setLoginMode('password_login'); setEmail(''); setPassword(''); setPasswordConfirm(''); }}><Text style={ss.loginActionText}>使用其他账号</Text></TouchableOpacity><TouchableOpacity onPress={() => setShowLogin(false)}><Text style={ss.loginCancel}>取消</Text></TouchableOpacity></>)
        : loginMode === 'email_otp' ? (<><Text style={ss.loginTitle}>邮箱验证码</Text>{step === 'email' ? (<><TextInput style={ss.loginInput} placeholder="输入邮箱" placeholderTextColor="#B2BEC3" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" value={email} onChangeText={setEmail} /><TouchableOpacity style={ss.loginActionBtn} onPress={handleSendOTP} disabled={busy}><Text style={ss.loginActionText}>{busy ? '发送中...' : '获取验证码'}</Text></TouchableOpacity></>) : (<><Text style={ss.phoneHint}>已发送至 {email}</Text><TextInput style={ss.loginInput} placeholder="输入验证码" placeholderTextColor="#B2BEC3" keyboardType="number-pad" value={otp} onChangeText={setOtp} maxLength={6} /><TouchableOpacity style={ss.loginActionBtn} onPress={handleVerify} disabled={busy}><Text style={ss.loginActionText}>{busy ? '验证中...' : '验证登录'}</Text></TouchableOpacity></>)}<TouchableOpacity onPress={() => { setLoginMode('password_login'); setStep('email'); }}><Text style={ss.backToPhone}>切换到密码登录</Text></TouchableOpacity><TouchableOpacity onPress={() => setShowLogin(false)}><Text style={ss.loginCancel}>取消</Text></TouchableOpacity></>)
        : loginMode === 'register_set_password' ? (<><Text style={ss.loginTitle}>设置密码</Text><Text style={ss.phoneHint}>邮箱已验证</Text><TextInput style={ss.loginInput} placeholder="密码 (至少6位)" placeholderTextColor="#B2BEC3" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} /><TextInput style={ss.loginInput} placeholder="确认密码" placeholderTextColor="#B2BEC3" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" value={passwordConfirm} onChangeText={setPasswordConfirm} /><TouchableOpacity style={ss.loginActionBtn} onPress={handleRegisterSetPassword} disabled={busy}><Text style={ss.loginActionText}>{busy ? '设置中...' : '下一步'}</Text></TouchableOpacity><TouchableOpacity onPress={() => { setShowLogin(false); refreshState(); }}><Text style={ss.loginCancel}>跳过</Text></TouchableOpacity></>)
        : loginMode === 'register_set_name' ? (<><Text style={ss.loginTitle}>设置用户名</Text><TextInput style={ss.loginInput} placeholder="你的昵称" placeholderTextColor="#B2BEC3" value={editNickname} onChangeText={setEditNickname} autoFocus returnKeyType="done" onSubmitEditing={handleRegisterSetName} /><TouchableOpacity style={ss.loginActionBtn} onPress={handleRegisterSetName} disabled={busy}><Text style={ss.loginActionText}>完成</Text></TouchableOpacity></>)
        : (<><Text style={ss.loginTitle}>登录</Text><TextInput style={ss.loginInput} placeholder="邮箱" placeholderTextColor="#B2BEC3" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" value={email} onChangeText={setEmail} /><TextInput style={ss.loginInput} placeholder="密码" placeholderTextColor="#B2BEC3" secureTextEntry autoCapitalize="none" autoComplete="password" textContentType="password" value={password} onChangeText={setPassword} /><TouchableOpacity style={ss.loginActionBtn} onPress={handlePasswordLogin} disabled={busy}><Text style={ss.loginActionText}>{busy ? '登录中...' : '登录'}</Text></TouchableOpacity><View style={ss.loginLinks}><TouchableOpacity onPress={() => { setLoginMode('email_otp'); setStep('email'); setEmail(''); }}><Text style={ss.backToPhone}>验证码登录</Text></TouchableOpacity><TouchableOpacity onPress={() => Alert.alert('忘记密码', '将通过验证码验证身份后重置密码', [{ text: '发送验证码', onPress: () => { setOtpForReset(true); setLoginMode('email_otp'); setStep('email'); } }, { text: '取消', style: 'cancel' }])}><Text style={[ss.backToPhone, { color: '#E8A0BF' }]}>忘记密码</Text></TouchableOpacity><TouchableOpacity onPress={() => { setLoginMode('email_otp'); setStep('email'); setEmail(''); setOtp(''); Alert.alert('注册新账号','将通过验证码验证邮箱，然后设置密码和用户名'); }}><Text style={ss.backToPhone}>注册新账号</Text></TouchableOpacity></View><TouchableOpacity onPress={() => setShowLogin(false)}><Text style={ss.loginCancel}>取消</Text></TouchableOpacity></>)}
      </View></KeyboardAvoidingView></View>)}

      <Modal visible={showEditNickname} transparent animationType="fade"><TouchableOpacity style={ss.loginOverlay} activeOpacity={1} onPress={() => setShowEditNickname(false)}><View style={ss.loginModal}><Text style={ss.loginTitle}>编辑用户名</Text><TextInput style={ss.loginInput} placeholder="最多12个中文或24个英文" placeholderTextColor="#B2BEC3" value={editNickname} onChangeText={setEditNickname} maxLength={24} autoFocus returnKeyType="done" onSubmitEditing={handleSaveNickname} /><View style={{ flexDirection: 'row', gap: 12 }}><TouchableOpacity style={[ss.loginActionBtn, { flex: 1, backgroundColor: '#B2BEC3' }]} onPress={() => setShowEditNickname(false)}><Text style={ss.loginActionText}>取消</Text></TouchableOpacity><TouchableOpacity style={[ss.loginActionBtn, { flex: 1 }]} onPress={handleSaveNickname}><Text style={ss.loginActionText}>保存</Text></TouchableOpacity></View></View></TouchableOpacity></Modal>
      <Modal visible={showAvatarPicker} transparent animationType="fade"><TouchableOpacity style={ss.loginOverlay} activeOpacity={1} onPress={() => setShowAvatarPicker(false)}><View style={ss.loginModal}><Text style={ss.loginTitle}>选择头像</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>{AVATARS.map(emoji => <TouchableOpacity key={emoji} onPress={() => handleSetAvatar(emoji)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 14 }}><Text style={{ fontSize: 28 }}>{emoji}</Text></TouchableOpacity>)}</View><TouchableOpacity onPress={handleUploadAvatar} style={{ marginTop: 16, backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}><Text style={{ fontSize: 14, fontWeight: '600', color: '#2D3436' }}>上传照片</Text></TouchableOpacity><TouchableOpacity onPress={() => setShowAvatarPicker(false)} style={{ marginTop: 8 }}><Text style={ss.loginCancel}>取消</Text></TouchableOpacity></View></TouchableOpacity></Modal>
      <Modal visible={showChangePassword} transparent animationType="fade"><TouchableOpacity style={ss.loginOverlay} activeOpacity={1} onPress={() => setShowChangePassword(false)}><View style={ss.loginModal}><Text style={ss.loginTitle}>修改密码</Text><TextInput style={ss.loginInput} placeholder="新密码（至少6位）" placeholderTextColor="#B2BEC3" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" value={newPassword} onChangeText={setNewPassword} /><TextInput style={ss.loginInput} placeholder="确认新密码" placeholderTextColor="#B2BEC3" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" value={newPasswordConfirm} onChangeText={setNewPasswordConfirm} /><View style={{ flexDirection: 'row', gap: 12 }}><TouchableOpacity style={[ss.loginActionBtn, { flex: 1, backgroundColor: '#B2BEC3' }]} onPress={() => setShowChangePassword(false)}><Text style={ss.loginActionText}>取消</Text></TouchableOpacity><TouchableOpacity style={[ss.loginActionBtn, { flex: 1 }]} onPress={handleChangePassword} disabled={busy}><Text style={ss.loginActionText}>{busy ? '保存中...' : '保存'}</Text></TouchableOpacity></View></View></TouchableOpacity></Modal>
    </View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8ECF1' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 12, borderRadius: 32, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.55)' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 20, color: '#2D3436', fontWeight: '600' }, headerLabel: { fontSize: 17, fontWeight: '700', color: '#2D3436' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#7A8A9E', letterSpacing: 1 },
  sectionCard: { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, padding: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  userAvatar: { fontSize: 36 }, userName: { fontSize: 17, fontWeight: '700', color: '#2D3436' }, userEmail: { fontSize: 12, color: '#7A8A9E' },
  smallBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }, smallBtnText: { fontSize: 16 },
  accountMetaBox: { backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 12, padding: 12, marginTop: 12, gap: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: { fontSize: 13, fontWeight: '600', color: '#636E72' },
  metaOk: { fontSize: 12, fontWeight: '600', color: '#27AE60' }, metaLink: { fontSize: 12, fontWeight: '600', color: '#7A8A9E' }, metaWarn: { fontSize: 12, fontWeight: '600', color: '#F39C12' },
  loginBtn: { backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 14, padding: 14, alignItems: 'center' },
  loginBtnText: { fontSize: 16, fontWeight: '700', color: '#2D3436' }, loginHint: { fontSize: 12, color: '#7A8A9E', marginTop: 2 },
  smallLabel: { fontSize: 11, fontWeight: '600', color: '#7A8A9E', marginBottom: 8, letterSpacing: 0.5 },
  acctRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  acctIcon: { fontSize: 24 }, acctName: { fontSize: 14, fontWeight: '600', color: '#2D3436' }, acctEmail: { fontSize: 11, color: '#7A8A9E' }, acctDel: { fontSize: 16, padding: 4 },
  joinCard: { backgroundColor: 'rgba(110,181,255,0.08)', borderRadius: 14, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#6EB5FF33' },
  joinRow: { flexDirection: 'row', gap: 8 },
  joinInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#2D3436', fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
  joinBtn: { backgroundColor: '#6EB5FF', borderRadius: 12, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  joinBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' }, joinHint: { fontSize: 11, color: '#7A8A9E', marginTop: 8, textAlign: 'center' },
  hintCard: { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 10 },
  hintText: { fontSize: 13, color: '#7A8A9E' },
  sharedListItem: { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  sharedListItemCouple: { borderColor: '#E8A0BF44', borderWidth: 2, backgroundColor: '#FEF5F7' },
  sharedListHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sharedListIcon: { fontSize: 20 }, sharedListTitle: { fontSize: 15, fontWeight: '700', color: '#2D3436', flexShrink: 1 },
  coupleTag: { fontSize: 14 },
  memberCountBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }, memberCountText: { fontSize: 11, fontWeight: '600' },
  manageBtn: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }, manageBtnText: { fontSize: 12, fontWeight: '600' },
  sharedMemberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  memberAvatarChip: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  memberNames: { fontSize: 11, color: '#7A8A9E', marginLeft: 6, flexShrink: 1 },
  sharedActivity: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  activityText: { fontSize: 11, color: '#636E72', flex: 1 }, activityTime: { fontSize: 10, color: '#B2BEC3' },
  noActivity: { fontSize: 11, color: '#B2BEC3', fontStyle: 'italic', paddingVertical: 2 },
  unshareTouch: { alignSelf: 'flex-end', marginTop: 6 }, unshareText: { fontSize: 11, fontWeight: '600', color: '#FF6B6B' },
  securityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  toggleOn: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#34C759', justifyContent: 'center', paddingHorizontal: 2 },
  toggleOff: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#D1D1D6', justifyContent: 'center', paddingHorizontal: 2 },
  toggleThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF', alignSelf: 'flex-start' }, toggleThumbOn: { alignSelf: 'flex-end' },
  toggleHint: { fontSize: 11, color: '#7A8A9E', marginTop: 4 },
  aboutCard: { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, padding: 16, alignItems: 'center' },
  aboutText: { fontSize: 14, color: '#636E72', fontWeight: '500' }, aboutSub: { fontSize: 12, color: '#7A8A9E', marginTop: 2 },
  exitBtn: { marginTop: 32, marginBottom: 20, backgroundColor: '#FFF0F0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FFE0E0' },
  exitText: { fontSize: 15, fontWeight: '600', color: '#FF6B6B' },
  loginOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  loginModal: { backgroundColor: '#F5F0EB', borderRadius: 24, padding: 28, width: 320, alignItems: 'center' },
  loginTitle: { fontSize: 20, fontWeight: '800', color: '#2D3436', marginBottom: 20 },
  loginInput: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: 14, fontSize: 16, color: '#2D3436', width: '100%', textAlign: 'center', marginBottom: 10 },
  phoneHint: { fontSize: 12, color: '#7A8A9E', marginBottom: 12, textAlign: 'center' },
  loginActionBtn: { backgroundColor: '#2D3436', borderRadius: 12, paddingVertical: 14, width: '100%', alignItems: 'center', marginBottom: 10 },
  loginActionText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  loginLinks: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  backToPhone: { fontSize: 13, color: '#636E72' }, loginCancel: { fontSize: 14, color: '#7A8A9E', marginTop: 8, fontWeight: '500' },
  acctCard: { width: '100%', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 12, padding: 14, marginBottom: 8, alignItems: 'center' },
  acctNameBold: { fontSize: 16, fontWeight: '700', color: '#2D3436' }, acctEmailSm: { fontSize: 12, color: '#7A8A9E', marginTop: 2 },
});