import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  LayoutAnimation,
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
import * as Haptics from 'expo-haptics';
import {
  initDatabase,
  getAllLists,
  createList,
  createSharedList,
  deleteList,
  bulkInsertItems,
  getItemCount,
  getCompletedCount,
  updateListTitle,
  migrateOfflineData,
  getOrphanLists,
  deleteOrphanData,
  GoodList,
} from '../services/database';
import { getCurrentUserId } from '../services/auth';
import { TEMPLATES, TEMPLATE_LIST } from '../services/templates';
import { getMySharedLists } from '../services/couple';

const { width: SW, height: SH } = Dimensions.get('window');

const ORBS = [
  { size: 180, color: '#FFB3BA', startX: 0.1, startY: 0.05, durX: 25000, durY: 32000 },
  { size: 140, color: '#BAE1FF', startX: 0.85, startY: 0.55, durX: 30000, durY: 27000 },
  { size: 200, color: '#D4EDDA', startX: 0.5, startY: 0.85, durX: 28000, durY: 35000 },
  { size: 120, color: '#FFD6A5', startX: 0.2, startY: 0.7, durX: 32000, durY: 24000 },
];

function FloatingOrb({ size, color, startX, startY, durX, durY }: typeof ORBS[number]) {
  const posX = useRef(new Animated.Value(startX * SW)).current;
  const posY = useRef(new Animated.Value(startY * SH)).current;
  useEffect(() => {
    const loopX = () => {
      const toVal = (Math.random() * 0.7 + 0.15) * SW;
      Animated.timing(posX, { toValue: toVal, duration: durX + Math.random() * 10000, useNativeDriver: true }).start(() => loopX());
    };
    const loopY = () => {
      const toVal = (Math.random() * 0.7 + 0.1) * SH;
      Animated.timing(posY, { toValue: toVal, duration: durY + Math.random() * 10000, useNativeDriver: true }).start(() => loopY());
    };
    loopX();
    loopY();
  }, []);
  return (
    <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.45, transform: [{ translateX: posX }, { translateY: posY }] }} />
  );
}

export interface CardLayout { x: number; y: number; width: number; height: number; }

interface Props {
  refreshKey: number;
  onSelectList: (listId: string, cardLayout: CardLayout, isShared?: boolean) => void;
  onGoSettings: () => void;
  onShareList?: (list: GoodList) => void;
  onOpenSharing?: (listId: string) => void;
  onOpenTimeline?: (listId: string, title: string, icon: string) => void;
}

