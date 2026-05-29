import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  LayoutAnimation,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  initDatabase, getItemsByList, updateItemStatus, updateItemTitle, deleteItem, addItem, getAllLists, GoodItem, GoodList,
} from '../services/database';
import MemoryModal from '../components/MemoryModal';
import AddItemOverlay from '../components/AddItemOverlay';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SW, height: SH } = Dimensions.get('window');

const ORBS = [
  { size: 140, color: '#FFB3BA', x: 0.1, y: 0.1, dx: 25000, dy: 30000 },
  { size: 110, color: '#BAE1FF', x: 0.85, y: 0.6, dx: 28000, dy: 26000 },
  { size: 160, color: '#D4EDDA', x: 0.55, y: 0.85, dx: 30000, dy: 25000 },
  { size: 90, color: '#FFD6A5', x: 0.25, y: 0.5, dx: 26000, dy: 33000 },
];
function FloatingOrb({ size, color, x, y, dx, dy }: any) {
  const a = useRef(new Animated.ValueXY({ x: x * SW, y: y * SH })).current;
  useEffect(() => {
    const loopX = () => Animated.timing(a, { toValue: { x: (Math.random() * 0.7 + 0.15) * SW, y: (a as any).y._value ?? y * SH }, duration: dx, useNativeDriver: false }).start(() => loopX());
    const loopY = () => Animated.timing(a, { toValue: { x: (a as any).x._value ?? x * SW, y: (Math.random() * 0.7 + 0.1) * SH }, duration: dy, useNativeDriver: false }).start(() => loopY());
    loopX(); loopY();
  }, []);
  return <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.33, transform: [{ translateX: a.x }, { translateY: a.y }] }} />;
}

const JELLY = [
  '#FFE0E5', '#E0EEFF', '#D5F5E3', '#E8E0F0', '#FFE8D6', '#FFF3CD',
  '#D6F0FA', '#FADDE4', '#FEE3D0', '#E0EBE3', '#DCEFF5', '#FDE2E7',
];
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); return Math.abs(h); }

type LayoutMode = 'gallery' | 'fluid';
function getLayoutMode(count: number): LayoutMode { return count <= 15 ? 'gallery' : 'fluid'; }
function getFluidStyles(count: number) {
  const t = Math.min(count, 100);
  const k = Math.pow(t / 100, 0.6);
  const fontSize = 22 - (22 - 11) * k;
  const padV = 14 - (14 - 4) * k;
  const padH = 20 - (20 - 9) * k;
  const gap = 14 - (14 - 3) * k;
  const minH = Math.max(32, padV * 2 + fontSize + 2);
  return { fontSize: Math.round(fontSize * 10) / 10, padV: Math.round(padV), padH: Math.round(padH), gap: Math.round(gap), minH: Math.round(minH) };
}
const GALLERY_STYLES = { fontSize: 18, cardWidth: SW - 44, gap: 12 };

interface Props { listId: string; onBack: () => void; }

