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
function FloatingOrb({ size, color, x, y, dx, dy }: typeof ORBS[number]) {
  const a = useRef(new Animated.ValueXY({ x: x * SW, y: y * SH })).current;
  useEffect(() => {
    const fx = () => Animated.timing(a, { toValue: { x: (Math.random() * 0.7 + 0.15) * SW, y: (a as any).y?._value ?? y * SH }, duration: dx + Math.random() * 8000, useNativeDriver: false }).start(() => fx());
    const fy = () => Animated.timing(a, { toValue: { x: (a as any).x?._value ?? x * SW, y: (Math.random() * 0.7 + 0.1) * SH }, duration: dy + Math.random() * 8000, useNativeDriver: false }).start(() => fy());
    fx(); fy();
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

const GALLERY_STYLES = { fontSize: 18, paddingH: 20, paddingV: 14, cardWidth: SW - 44, gap: 12 };

interface PillLayout { id: string; y: number; height: number; index: number; }
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
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set());

  // ====== 拖拽状态 ======
  const layoutCache = useRef<PillLayout[]>([]);
  const dragState = useRef({
    active: false,
    itemId: '',
    itemTitle: '',
    originalIndex: -1,
    startY: 0,
    currentY: new Animated.Value(0),
    targetIndex: -1,
    lastSwapTime: 0,
  }).current;

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

  const long = (item: GoodItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setFlippedIds(p => new Set(p).add(item.id));
    Alert.alert(item.title, '选择操作', [
      { text: '编辑', onPress: () => { setEditingId(item.id); setEditText(item.title); } },
      { text: '手记', onPress: () => { setSelectedItem(item); setModalVisible(true); } },
      { text: '删除', style: 'destructive', onPress: async () => { await deleteItem(item.id, listId); await animateAndRefresh(); } },
      { text: '取消', style: 'cancel', onPress: () => setFlippedIds(p => { const n = new Set(p); n.delete(item.id); return n; }) },
    ]);
  };

  // ====== 拖拽排序（统一 PanResponder + 长按定时器） ======
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartInfo = useRef({ y: 0, item: null as GoodItem | null, index: -1 });

  const activateDrag = (item: GoodItem, index: number, startY: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    dragState.active = true;
    dragState.itemId = item.id;
    dragState.itemTitle = item.title;
    dragState.originalIndex = index;
    dragState.startY = startY;
    dragState.currentY.setValue(0);
    dragState.targetIndex = index;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFlippedIds(p => new Set(p).add(item.id));
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => {
      // 拖拽激活后：处理移动
      if (dragState.active) return true;
      // 滑动距离超过阈值取消长按
      if (Math.abs(gs.dy) > 10 || Math.abs(gs.dx) > 10) {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
        return false;
      }
      return false;
    },
    onPanResponderGrant: (e) => {
      const { pageY } = e.nativeEvent;
      touchStartInfo.current.y = pageY;
      // 查找触摸的是哪个 item
      const targetItem = items[touchStartInfo.current.index];
      if (targetItem && mode === 'gallery') {
        touchStartInfo.current.item = targetItem;
        // 启动 600ms 长按定时器
        longPressTimer.current = setTimeout(() => {
          activateDrag(targetItem, touchStartInfo.current.index, pageY);
        }, 600);
      }
    },
    onPanResponderMove: (_, gs) => {
      if (!dragState.active) return;
      dragState.currentY.setValue(gs.dy);
      const now = Date.now();
      let interval = 16;
      if (mode === 'fluid') { const n = items.length; interval = n > 50 ? 50 : 32; }
      if (now - dragState.lastSwapTime < interval) return;
      dragState.lastSwapTime = now;

      const currentScreenY = dragState.startY + gs.dy;
      const targetIdx = findTargetIndex(currentScreenY, layoutCache.current, dragState.originalIndex);
      if (targetIdx !== -1 && targetIdx !== dragState.targetIndex) {
        dragState.targetIndex = targetIdx;
        setItems(prev => {
          const next = [...prev];
          const [moved] = next.splice(dragState.originalIndex, 1);
          next.splice(targetIdx, 0, moved);
          return next;
        });
        const cache = layoutCache.current;
        const [movedL] = cache.splice(dragState.originalIndex, 1);
        cache.splice(targetIdx, 0, movedL);
        for (let i = 0; i < cache.length; i++) cache[i].index = i;
        dragState.originalIndex = targetIdx;
        dragState.startY = cache[targetIdx].y;
        dragState.currentY.setValue(0);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
    },
    onPanResponderRelease: (_, gs) => {
      // 清除长按定时器
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      if (!dragState.active) {
        // 短按：触发 press
        const item = touchStartInfo.current.item;
        if (item && Math.abs(gs.dy) < 5 && Math.abs(gs.dx) < 5) {
          press(item);
        }
        return;
      }
      dragState.active = false;
      setFlippedIds(p => { const n = new Set(p); n.delete(dragState.itemId); return n; });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dragState.currentY.setValue(0);
    },
  })).current;

  const handleAddItem = async (text: string) => {
    if (items.length >= 100) { Alert.alert('已达上限', '每个清单最多 100 项'); return; }
    if (listInfo && items.length >= listInfo.itemLimit) {
      Alert.alert('已超出预设', `你原本设定为 ${listInfo.itemLimit} 项，目前已有 ${items.length} 项。可以继续添加。`);
    }
    await addItem(listId, text.trim()); await animateAndRefresh();
  };

  const onSave = async () => { setModalVisible(false); setSelectedItem(null); setFlippedIds(new Set()); await animateAndRefresh(); };
  const onClose = () => { setModalVisible(false); setSelectedItem(null); setFlippedIds(new Set()); };

  if (loading) return <View style={st.ld}><ActivityIndicator size="large" color="#9BA4B5" /></View>;

  const done = items.filter(i => i.status === 'completed').length;
  const mode = getLayoutMode(items.length);
  const f = mode === 'fluid' ? getFluidStyles(items.length) : null;

  // 重建 layoutCache
  layoutCache.current = items.map((item, idx) => ({
    id: item.id,
    y: (mode === 'gallery' ? idx * (GALLERY_STYLES.gap + 48) : Math.floor(idx / 6) * 40),
    height: mode === 'gallery' ? 48 : (f?.minH || 32),
    index: idx,
  }));

  const renderItem = (item: GoodItem, index: number) => {
    if (editingId === item.id) {
      return (
        <View key={item.id} style={mode === 'gallery' ? st.galleryEditWrap : st.e}>
          <TextInput
            style={mode === 'gallery' ? st.galleryEditInput : st.ei}
            value={editText} onChangeText={setEditText} autoFocus
            onBlur={async () => { if (editText.trim()) { await updateItemTitle(item.id, listId, editText.trim()); setEditingId(null); await animateAndRefresh(); } }}
            onSubmitEditing={async () => { if (editText.trim()) { await updateItemTitle(item.id, listId, editText.trim()); setEditingId(null); await animateAndRefresh(); } }}
            returnKeyType="done"
          />
        </View>
      );
    }

    const c = JELLY[hash(item.title) % JELLY.length];
    const isDone = item.status === 'completed';
    const mem = !!item.memoryText;
    const isFlipped = flippedIds.has(item.id);
    const isDragged = dragState.active && dragState.itemId === item.id;

    if (isFlipped && !isDragged) {
      if (mode === 'gallery') return <View key={item.id} style={[st.galleryCard, { backgroundColor: `${c}99`, width: GALLERY_STYLES.cardWidth }]}><Text style={{ fontSize: GALLERY_STYLES.fontSize }}>📝</Text></View>;
      return <View key={item.id} style={[pil.p, pil.pb, { backgroundColor: `${c}99`, paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }]}><Text style={{ fontSize: f!.fontSize }}>📝</Text></View>;
    }

    if (isDragged) {
      // 拖拽中：原位置占位（透明）
      if (mode === 'gallery') return <View key={item.id} style={[st.galleryCard, { backgroundColor: 'transparent', width: GALLERY_STYLES.cardWidth, borderColor: 'transparent' }]} />;
      return <View key={item.id} style={[pil.p, { backgroundColor: 'transparent', paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH, borderColor: 'transparent' }]} />;
    }

    if (mode === 'gallery') {
      return (
        <View key={item.id} style={{ alignSelf: 'stretch' }}
          onLayout={(e) => {
            const ly = e.nativeEvent.layout;
            layoutCache.current[index] = { id: item.id, y: ly.y + 100, height: ly.height, index };
          }}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => press(item)}
          >
            <View style={[st.galleryCard, { backgroundColor: isDone ? `${c}66` : c, width: GALLERY_STYLES.cardWidth }]}>
              <Text style={{
                fontSize: GALLERY_STYLES.fontSize,
                fontWeight: isDone ? '400' : '700',
                color: isDone ? '#B2BEC3' : '#2D3436',
                textDecorationLine: isDone ? 'line-through' : 'none',
              }} numberOfLines={2}>{item.title}</Text>
              {mem && <View style={pil.g}><Text style={pil.gt}>✦</Text></View>}
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    // Fluid 模式
    return (
      <View key={item.id} style={{ alignSelf: 'flex-start' }}>
        <ScaleButton onPress={() => press(item)} onLongPress={() => long(item)}>
          <View style={[pil.p, { backgroundColor: isDone ? `${c}66` : c, paddingHorizontal: f!.padH, paddingVertical: f!.padV, minHeight: f!.minH }]}>
            <Text style={{
              fontSize: f!.fontSize, fontWeight: isDone ? '400' : '600',
              color: isDone ? '#B2BEC3' : '#2D3436',
              textDecorationLine: isDone ? 'line-through' : 'none', maxWidth: 180,
            }} numberOfLines={1}>{item.title}</Text>
            {mem && <View style={pil.g}><Text style={pil.gt}>✦</Text></View>}
          </View>
        </ScaleButton>
      </View>
    );
  };

  return (
    <View style={st.r} {...panResponder.panHandlers}>
      {ORBS.map((o, i) => <FloatingOrb key={i} {...o} />)}
      <View style={st.s}>
        <BlurView intensity={70} tint="light" style={st.h}>
          <TouchableOpacity onPress={onBack} style={st.bb}><Text style={st.bt}>←</Text></TouchableOpacity>
          <View style={st.hc}><Text style={st.ht} numberOfLines={1}>{listInfo?.iconEmoji} {listInfo?.title}</Text></View>
          <View style={st.bb} />
        </BlurView>
        <View style={st.pb}><View style={[st.pf, { width: `${items.length ? (done / items.length) * 100 : 0}%` }]} /></View>
        <Text style={st.pt}>{done}/{items.length}</Text>
        <ScrollView
          style={st.sc} scrollEnabled={!dragState.active}
          contentContainerStyle={mode === 'gallery' ? st.galleryContainer : { ...st.fluidContainer, gap: f!.gap }}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item, idx) => renderItem(item, idx))}
          {mode === 'gallery' ? (
            <TouchableOpacity style={st.galleryAddBtn} onPress={() => setShowAddOverlay(true)}>
              <Text style={st.galleryAddBtnText}>+ 添加新事项</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={st.ab} onPress={() => setShowAddOverlay(true)}>
              <Text style={st.at}>+</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* 拖拽覆盖层 */}
      {dragState.active && (
        <Animated.View style={{
          position: 'absolute',
          top: dragState.startY - 60,
          left: 16, right: 16,
          transform: [{ translateY: dragState.currentY }],
          zIndex: 999,
        }}>
          <View style={[st.galleryCard, {
            width: GALLERY_STYLES.cardWidth,
            backgroundColor: 'rgba(255,255,255,0.95)',
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 10,
            transform: [{ scale: 1.05 }],
          }]}>
            <Text style={{
              fontSize: GALLERY_STYLES.fontSize,
              fontWeight: '700',
              color: '#2D3436',
            }} numberOfLines={2}>{dragState.itemTitle}</Text>
          </View>
        </Animated.View>
      )}

      <MemoryModal visible={modalVisible} item={selectedItem} onClose={onClose} onSaved={onSave} />
      <AddItemOverlay visible={showAddOverlay} onAdd={handleAddItem} onClose={() => setShowAddOverlay(false)} currentCount={items.length} maxCount={listInfo?.itemLimit || 100} />
    </View>
  );
}