export default function ListHomeScreen({ refreshKey, onSelectList, onGoSettings, onShareList, onOpenSharing, onOpenTimeline }: Props) {
  const [lists, setLists] = useState<GoodList[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [completedCounts, setCompletedCounts] = useState<Record<string, number>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('love');
  const [selectedLimit, setSelectedLimit] = useState(100);
  const [menuListId, setMenuListId] = useState<string | null>(null);
  const [showEditTitle, setShowEditTitle] = useState(false);
  const [editListTitle, setEditListTitle] = useState('');
  const editingListId = useRef('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingScale = useRef(new Animated.Value(1)).current;
  const deletingOpacity = useRef(new Animated.Value(1)).current;

  const cardLayouts = useRef<Record<string, CardLayout>>({});

  const loadLists = useCallback(async () => {
    const uid = await getCurrentUserId();
    if (uid) {
      const orphans = await getOrphanLists();
      if (orphans.length > 0) {
        Alert.alert('发现未归属数据', `你有 ${orphans.length} 个未登录时创建的清单。是否合并到当前账号？`, [
          { text: '删除', style: 'destructive', onPress: async () => { await deleteOrphanData(); await loadLists(); } },
          { text: '合并', onPress: async () => { await migrateOfflineData(uid); await loadLists(); } },
        ]);
        setLoading(false);
        return;
      }
      const data = await getAllLists(uid);
      setLists(data);
      const counts: Record<string, number> = {};
      const doneCounts: Record<string, number> = {};
      for (const l of data) { counts[l.id] = await getItemCount(l.id); doneCounts[l.id] = await getCompletedCount(l.id); }
      setItemCounts(counts);
      setCompletedCounts(doneCounts);

      // 兜底：从Supabase同步共享清单，补齐本地缺失的（解决重登后清单消失）
      try {
        const summaries = await getMySharedLists(uid);
        const localIds = new Set(data.map(l => l.id));
        for (const s of summaries) {
          if (!localIds.has(s.listId)) {
            await createSharedList(s.listId, s.title, s.themeType, s.iconEmoji, '', 100, uid);
          }
        }
        // 补齐后重新拉一次以包含新写入的清单
        const refreshed = await getAllLists(uid);
        if (refreshed.length !== data.length) {
          setLists(refreshed);
          for (const l of refreshed) { counts[l.id] = await getItemCount(l.id); doneCounts[l.id] = await getCompletedCount(l.id); }
          setItemCounts({ ...counts });
          setCompletedCounts({ ...doneCounts });
        }
      } catch {}
    } else {
      const data = await getOrphanLists();
      setLists(data);
      const counts: Record<string, number> = {};
      const doneCounts: Record<string, number> = {};
      for (const l of data) { counts[l.id] = await getItemCount(l.id); doneCounts[l.id] = await getCompletedCount(l.id); }
      setItemCounts(counts);
      setCompletedCounts(doneCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    initDatabase().then(() => loadLists());
  }, [loadLists, refreshKey]);

  const handleCreate = async () => {
    const tpl = TEMPLATES[selectedTemplate];
    const id = `list_${Date.now()}`;
    const tplTitle = TEMPLATE_LIST.find((t) => t.key === selectedTemplate)?.title || '新建清单';
    const title = newTitle.trim() || tplTitle.replace(/[\u3000]/g, '').trim();
    const uid = await getCurrentUserId();
    await createList(id, title, tpl.themeType, tpl.iconEmoji, tpl.coverColor, selectedLimit, uid || undefined);
    if (tpl.items.length > 0) { await bulkInsertItems(id, tpl.items.slice(0, selectedLimit)); }
    setShowCreate(false); setNewTitle('');
    await loadLists();
  };

  const handleDelete = (item: GoodList) => {
    setMenuListId(null);
    Alert.alert('删除清单', `确定要删除「${item.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        setDeletingId(item.id);
        deletingScale.setValue(1); deletingOpacity.setValue(1);
        Animated.parallel([Animated.spring(deletingScale, { toValue: 0.6, friction: 7, tension: 40, useNativeDriver: true }), Animated.timing(deletingOpacity, { toValue: 0, duration: 280, useNativeDriver: true })]).start(() => {
          LayoutAnimation.configureNext(LayoutAnimation.create(600, LayoutAnimation.Types.spring, LayoutAnimation.Properties.scaleXY));
          setLists(prev => prev.filter(l => l.id !== item.id));
          setDeletingId(null);
          deleteList(item.id);
        });
      }},
    ]);
  };

  const handleOpenEditTitle = (item: GoodList) => { setMenuListId(null); editingListId.current = item.id; setEditListTitle(item.title); setShowEditTitle(true); };
  const handleSaveEditTitle = async () => {
    const id = editingListId.current; const title = editListTitle.trim();
    if (!title || !id) { setShowEditTitle(false); return; }
    await updateListTitle(id, title); setShowEditTitle(false); await loadLists();
  };

  if (loading) return <View style={s.loading}><ActivityIndicator size="large" color="#9BA4B5" /></View>;

  const allLists = [...lists];

  return (
    <View style={s.root}>
      {ORBS.map((orb, i) => <FloatingOrb key={i} {...orb} />)}
      <View style={s.safeArea}>
        <BlurView intensity={60} tint="light" style={s.header}>
          <Text style={s.headerGreeting}>{allLists.length === 0 ? '创建你的第一个清单 ✨' : `${allLists.length} 个清单`}</Text>
          <TouchableOpacity style={s.settingsBtn} onPress={onGoSettings}><Text style={s.settingsIcon}>⚙️</Text></TouchableOpacity>
        </BlurView>
        <ScrollView style={s.scrollArea} contentContainerStyle={s.gridScrollContent} showsVerticalScrollIndicator={false}>
          {allLists.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyEmoji}>📋</Text><Text style={s.emptyText}>还没有清单</Text></View>
          ) : (
            <View style={s.gridContainer}>
              {lists.map((item) => {
                const total = itemCounts[item.id] || 0; const done = completedCounts[item.id] || 0;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const layout = cardLayouts.current[item.id] || { x: 16, y: 140, width: SW * 0.42, height: 145 };
                return (
                  <TouchableOpacity key={item.id} style={[s.card, { backgroundColor: item.coverColor + '88' }]} activeOpacity={0.7}
                    onLayout={(e) => { const { x, y, width, height } = e.nativeEvent.layout; cardLayouts.current[item.id] = { x: 16 + x, y: 120 + y, width, height }; }}
                    onPress={() => onSelectList(item.id, layout, !!item.isShared)}
                    onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setMenuListId(item.id); }}
                  >
                    {deletingId === item.id ? (
                      <Animated.View style={{ opacity: deletingOpacity, transform: [{ scale: deletingScale }] }}>
                        <Text style={s.cardIcon}>{item.iconEmoji}</Text><Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={s.cardProgressBar}><View style={[s.cardProgressFill, { width: `${Math.min(pct, 100)}%` }]} /></View>
                        <Text style={s.cardCount}>{done}/{total} · {pct}%</Text>
                      </Animated.View>
                    ) : (
                      <>
                        {item.isShared ? <View style={s.sharedTag}><Text style={s.sharedTagText}>共享</Text></View> : null}
                        <Text style={s.cardIcon}>{item.iconEmoji}</Text><Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={s.cardProgressBar}><View style={[s.cardProgressFill, { width: `${Math.min(pct, 100)}%` }]} /></View>
                        <Text style={s.cardCount}>{done}/{total} · {pct}%</Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
        {menuListId && (() => {
          const menuItem = lists.find(l => l.id === menuListId); if (!menuItem) { setMenuListId(null); return null; }
          return (
            <TouchableOpacity style={s.menuBackdrop} activeOpacity={1} onPress={() => setMenuListId(null)}>
              <View style={s.menuCard}>
                <Text style={s.menuTitle} numberOfLines={1}>{menuItem.iconEmoji} {menuItem.title}</Text>
                <View style={s.menuSepH} />
                {onOpenSharing && (<><TouchableOpacity style={s.menuAction} onPress={() => { setMenuListId(null); if (typeof onOpenSharing === 'function') onOpenSharing(menuItem.id); }}><Text style={s.menuActionIcon}>👥</Text><Text style={s.menuActionLabel}>共享管理</Text></TouchableOpacity><View style={s.menuSepH} /></>)}
                <TouchableOpacity style={s.menuAction} onPress={() => handleOpenEditTitle(menuItem)}><Text style={s.menuActionIcon}>✏️</Text><Text style={s.menuActionLabel}>编辑名称</Text></TouchableOpacity>
                <View style={s.menuSepH} />
                {onShareList && (<><TouchableOpacity style={s.menuAction} onPress={() => { setMenuListId(null); onShareList(menuItem); }}><Text style={s.menuActionIcon}>📤</Text><Text style={s.menuActionLabel}>分享清单</Text></TouchableOpacity><View style={s.menuSepH} /></>)}
                <TouchableOpacity style={s.menuAction} onPress={() => handleDelete(menuItem)}><Text style={s.menuActionIcon}>🗑</Text><Text style={[s.menuActionLabel, { color: '#FF3B30' }]}>删除</Text></TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })()}
        <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)}><Text style={s.fabText}>+</Text></TouchableOpacity>
      </View>
      <Modal visible={showEditTitle} animationType="fade" transparent>
        <TouchableOpacity style={s.menuBackdrop} activeOpacity={1} onPress={() => setShowEditTitle(false)}>
          <View style={s.menuCard}><Text style={s.menuTitle}>编辑清单名称</Text>
            <TextInput style={s.input} value={editListTitle} onChangeText={setEditListTitle} placeholder="清单名称" placeholderTextColor="#B2BEC3" autoFocus returnKeyType="done" onSubmitEditing={handleSaveEditTitle} />
            <View style={s.modalBtnRow}><TouchableOpacity style={s.cancelBtn} onPress={() => setShowEditTitle(false)}><Text style={s.cancelBtnText}>取消</Text></TouchableOpacity><TouchableOpacity style={s.createBtn} onPress={handleSaveEditTitle}><Text style={s.createBtnText}>保存</Text></TouchableOpacity></View>
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}><Text style={s.modalTitle}>新建清单</Text>
            <TextInput style={s.input} placeholder="清单名称（可选）" placeholderTextColor="#B2BEC3" value={newTitle} onChangeText={setNewTitle} />
            <Text style={s.sectionLabel}>选择主题模板</Text>
            <View style={s.templateGrid}>{TEMPLATE_LIST.map((t) => (<TouchableOpacity key={t.key} style={[s.templateItem, selectedTemplate === t.key && s.templateItemSelected]} onPress={() => setSelectedTemplate(t.key)}><Text style={s.templateIcon}>{t.icon}</Text><Text style={s.templateName}>{t.title}</Text></TouchableOpacity>))}</View>
            <Text style={s.sectionLabel}>数量上限</Text>
            <View style={s.limitRow}>{[10, 50, 100].map((n) => (<TouchableOpacity key={n} style={[s.limitBtn, selectedLimit === n && s.limitBtnSelected]} onPress={() => setSelectedLimit(n)}><Text style={[s.limitText, selectedLimit === n && s.limitTextSelected]}>{n}</Text></TouchableOpacity>))}</View>
            <View style={s.modalBtnRow}><TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}><Text style={s.cancelBtnText}>取消</Text></TouchableOpacity><TouchableOpacity style={s.createBtn} onPress={handleCreate}><Text style={s.createBtnText}>创建</Text></TouchableOpacity></View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8ECF1' },
  loading: { flex: 1, backgroundColor: '#E8ECF1', alignItems: 'center', justifyContent: 'center' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, marginHorizontal: 12, marginBottom: 6, borderRadius: 32, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.55)' },
  headerGreeting: { fontSize: 15, color: '#636E72', fontWeight: '600' },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(45,52,54,0.06)', alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { fontSize: 20 },
  scrollArea: { flex: 1 }, gridScrollContent: { paddingHorizontal: 12, paddingBottom: 100, paddingTop: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 120, gap: 8 },
  emptyEmoji: { fontSize: 48 }, emptyText: { fontSize: 18, fontWeight: '600', color: '#636E72' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: (SW - 44) / 2, borderRadius: 22, padding: 16, minHeight: 145, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', shadowColor: '#4A5568', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  cardIcon: { fontSize: 30, marginBottom: 4 }, cardTitle: { fontSize: 15, fontWeight: '700', color: '#2D3436', flex: 1 },
  cardProgressBar: { height: 3, backgroundColor: 'rgba(45,52,54,0.08)', borderRadius: 1.5, marginTop: 8, overflow: 'hidden' },
  cardProgressFill: { height: '100%', backgroundColor: 'rgba(45,52,54,0.4)', borderRadius: 1.5 },
  cardCount: { fontSize: 12, color: '#7A8A9E', marginTop: 4, fontWeight: '600' },
  sharedTag: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: '#E8A0BF88' },
  sharedTagText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  fab: { position: 'absolute', bottom: 30, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2D3436', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6 },
  fabText: { fontSize: 30, color: '#FFF', marginTop: -2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#F5F0EB', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#2D3436', marginBottom: 16 },
  input: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 14, padding: 14, fontSize: 16, color: '#2D3436', marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#636E72', marginBottom: 8 },
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  templateItem: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.6)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  templateItemSelected: { backgroundColor: '#2D343618', borderWidth: 1, borderColor: '#2D343630' },
  templateIcon: { fontSize: 18 }, templateName: { fontSize: 13, fontWeight: '600', color: '#2D3436' },
  limitRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  limitBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center' },
  limitBtnSelected: { backgroundColor: '#2D3436' },
  limitText: { fontSize: 15, fontWeight: '600', color: '#636E72' }, limitTextSelected: { color: '#FFF' },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#636E72' },
  createBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#2D3436', alignItems: 'center' },
  createBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  menuCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, width: SW - 60, maxWidth: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 12 },
  menuTitle: { fontSize: 18, fontWeight: '700', color: '#2D3436', marginBottom: 16 },
  menuSepH: { height: 1, backgroundColor: 'rgba(45,52,54,0.08)', marginVertical: 8 },
  menuAction: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  menuActionIcon: { fontSize: 18, marginRight: 12 }, menuActionLabel: { fontSize: 16, fontWeight: '600', color: '#2D3436' },
});