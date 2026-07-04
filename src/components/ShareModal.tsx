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
  Clipboard,
  Alert,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GoodList } from '../services/database';

const { width: SW } = Dimensions.get('window');
const MODAL_W = SW - 40;

const BG_COLORS = [
  '#FFE0E5', '#E0EEFF', '#D5F5E3', '#E8E0F0', '#FFE8D6', '#FFF3CD',
  '#D6F0FA', '#FADDE4', '#FEE3D0', '#E0EBE3', '#DCEFF5', '#FDE2E7',
];
const JELLY = BG_COLORS;
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); return Math.abs(h); }

type ShareMode = 'none' | 'text' | 'poster';

interface Props {
  visible: boolean;
  list: GoodList | null;
  totalCount: number;
  doneCount: number;
  completedItems: string[];
  onClose: () => void;
}

export default function ShareModal({ visible, list, totalCount, doneCount, completedItems, onClose }: Props) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.88)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  const captureRef0 = useRef<View>(null);
  const captureRef1 = useRef<View>(null);

  const [mode, setMode] = useState<ShareMode>('none');
  const [capturing, setCapturing] = useState(false);
  const [activePoster, setActivePoster] = useState(0);
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);

  const listTitle = list?.title || '';
  const listIcon = list?.iconEmoji || '✨';
  const coverColor = list?.coverColor || '#E8ECF1';
  const cardBg = coverColor + 'EE';
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const safeItems: string[] = Array.isArray(completedItems) ? completedItems : [];
  const captureRefs = [captureRef0, captureRef1];

  const pillFontSize = safeItems.length <= 10 ? 13 : safeItems.length <= 20 ? 11 : safeItems.length <= 30 ? 10 : safeItems.length <= 50 ? 9 : safeItems.length <= 80 ? 8 : 7;

  useEffect(() => {
    if (visible) {
      overlayOpacity.setValue(0);
      modalScale.setValue(0.88);
      modalOpacity.setValue(0);
      setMode('none');
      setActivePoster(0);
      setBgColor(BG_COLORS[0]);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(modalScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(modalOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.spring(modalScale, { toValue: 0.92, friction: 10, tension: 80, useNativeDriver: true }),
      Animated.timing(modalOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [onClose, overlayOpacity, modalScale, modalOpacity]);

  const handleShare = useCallback(async () => {
    if (mode === 'none') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (mode === 'text') {
      const lines = safeItems.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const message = `📋 ${listTitle}\n${totalCount ? `已完成 ${doneCount}/${totalCount}（${pct}%）\n` : ''}\n${lines}\n\n— 好事100 · 100种仪式感`;
      Clipboard.setString(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('已复制', '清单文字已复制到剪贴板，快去粘贴分享吧！', [{ text: '好的', onPress: handleClose }]);
      return;
    }

    setCapturing(true);
    try {
      // 延迟一帧等隐藏截图 View 布局完毕
      await new Promise(r => setTimeout(r, 100));
      const r = captureRefs[activePoster];
      if (!r?.current) { setCapturing(false); return; }
      const uri = await captureRef(r.current, { format: 'png', quality: 0.95 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Share.share({ message: '', url: uri });
    } catch (e: any) {
      if (!e?.message?.includes('cancel')) { /* silently ignore */ }
    } finally {
      setCapturing(false);
      handleClose();
    }
  }, [mode, activePoster, safeItems, listTitle, totalCount, doneCount, pct, captureRefs, handleClose]);

  const onPosterScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / (posterW + 8));
    setActivePoster(Math.max(0, Math.min(1, page)));
  }, []);

  if (!visible || !list) return null;

  const isTextMode = mode === 'text';
  const isPosterMode = mode === 'poster';
  const btnLabel = mode === 'none' ? '请选择分享版式' : (capturing ? '生成中...' : (isTextMode ? '复制并分享' : '生成并分享'));
  const btnDisabled = mode === 'none' || capturing;

  const posterW = MODAL_W - 32;
  const posterH = posterW * 1.25;

  // 截图用海报（色值状态完全相同）
  const capturePosterBg = bgColor + 'AA';

  const renderPoster1 = () => (
    <View style={[ss.posterCard, { width: posterW, backgroundColor: capturePosterBg }]}>
      <Text style={ss.pIcon}>{listIcon}</Text>
      <Text style={ss.pTitle} numberOfLines={2}>{listTitle}</Text>
      <View style={ss.pBar}>
        <View style={[ss.pBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: 'rgba(255,255,255,0.65)' }]} />
      </View>
      <Text style={ss.pStats}>{doneCount}/{totalCount} 已完成 · {pct}%</Text>
      {safeItems.length > 0 ? (
        <View style={ss.pGrid}>
          {safeItems.map((t, i) => {
            const txt = t || '';
            const col = JELLY[hashStr(txt) % JELLY.length];
            return (
              <View key={i} style={[ss.pPill, { backgroundColor: col + 'CC' }]}>
                <Text style={[ss.pPillText, { fontSize: pillFontSize }]} numberOfLines={1}>{txt}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={ss.pEmpty}><Text style={ss.pEmptyText}>还没有完成的好事</Text></View>
      )}
      <View style={ss.pBrand}><Text style={ss.pBrandText}>好事100 · 100种仪式感</Text></View>
    </View>
  );

  const renderPoster2 = () => (
    <View style={[ss.posterCard, { width: posterW, backgroundColor: capturePosterBg }]}>
      <Text style={ss.pIcon}>{listIcon}</Text>
      <Text style={ss.pTitle} numberOfLines={2}>{listTitle}</Text>
      <View style={ss.pBar}>
        <View style={[ss.pBarFill, { width: '100%', backgroundColor: 'rgba(255,255,255,0.65)' }]} />
      </View>
      <Text style={ss.pStats}>{doneCount}/{totalCount} 已完成 · {pct}%</Text>
      {safeItems.length > 0 ? (
        <View style={ss.pGrid}>
          {safeItems.map((t, i) => {
            const txt = t || '';
            const col = JELLY[hashStr(txt) % JELLY.length];
            return (
              <View key={i} style={[ss.pPillStrikethrough, { backgroundColor: col + 'CC' }]}>
                <Text style={[ss.pPillStrikethroughText, { fontSize: pillFontSize }]} numberOfLines={1}>{txt}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={ss.pEmpty}><Text style={ss.pEmptyText}>还没有完成的好事</Text></View>
      )}
      <View style={ss.pBrand}><Text style={ss.pBrandText}>好事100 · 100种仪式感</Text></View>
    </View>
  );

  return (
    <View style={ss.overlay} pointerEvents="auto">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: overlayOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      <Animated.View style={[ss.modal, { opacity: modalOpacity, transform: [{ scale: modalScale }] }]}>
        {/* ── 1. 顶部标题 ── */}
        <View style={ss.titleSection}>
          <Text style={ss.titleMain}>分享我的清单</Text>
        </View>

        {/* ── 2. 预览配图区 ── */}
        <View style={ss.previewRow}>
          <View style={ss.previewSideNote}>
            <Text style={ss.sideNoteText}>分享效果以生成海报为准</Text>
          </View>
          <View style={[ss.miniCard, { backgroundColor: cardBg }]}>
            <Text style={ss.miniCardIcon}>{listIcon}</Text>
            <Text style={ss.miniCardTitle} numberOfLines={1}>{listTitle}</Text>
            <View style={ss.miniProgressBar}>
              <View style={[ss.miniProgressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: 'rgba(255,255,255,0.55)' }]} />
            </View>
            <Text style={ss.miniCardStats}>{doneCount}/{totalCount} · {pct}%</Text>
            <View style={ss.greenTag}>
              <Text style={ss.greenTagText}>分享专属</Text>
            </View>
          </View>
        </View>

        {/* ── 3. 配置选型区 ── */}
        <View style={ss.configSection}>
          <Text style={ss.configLabel}>分享版式</Text>

          <View style={ss.radioGroup}>
            <TouchableOpacity
              style={[ss.radioChip, isTextMode && ss.radioChipSelected]}
              onPress={() => { setMode('text'); Haptics.selectionAsync(); }}
              activeOpacity={0.7}
            >
              <View style={[ss.radioDotSmall, isTextMode && ss.radioDotSmallOn]} />
              <Text style={[ss.radioChipText, isTextMode && ss.radioChipTextOn]}>纯文字</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ss.radioChip, isPosterMode && ss.radioChipSelected]}
              onPress={() => { setMode('poster'); Haptics.selectionAsync(); }}
              activeOpacity={0.7}
            >
              <View style={[ss.radioDotSmall, isPosterMode && ss.radioDotSmallOn]} />
              <Text style={[ss.radioChipText, isPosterMode && ss.radioChipTextOn]}>海报版</Text>
            </TouchableOpacity>
          </View>

          {isPosterMode && (
            <Animated.View style={ss.posterPreviewWrap}>
              <Text style={ss.bgLabel}>选择底色</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.bgScroll} contentContainerStyle={ss.bgScrollContent}>
                {BG_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[ss.bgSwatch, { backgroundColor: c + 'AA' }, bgColor === c && ss.bgSwatchOn]}
                    onPress={() => { setBgColor(c); Haptics.selectionAsync(); }}
                  />
                ))}
              </ScrollView>

              <ScrollView
                horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onPosterScrollEnd}
                snapToInterval={posterW + 8} decelerationRate="fast"
                contentContainerStyle={ss.posterScrollContent}
                style={ss.posterScroll}
              >
                <View style={[ss.posterSlot, { width: posterW }]}>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Math.min(posterH, 280) }} contentContainerStyle={{ paddingBottom: 4 }}>
                    {renderPoster1()}
                  </ScrollView>
                </View>
                <View style={[ss.posterSlot, { width: posterW }]}>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Math.min(posterH, 280) }} contentContainerStyle={{ paddingBottom: 4 }}>
                    {renderPoster2()}
                  </ScrollView>
                </View>
              </ScrollView>

              <View style={ss.dots}>
                {[0, 1].map((i) => (
                  <View key={i} style={[ss.dot, activePoster === i && ss.dotActive]} />
                ))}
              </View>
            </Animated.View>
          )}
        </View>

        {/* ── 4. 底部双按钮 ── */}
        <View style={ss.btnRow}>
          <TouchableOpacity style={ss.cancelBtn} onPress={handleClose}>
            <Text style={ss.cancelBtnText}>取消分享</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ss.shareBtn, btnDisabled && ss.shareBtnDisabled]}
            onPress={handleShare}
            disabled={btnDisabled}
            activeOpacity={0.7}
          >
            <Text style={[ss.shareBtnText, btnDisabled && ss.shareBtnTextDisabled]}>{btnLabel}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* 隐藏截图 View（不在弹窗内，避免 ScrollView 裁剪） */}
      <View style={ss.captureHidden} pointerEvents="none">
        <View ref={captureRef0} collapsable={false} style={{ width: posterW, height: posterH }}>
          {renderPoster1()}
        </View>
        <View ref={captureRef1} collapsable={false} style={{ width: posterW, height: posterH }}>
          {renderPoster2()}
        </View>
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: MODAL_W,
    maxWidth: 420,
    backgroundColor: '#FEFCF8',
    borderRadius: 24,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
    shadowColor: '#4A5568',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 16,
  },

  // ── 1. Title ──
  titleSection: { alignItems: 'center', marginBottom: 12 },
  titleMain: { fontSize: 17, fontWeight: '900', color: '#2D3436', textAlign: 'center' },

  // ── 2. Preview ──
  previewRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  previewSideNote: { width: 16 },
  sideNoteText: { fontSize: 8, color: '#B2BEC3', fontWeight: '500', transform: [{ rotate: '-90deg' }], width: 70, textAlign: 'center', marginLeft: -27 },
  miniCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', position: 'relative' },
  miniCardIcon: { fontSize: 28, marginBottom: 2 },
  miniCardTitle: { fontSize: 14, fontWeight: '800', color: '#2D3436', marginBottom: 6 },
  miniProgressBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 1.5, width: '100%', marginBottom: 4, overflow: 'hidden' },
  miniProgressFill: { height: '100%', borderRadius: 1.5 },
  miniCardStats: { fontSize: 10, fontWeight: '700', color: '#636E72' },
  greenTag: { position: 'absolute', top: 0, right: 0, backgroundColor: '#00B894', borderBottomLeftRadius: 10, borderTopRightRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  greenTagText: { fontSize: 9, fontWeight: '700', color: '#FFF' },

  // ── 3. Config ──
  configSection: { marginBottom: 12 },
  configLabel: { fontSize: 11, fontWeight: '600', color: '#B2BEC3', marginBottom: 6 },
  radioGroup: { flexDirection: 'row', gap: 8 },
  radioChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(45,52,54,0.03)', borderWidth: 1, borderColor: 'rgba(45,52,54,0.06)', flex: 1 },
  radioChipSelected: { backgroundColor: 'rgba(0,184,148,0.06)', borderColor: 'rgba(0,184,148,0.2)' },
  radioDotSmall: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#B2BEC3' },
  radioDotSmallOn: { borderColor: '#00B894', backgroundColor: '#00B894' },
  radioChipText: { fontSize: 12, fontWeight: '600', color: '#636E72' },
  radioChipTextOn: { color: '#2D3436' },

  posterPreviewWrap: { marginTop: 10 },

  bgLabel: { fontSize: 10, fontWeight: '600', color: '#B2BEC3', marginBottom: 6 },
  bgScroll: { flexGrow: 0, marginBottom: 8 },
  bgScrollContent: { gap: 8, paddingRight: 8 },
  bgSwatch: { width: 28, height: 28, borderRadius: 14 },
  bgSwatchOn: { transform: [{ scale: 1.18 }] },

  posterScroll: { flexGrow: 0 },
  posterScrollContent: { paddingHorizontal: 0 },
  posterSlot: { marginHorizontal: 4 },

  posterCard: { borderRadius: 16, padding: 16, alignItems: 'center' },
  pIcon: { fontSize: 34, marginBottom: 4 },
  pTitle: { fontSize: 18, fontWeight: '900', color: '#2D3436', textAlign: 'center', marginBottom: 12, paddingHorizontal: 4 },
  pBar: { height: 5, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2.5, width: '100%', marginBottom: 6, overflow: 'hidden' },
  pBarFill: { height: '100%', borderRadius: 2.5 },
  pStats: { fontSize: 12, fontWeight: '700', color: '#2D3436', marginBottom: 14 },
  pGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center', flex: 1 },
  pPill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3, shadowColor: '#4A5568', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  pPillText: { fontWeight: '600', color: '#2D3436' },
  pPillStrikethrough: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3 },
  pPillStrikethroughText: { fontWeight: '600', color: 'rgba(45,52,54,0.45)', textDecorationLine: 'line-through' },
  pEmpty: { alignItems: 'center', paddingVertical: 20, flex: 1, justifyContent: 'center' },
  pEmptyText: { fontSize: 13, fontWeight: '700', color: '#636E72' },
  pBrand: { paddingTop: 10, width: '100%', alignItems: 'center', marginTop: 'auto' },
  pBrandText: { fontSize: 11, color: '#636E72', fontWeight: '500' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(45,52,54,0.1)' },
  dotActive: { backgroundColor: '#00B894', width: 12, borderRadius: 2 },

  // ── 4. Buttons ──
  btnRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(45,52,54,0.05)', alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#636E72' },
  shareBtn: { flex: 1.6, paddingVertical: 12, borderRadius: 14, backgroundColor: '#2D3436', alignItems: 'center' },
  shareBtnDisabled: { backgroundColor: 'rgba(45,52,54,0.12)' },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  shareBtnTextDisabled: { color: 'rgba(45,52,54,0.3)' },

  // 隐藏截图 View
  captureHidden: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    opacity: 0,
  },
});