export default function ListDetailScreen({ listId, onBack }: Props) {
  const [items, setItems] = useState<GoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GoodItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [listInfo, setListInfo] = useState<GoodList | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showAddOverlay, setShowAddOverlay] = useState(false);

  const dragActive = useRef(false);
  const dragRef = useRef({
    itemId: '', startPageY: 0, targetPageY: 0, itemTitle: '', itemColor: '',
    isGallery: false, fontSz: 18, padH: 16, padV: 10, cardW: 300, minH: 44,
  });
  const dragY = useRef(new Animated.Value(0)).current;
  const [dragVisible, setDragVisible] = useState(false);
  const lastReleaseAt = useRef(0);

  const load = useCallback(async () => {
    const d = await getItemsByList(listId); setItems(d);
    const ls = await getAllLists(); setListInfo(ls.find(l => l.id === listId) || null); setLoading(false);
  }, [listId]);
  useEffect(() => { initDatabase().then(() => load()); }, [load]);

  const animateAndRefresh = async () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); await load(); };

  const press = async (item: GoodItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const s = item.status === 'completed' ? 'pending' : 'completed';
    await updateItemStatus(item.id, listId, s);
    setItems(p => p.map(i => i.id === item.id ? { ...i, status: s, completedAt: s === 'completed' ? new Date().toISOString() : null } : i));
    if (s === 'completed') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const showContextMenu = (item: GoodItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(item.title, '', [
      { text: '编辑', onPress: () => { setEditingId(item.id); setEditText(item.title); } },
      { text: '手记', onPress: () => { setSelectedItem(item); setModalVisible(true); } },
      { text: '删除', style: 'destructive', onPress: async () => { await deleteItem(item.id, listId); await animateAndRefresh(); } },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const itemsRef = useRef<GoodItem[]>([]);
  itemsRef.current = items;

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => {
      // 防抖: 松手后 200ms 内禁止再次捕捉
      if (Date.now() - lastReleaseAt.current < 200) return false;
      return true;
    },
    onMoveShouldSetPanResponder: (_, gs) => {
      if (dragActive.current) return true;
      if (Math.abs(gs.dy) > 10 || Math.abs(gs.dx) > 10) return false;
      return true;
    },
    onPanResponderGrant: (e) => {
      const pageY = e.nativeEvent.pageY;
      const cur = itemsRef.current;
      const mode = getLayoutMode(cur.length);
      const fs = mode === 'fluid' ? getFluidStyles(cur.length) : null;

      // 估算触摸的是哪个胶囊
      const cardH = mode === 'gallery' ? 60 : ((fs?.minH || 32) + (fs?.gap || 4));
      const idx = Math.floor((pageY - 120) / cardH);
      const item = cur[Math.max(0, Math.min(cur.length - 1, idx))];
      if (!item) return;

      const col = JELLY[hash(item.title) % JELLY.length];

      // 将当前布局参数完整存入 dragRef
      dragRef.current = {
        itemId: item.id,
        startPageY: pageY,
        targetPageY: pageY,
        itemTitle: item.title,
        itemColor: col,
        isGallery: mode === 'gallery',
        fontSz: mode === 'gallery' ? GALLERY_STYLES.fontSize : fs!.fontSize,
        padH: mode === 'gallery' ? 20 : fs!.padH,
        padV: mode === 'gallery' ? 14 : fs!.padV,
        cardW: mode === 'gallery' ? GALLERY_STYLES.cardWidth : 0,
        minH: mode === 'gallery' ? 48 : fs!.minH,
      };
      dragY.setValue(0);
    },
    onPanResponderMove: (_, gs) => {
      if (!dragActive.current) {
        // 位移极小 且 按住超过 500ms → 激活拖拽
        if (Math.abs(gs.dy) < 5 && Math.abs(gs.dx) < 5 && Date.now() - (dragRef as any)._grantTime > 500) {
          dragActive.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setDragVisible(true);
        }
        return;
      }
      dragY.setValue(gs.dy);
      // 更新 targetPageY 用于松手计算
      dragRef.current.targetPageY = dragRef.current.startPageY + gs.dy;
    },
    onPanResponderRelease: (_, gs) => {
      lastReleaseAt.current = Date.now();
      if (!dragActive.current) {
        // 轻触 → 如果位移极小，触发 press
        if (Math.abs(gs.dy) < 5 && Math.abs(gs.dx) < 5) {
          const ref = dragRef.current;
          const cur = itemsRef.current;
          const item = cur.find(i => i?.id === ref.itemId);
          if (item) {
            // 区分短按/长按（按 duration）
            const dt = Date.now() - ((dragRef as any)._grantTime || 0);
            if (dt >= 400) showContextMenu(item);
            else press(item);
          }
        }
        return;
      }
      dragActive.current = false;
      setDragVisible(false);
      const ref = dragRef.current;
      const cur = itemsRef.current;
      if (cur.length < 2) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); return; }
      const mode = getLayoutMode(cur.length);
      const fs = mode === 'fluid' ? getFluidStyles(cur.length) : null;
      const cardH = mode === 'gallery' ? 60 : ((fs?.minH || 32) + (fs?.gap || 4));
      const targetIdx = Math.floor((ref.targetPageY - 120) / cardH);
      const clamped = Math.max(0, Math.min(cur.length - 1, targetIdx));
      const srcIdx = cur.findIndex(i => i?.id === ref.itemId);
      if (srcIdx === -1 || clamped === srcIdx) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); return; }
      const next = [...cur];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(clamped, 0, moved);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
      setItems(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dragY.setValue(0);
    },
  })).current;

  // 记录 Grant 时间
  (panResponder as any).panHandlers = {
    ...panResponder.panHandlers,
  };

  const handleAddItem = async (text: string) => {
    if (items.length >= 100) { Alert.alert('已达上限'); return; }
    await addItem(listId, text.trim()); await animateAndRefresh();
  };

  const onSave = async () => { setModalVisible(false); setSelectedItem(null); await animateAndRefresh(); };
  const onClose = () => { setModalVisible(false); setSelectedItem(null); };

  if (loading) return <View style={st.ld}><ActivityIndicator size="large" color="#9BA4B5" /></View>;

  const done = items.filter(i => i && i.status === 'completed').length;
  const mode = getLayoutMode(items.length);
  const f = mode === 'fluid' ? getFluidStyles(items.length) : null;

  return (
    <View style={st.r} {...panResponder.panHandlers} onTouchStart={() => {
      (dragRef as any)._grantTime = Date.now();
    }}>
      {ORBS.map((o, i) => <FloatingOrb key={i} {...o} />)}
      <View style={st.s}>
        <BlurView intensity={70} tint="light" style={st.h}>
          <TouchableOpacity onPress={onBack} style={st.bb}><Text style={st.bt}>←</Text></TouchableOpacity>
          <View style={st.hc}><Text style={st.ht} numberOfLines={1}>{listInfo?.iconEmoji} {listInfo?.title}</Text></View>
          <View style={st.bb} />
        </BlurView>
        <View style={st.pb}><View style={[st.pf, { width: `${items.length ? (done / items.length) * 100 : 0}%` }]} /></View>
        <Text style={st.pt}>{done}/{items.length}</Text>
        <ScrollView style={st.sc} scrollEnabled={!dragActive.current} contentContainerStyle={mode === 'gallery' ? st.galleryContainer : { ...st.fluidContainer, gap: f!.gap }} showsVerticalScrollIndicator={false}>
          {items.map(item => {
            if (!item) return null;
            if (editingId === item.id) return <View key={item.id} style={st.e}><TextInput style={st.ei} value={editText} onChangeText={setEditText} autoFocus onBlur={async () => { if (editText.trim()) { await updateItemTitle(item.id, listId, editText.trim()); setEditingId(null); await animateAndRefresh(); } }} returnKeyType="done" /></View>;
            const c = JELLY[hash(item.title) % JELLY.length];
            const isDone = item.status === 'completed';
            const mem = !!item.memoryText;
            const isDragged = dragActive.current && dragRef.current.itemId === item.id;
            if (isDragged) {
              return <View key={item.id} style={mode === 'gallery' ? [st.galleryCard, { backgroundColor: 'transparent', width: GALLERY_STYLES.cardWidth, borderColor: 'transparent' }] : [pil.p, { backgroundColor: 'transparent', paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH, borderColor: 'transparent' }]} />;
            }
            return (
              <TouchableOpacity key={item.id} activeOpacity={0.85} onPress={() => press(item)}>
                <View style={mode === 'gallery' ? [st.galleryCard, { backgroundColor: isDone ? `${c}66` : c, width: GALLERY_STYLES.cardWidth }] : [pil.p, { backgroundColor: isDone ? `${c}66` : c, paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }]}>
                  <Text style={{ fontSize: mode === 'gallery' ? GALLERY_STYLES.fontSize : f!.fontSize, fontWeight: isDone ? '400' : '600', color: isDone ? '#B2BEC3' : '#2D3436', textDecorationLine: isDone ? 'line-through' : 'none', maxWidth: mode === 'gallery' ? undefined : 180 }} numberOfLines={mode === 'gallery' ? 2 : 1}>{item.title}</Text>
                  {mem && <View style={pil.g}><Text style={pil.gt}>✦</Text></View>}
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={st.ab} onPress={() => setShowAddOverlay(true)}><Text style={st.at}>+</Text></TouchableOpacity>
        </ScrollView>
      </View>
      {dragVisible && (
        <Animated.View style={[st.dragOverlay, { transform: [{ translateY: dragY }], top: dragRef.current.startPageY - 80 }]}>
          {dragRef.current.isGallery ? (
            <View style={[st.galleryCard, { backgroundColor: `${dragRef.current.itemColor}EE`, width: dragRef.current.cardW, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10, transform: [{ scale: 1.05 }] }]}>
              <Text style={{ fontSize: dragRef.current.fontSz, fontWeight: '700', color: '#2D3436' }} numberOfLines={2}>{dragRef.current.itemTitle}</Text>
            </View>
          ) : (
            <View style={[pil.p, { backgroundColor: `${dragRef.current.itemColor}EE`, paddingHorizontal: dragRef.current.padH, paddingVertical: dragRef.current.padV, minHeight: dragRef.current.minH, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10, transform: [{ scale: 1.05 }], alignSelf: 'flex-start' }]}>
              <Text style={{ fontSize: dragRef.current.fontSz, fontWeight: '700', color: '#2D3436', maxWidth: 180 }} numberOfLines={1}>{dragRef.current.itemTitle}</Text>
            </View>
          )}
        </Animated.View>
      )}
      <MemoryModal visible={modalVisible} item={selectedItem} onClose={onClose} onSaved={onSave} />
      <AddItemOverlay visible={showAddOverlay} onAdd={handleAddItem} onClose={() => setShowAddOverlay(false)} currentCount={items.length} maxCount={listInfo?.itemLimit || 100} />
    </View>
  );
}

const st = StyleSheet.create({
  r: { flex: 1, backgroundColor: '#E8ECF1' },
  ld: { flex: 1, backgroundColor: '#E8ECF1', alignItems: 'center', justifyContent: 'center' },
  s: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  h: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 12, borderRadius: 32, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.55)' },
  bb: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(45,52,54,0.06)', alignItems: 'center', justifyContent: 'center' },
  bt: { fontSize: 20, color: '#2D3436', fontWeight: '600' },
  hc: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  ht: { fontSize: 18, fontWeight: '700', color: '#2D3436' },
  pb: { height: 2, backgroundColor: 'rgba(45,52,54,0.06)', marginHorizontal: 16, marginTop: 8, borderRadius: 1, overflow: 'hidden' },
  pf: { height: '100%', backgroundColor: '#6C7A8D', borderRadius: 1 },
  pt: { fontSize: 11, color: '#7A8A9E', textAlign: 'center', marginTop: 4, marginBottom: 6, fontWeight: '500' },
  sc: { flex: 1 },
  galleryContainer: { flexDirection: 'column', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 60, paddingTop: 12, gap: 12 },
  galleryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', paddingHorizontal: 20, paddingVertical: 14, shadowColor: '#4A5568', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  fluidContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 60, paddingTop: 6, alignContent: 'flex-start' },
  e: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(45,52,54,0.12)', alignSelf: 'flex-start' },
  ei: { fontSize: 11.5, fontWeight: '600', color: '#2D3436', minWidth: 50, padding: 0 },
  ab: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#2D3436', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3, alignSelf: 'flex-start' },
  at: { fontSize: 20, color: '#FFF', marginTop: -1 },
  dragOverlay: { position: 'absolute', left: 16, right: 16, zIndex: 999 },
});

const pil = StyleSheet.create({
  p: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', shadowColor: '#4A5568', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  pb: { alignItems: 'center', justifyContent: 'center', minWidth: 40 },
  g: { marginLeft: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(116,185,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  gt: { fontSize: 9, color: '#4A90D9' },
});