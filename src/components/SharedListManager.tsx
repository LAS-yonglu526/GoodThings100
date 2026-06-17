import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  generateListInvite,
  getListMembers,
  removeMemberFromList,
  leaveList,
  initListSharing,
  toggleCoupleTag,
  ListMember,
} from '../services/couple';
import { getCurrentUserId } from '../services/auth';
import { getItemsByList, getAllLists } from '../services/database';

interface Props {
  listId: string;
  onBack: () => void;
}

export default function SharedListManager({ listId, onBack }: Props) {
  const [members, setMembers] = useState<ListMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coupleMode, setCoupleMode] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const uid = await getCurrentUserId();
    setMyUid(uid);
    if (!uid) { setLoading(false); return; }
    const list = await getListMembers(listId);
    setMembers(list);
    setIsOwner(list.some(m => m.userId === uid && m.role === 'owner'));
    setCoupleMode(list.some(m => m.coupleTag === true));
    setLoading(false);
  }, [listId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleEnableSharing = async () => {
    const uid = await getCurrentUserId();
    if (!uid) { Alert.alert('请先登录'); return; }
    const lists = await getAllLists(uid);
    const list = lists.find(l => l.id === listId);
    if (!list) { Alert.alert('清单不存在'); return; }
    const items = await getItemsByList(listId);

    setBusy(true);
    const { error } = await initListSharing(
      listId, uid, list.title, list.themeType, list.iconEmoji, list.coverColor,
      list.itemLimit, items.map(i => ({ id: i.id, title: i.title })), list.createdAt,
    );
    setBusy(false);
    if (error) { Alert.alert('开启失败', error); return; }

    const { code, error: codeErr } = await generateListInvite(listId, uid);
    if (codeErr) { Alert.alert('生成失败', codeErr); return; }
    setInviteCode(code || '');
    setShowInvitePanel(true);
    await loadMembers();
  };

  const handleNewInvite = async () => {
    const uid = await getCurrentUserId();
    if (!uid) return;
    setBusy(true);
    const { code, error } = await generateListInvite(listId, uid);
    setBusy(false);
    if (error) { Alert.alert('失败', error); return; }
    setInviteCode(code || '');
    setShowInvitePanel(true);
  };

  const handleRemoveMember = (member: ListMember) => {
    if (!isOwner) return;
    Alert.alert('移除成员', `确定移除 ${member.nickname || member.userId}？`, [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: async () => {
        if (!myUid) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        const { error } = await removeMemberFromList(listId, member.userId, myUid);
        if (error) { Alert.alert('失败', error); return; }
        await loadMembers();
      }},
    ]);
  };

  const handleLeave = () => {
    Alert.alert('退出清单', '确定退出此共享清单？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: async () => {
        if (!myUid) return;
        const { error } = await leaveList(listId, myUid);
        if (error) { Alert.alert('失败', error); return; }
        onBack();
      }},
    ]);
  };

  const handleToggleCouple = async (val: boolean) => {
    if (!myUid) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCoupleMode(val);
    const { error } = await toggleCoupleTag(listId, myUid, val);
    if (error) { Alert.alert('失败', error); setCoupleMode(!val); }
  };

  const hasMembers = members.length > 0;
  const themeColor = coupleMode ? '#E8A0BF' : '#6EB5FF';

  if (loading) return <View style={s.ld}><ActivityIndicator size="large" color="#9BA4B5" /></View>;

  return (
    <View style={s.root}>
      <BlurView intensity={60} tint="light" style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.bb}><Text style={s.bt}>←</Text></TouchableOpacity>
        <Text style={s.ht}>{coupleMode ? '💕 伴侣清单' : '👥 共享清单'}</Text>
        <View style={s.bb} />
      </BlurView>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* 成员列表 */}
        <Text style={s.sectionTitle}>成员{hasMembers ? ` (${members.length})` : ''}</Text>
        <View style={[s.memberCard, coupleMode && s.coupleCard]}>
          {!hasMembers ? (
            <Text style={s.emptyText}>暂未启用共享</Text>
          ) : (
            members.map(m => (
              <View key={m.userId} style={s.memberRow}>
                <Text style={s.memberAvatar}>{m.avatarEmoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.memberName}>{m.nickname || '用户'}</Text>
                  <Text style={[s.memberRole, { color: m.role === 'owner' ? '#F39C12' : themeColor }]}>
                    {m.role === 'owner' ? '👑 群主' : '成员'}
                  </Text>
                </View>
                {isOwner && m.userId !== myUid && (
                  <TouchableOpacity onPress={() => handleRemoveMember(m)} style={s.removeBtn}>
                    <Text style={s.removeText}>移除</Text>
                  </TouchableOpacity>
                )}
                {!isOwner && m.userId === myUid && (
                  <TouchableOpacity onPress={handleLeave} style={s.leaveBtn}>
                    <Text style={s.leaveText}>退出</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* 已启用：邀请码 + 情侣视觉开关 */}
        {hasMembers && isOwner && (
          <>
            <TouchableOpacity style={[s.btn, { backgroundColor: themeColor }]} onPress={handleNewInvite} disabled={busy}>
              <Text style={s.btnText}>🔗 生成新邀请码</Text>
            </TouchableOpacity>

            <View style={[s.switchCard, coupleMode && s.switchCardCouple]}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchLabel}>💕 专属视觉标识</Text>
                <Text style={s.switchHint}>开启后清单卡片显示专属视觉标识</Text>
              </View>
              <Switch
                value={coupleMode}
                onValueChange={handleToggleCouple}
                trackColor={{ false: '#D1D1D6', true: '#E8A0BF88' }}
                thumbColor={coupleMode ? '#E8A0BF' : '#FFF'}
              />
            </View>
          </>
        )}

        {/* 未启用共享：一键开启 */}
        {!hasMembers && (
          <>
            <View style={s.sep} />
            <Text style={s.sectionTitle}>开启共享</Text>
            <TouchableOpacity style={s.enableBtn} onPress={handleEnableSharing} disabled={busy}>
              <Text style={s.enableIcon}>🔗</Text>
              <Text style={s.enableText}>开启共享并生成邀请码</Text>
              <Text style={s.enableHint}>邀请好友或伴侣一起管理这个清单</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={showInvitePanel} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, coupleMode && { borderWidth: 2, borderColor: '#E8A0BF44' }]}>
            <Text style={s.modalTitle}>{coupleMode ? '💕 邀请码' : '🔗 清单邀请码'}</Text>
            <Text style={[s.inviteCodeBig, coupleMode && { color: '#E8A0BF' }]} selectable>{inviteCode}</Text>
            <Text style={s.inviteHint}>长按复制发给对方，15分钟有效</Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: themeColor }]} onPress={() => setShowInvitePanel(false)}>
              <Text style={s.btnText}>完成</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8ECF1', paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  ld: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 12, marginBottom: 12,
    borderRadius: 32, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.55)',
  },
  bb: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  bt: { fontSize: 20, color: '#2D3436', fontWeight: '600' },
  ht: { fontSize: 17, fontWeight: '700', color: '#2D3436' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#7A8A9E', marginBottom: 10, letterSpacing: 1 },
  emptyText: { fontSize: 14, color: '#B2BEC3', fontWeight: '500', textAlign: 'center', paddingVertical: 16 },
  memberCard: { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, padding: 12, marginBottom: 16 },
  coupleCard: { borderWidth: 2, borderColor: '#E8A0BF44' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  memberAvatar: { fontSize: 28 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#2D3436' },
  memberRole: { fontSize: 12, fontWeight: '600' },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,59,48,0.1)' },
  removeText: { fontSize: 12, fontWeight: '600', color: '#FF3B30' },
  leaveBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(45,52,54,0.06)' },
  leaveText: { fontSize: 12, fontWeight: '600', color: '#7A8A9E' },
  sep: { height: 1, backgroundColor: 'rgba(45,52,54,0.08)', marginVertical: 16 },
  enableBtn: { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, padding: 20, alignItems: 'center' },
  enableIcon: { fontSize: 32, marginBottom: 8 },
  enableText: { fontSize: 15, fontWeight: '700', color: '#2D3436', marginBottom: 4 },
  enableHint: { fontSize: 12, color: '#7A8A9E' },
  btn: { borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 12 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // 情侣开关
  switchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 14, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
  },
  switchCardCouple: { borderColor: '#E8A0BF44', backgroundColor: '#FEF5F7' },
  switchLabel: { fontSize: 14, fontWeight: '700', color: '#2D3436' },
  switchHint: { fontSize: 11, color: '#7A8A9E', marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#F5F0EB', borderRadius: 24, padding: 28, width: 320, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#2D3436', marginBottom: 16 },
  inviteCodeBig: { fontSize: 28, fontWeight: '800', color: '#2D3436', letterSpacing: 4, marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  inviteHint: { fontSize: 12, color: '#7A8A9E', marginBottom: 20, textAlign: 'center' },
});