/** 二分查找拖拽目标索引 */
function findTargetIndex(currentY: number, cache: PillLayout[], excludeIndex: number): number {
  let closest = -1;
  let minDist = Infinity;
  for (const p of cache) {
    if (p.index === excludeIndex) continue;
    const centerY = p.y + p.height / 2;
    const dist = Math.abs(currentY - centerY);
    if (dist < minDist && dist < p.height * 2) {
      minDist = dist;
      closest = p.index;
    }
  }
  return closest;
}

function ScaleButton({ onPress, onLongPress, children }: { onPress: () => void; onLongPress: () => void; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scale, { toValue: 0.92, friction: 12, tension: 140, useNativeDriver: true }).start();
  const handlePressOut = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.05, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1.0, friction: 4, tension: 120, useNativeDriver: true }),
    ]).start();
  };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={0.85} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} onLongPress={onLongPress} delayLongPress={400}>
        {children}
      </TouchableOpacity>
    </Animated.View>
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
  galleryAddBtn: { width: GALLERY_STYLES.cardWidth, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.4)', borderWidth: 1, borderColor: 'rgba(45,52,54,0.1)', borderStyle: 'dashed', marginTop: 4 },
  galleryAddBtnText: { fontSize: 16, fontWeight: '600', color: '#7A8A9E' },
  galleryEditWrap: { width: GALLERY_STYLES.cardWidth, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(45,52,54,0.12)', paddingHorizontal: 20, paddingVertical: 14 },
  galleryEditInput: { fontSize: 17, fontWeight: '600', color: '#2D3436', padding: 0 },
  fluidContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 60, paddingTop: 6, alignContent: 'flex-start' },
  e: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.55)', borderColor: 'rgba(45,52,54,0.12)', alignSelf: 'flex-start' },
  ei: { fontSize: 11.5, fontWeight: '600', color: '#2D3436', minWidth: 50, padding: 0 },
  ab: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#2D3436', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3, alignSelf: 'flex-start' },
  at: { fontSize: 20, color: '#FFF', marginTop: -1 },
});

const pil = StyleSheet.create({
  p: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', shadowColor: '#4A5568', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  pb: { alignItems: 'center', justifyContent: 'center', minWidth: 40 },
  g: { marginLeft: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(116,185,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  gt: { fontSize: 9, color: '#4A90D9' },
});