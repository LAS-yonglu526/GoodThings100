/**
 * @copyright 2025 L.A.S 庸禄 (LAS-yonglu526). All rights reserved.
 * 好事100 (GoodThings100) — 数字清单 App
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { captureRef } from 'react-native-view-shot';
import { Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GoodList } from '../services/database';

const { width: SW } = Dimensions.get('window');
const CARD_W = SW - 32;
const ORBIT_CY = 180;

const JELLY = [
  '#FFE0E5', '#E0EEFF', '#D5F5E3', '#E8E0F0', '#FFE8D6', '#FFF3CD',
  '#D6F0FA', '#FADDE4', '#FEE3D0', '#E0EBE3', '#DCEFF5', '#FDE2E7',
];
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); return Math.abs(h); }

interface Props {
  visible: boolean;
  list: GoodList | null;
  totalCount: number;
  doneCount: number;
  completedItems: string[];
  onClose: () => void;
}

export default function ShareCard({ visible, list, totalCount, doneCount, completedItems, onClose }: Props) {
  // ⚠️ 所有 hooks 必须在最顶层，不能在任何条件 return 之后
  const viewRef0 = useRef<View>(null);
  const viewRef1 = useRef<View>(null);
  const viewRef2 = useRef<View>(null);
  const slideAnim = useRef(new Animated.Value(SW)).current;
  const [capturing, setCapturing] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const orbitCache = useRef<{ key: string; pills: { x: number; y: number; color: string; title: string; fs: number }[] }>({ key: '', pills: [] });

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SW, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);

  // 所有变量计算，不依赖早期 return
  const listTitle = list?.title || '';
  const listIcon = list?.iconEmoji || '✨';
  const coverColor = list?.coverColor || '#E8ECF1';
  const cardBg = coverColor + 'EE';
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const safeItems: string[] = Array.isArray(completedItems) ? completedItems : [];
  const refs = [viewRef0, viewRef1, viewRef2];

  const handleShare = useCallback(async () => {
    setCapturing(true);
    try {
      const r = refs[activePage];
      if (!r?.current) { setCapturing(false); return; }
      const uri = await captureRef(r.current, { format: 'png', quality: 0.95 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Share.share({ message: '', url: uri });
    } catch (e: any) {
      if (!e?.message?.includes('cancel')) { /* silently ignore */ }
    } finally {
      setCapturing(false);
    }
  }, [activePage, refs]);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 16));
    setActivePage(Math.max(0, Math.min(2, page)));
  }, []);

  // 环绕布局预计算
  const itemsKey = safeItems.join('|');
  if (itemsKey !== orbitCache.current.key) {
    const items = safeItems.slice(0, 42);
    const pills: { x: number; y: number; color: string; title: string; fs: number }[] = [];
    if (items.length > 0) {
      const cx = CARD_W / 2;
      // 宽轨道 + 少胶囊，确保不碰撞中心文字也不互相触碰
      const rings = [
        { r: 54, count: 2, fontSize: 14 },
        { r: 82, count: 4, fontSize: 12 },
        { r: 110, count: 6, fontSize: 10.5 },
        { r: 136, count: 8, fontSize: 9 },
      ];
      let idx = 0;
      for (const ring of rings) {
        const { r, count, fontSize } = ring;
        const step = (Math.PI * 2) / count;
        for (let i = 0; i < count && idx < items.length; i++) {
          const angle = step * i;
          const t = items[idx] || '';
          const color = JELLY[hashStr(t) % JELLY.length];
          const w = t.length * fontSize * 0.65 + 16;
          const rawX = cx + Math.cos(angle) * r;
          const rawY = ORBIT_CY + Math.sin(angle) * r * 1.1;
          pills.push({
            x: Math.max(6, Math.min(rawX - w / 2, CARD_W - w - 6)),
            y: Math.max(8, Math.min(rawY - fontSize / 2 - 3, 348)),
            color, title: t, fs: fontSize,
          });
          idx++;
        }
      }
    }
    orbitCache.current = { key: itemsKey, pills };
  }
  const orbitPills = orbitCache.current.pills;

  // ✅ 早期 return 在所有 hooks 和变量之后，只影响 JSX
  if (!visible || !list) return null;

  return (
    <View style={ss.overlay} pointerEvents="auto">
      <TouchableOpacity style={ss.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ScrollView
          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          snapToInterval={CARD_W + 16} decelerationRate="fast"
          contentContainerStyle={ss.scrollContent} style={ss.scrollArea}
        >
          <View style={ss.cardSlot}>
            <View ref={refs[0]} collapsable={false} style={[ss.card, { backgroundColor: cardBg, width: CARD_W }]}>
              <Text style={ss.cardIcon}>{listIcon}</Text>
              <Text style={ss.cardTitle}>{listTitle}</Text>
              <View style={ss.progressBar}><View style={[ss.progressFill, { width: `${Math.min(pct, 100)}%` }]} /></View>
              <Text style={ss.cardStats}>{doneCount}/{totalCount} 已完成 · {pct}%</Text>
              <View style={ss.brandRow}><Text style={ss.brandText}>好事100 · 100种仪式感</Text></View>
            </View>
          </View>

          <View style={ss.cardSlot}>
            <View ref={refs[1]} collapsable={false} style={[ss.card, { height: 400, backgroundColor: cardBg, width: CARD_W, alignItems: 'stretch' }]}>
              {orbitPills.map((p, i) => (
                <View key={i} style={[ss.orbitPill, { left: p.x, top: p.y, backgroundColor: p.color + 'FF' }]}>
                  <Text style={[ss.orbitPillText, { fontSize: p.fs }]} numberOfLines={1}>{p.title}</Text>
                </View>
              ))}
              <View style={[ss.orbitCenter, { top: ORBIT_CY - 38, left: 0, right: 0 }]}>
                <Text style={ss.orbitEmoji}>{listIcon}</Text>
                <Text style={ss.orbitTitle} numberOfLines={1}>{listTitle}</Text>
                <Text style={ss.orbitSub}>{doneCount}/{totalCount} 件好事</Text>
              </View>
              <View style={[ss.brandRow, { position: 'absolute', bottom: 16, left: 28, right: 28, borderTopColor: 'rgba(45,52,54,0.06)' }]}>
                <Text style={ss.brandText}>好事100 · 100种仪式感</Text>
              </View>
            </View>
          </View>

          <View style={ss.cardSlot}>
            <View ref={refs[2]} collapsable={false} style={[ss.card, { backgroundColor: cardBg, width: CARD_W, alignItems: 'stretch' }]}>
              <View style={ss.gridHeader}>
                <Text style={ss.gridIcon}>{listIcon}</Text>
                <Text style={ss.gridTitle}>{listTitle}</Text>
                <Text style={ss.gridSub}>{doneCount}/{totalCount} 已完成</Text>
              </View>
              {safeItems.length > 0 ? (
                <View style={ss.gridBody}>
                  {safeItems.map((t, i) => {
                    const txt = t || '';
                    const color = JELLY[hashStr(txt) % JELLY.length];
                    return (
                      <View key={i} style={[ss.gridPill, { backgroundColor: color + 'CC' }]}>
                        <Text style={ss.gridPillText} numberOfLines={1}>{txt}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={ss.gridEmpty}><Text style={ss.gridEmptyText}>还没有完成的好事</Text></View>
              )}
              <View style={ss.brandRow}><Text style={ss.brandText}>好事100 · 100种仪式感</Text></View>
            </View>
          </View>
        </ScrollView>

        <TouchableOpacity style={ss.shareBtn} onPress={handleShare} disabled={capturing}>
          <Text style={ss.shareBtnText}>{capturing ? '生成中...' : '📤 分享当前卡片'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 999, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' },
  sheet: { width: SW - 16, maxWidth: 440 },
  sheetInner: { padding: 0, borderRadius: 24, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.65)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 12 },
  handleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, marginBottom: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(45,52,54,0.1)' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(45,52,54,0.06)', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 12, color: '#7A8A9E', fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '800', color: '#2D3436', textAlign: 'center', paddingHorizontal: 16, marginBottom: 8 },
  scrollArea: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 0 },
  cardSlot: { marginHorizontal: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 2, marginBottom: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(45,52,54,0.15)' },
  dotActive: { backgroundColor: '#2D3436', width: 16, borderRadius: 3 },
  card: { padding: 12, borderRadius: 14, alignItems: 'center' },
  cardIcon: { fontSize: 48, marginBottom: 8 },
  cardTitle: { fontSize: 22, fontWeight: '900', color: '#2D3436', marginBottom: 16, textAlign: 'center' },
  progressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 3, width: '100%', marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#2D3436', borderRadius: 3 },
  cardStats: { fontSize: 15, fontWeight: '700', color: '#2D3436', marginBottom: 16 },
  brandRow: { borderTopWidth: 1, borderTopColor: 'rgba(45,52,54,0.08)', paddingTop: 12, width: '100%', alignItems: 'center' },
  brandText: { fontSize: 12, color: '#636E72', fontWeight: '500' },
  orbitPill: { position: 'absolute', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 130, overflow: 'hidden', shadowColor: '#4A5568', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  orbitPillText: { fontWeight: '700', color: '#2D3436' },
  orbitCenter: { position: 'absolute', alignItems: 'center', zIndex: 2 },
  orbitEmoji: { fontSize: 32, marginBottom: 2 },
  orbitTitle: { fontSize: 19, fontWeight: '900', color: '#2D3436', paddingHorizontal: 16, textAlign: 'center' },
  orbitSub: { fontSize: 12, color: '#636E72', fontWeight: '500', marginTop: 2 },
  gridHeader: { alignItems: 'center', marginBottom: 14 },
  gridIcon: { fontSize: 30, marginBottom: 2 },
  gridTitle: { fontSize: 19, fontWeight: '900', color: '#2D3436', textAlign: 'center' },
  gridSub: { fontSize: 12, color: '#636E72', fontWeight: '500', marginTop: 2 },
  gridBody: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 14, paddingHorizontal: 4, justifyContent: 'center' },
  gridPill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3, shadowColor: '#4A5568', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  gridPillText: { fontSize: 10, fontWeight: '600', color: '#2D3436' },
  gridEmpty: { alignItems: 'center', paddingVertical: 20, marginBottom: 14 },
  gridEmptyText: { fontSize: 14, fontWeight: '700', color: '#636E72' },
  shareBtn: { backgroundColor: '#2D3436', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  shareBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});