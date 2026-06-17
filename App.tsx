import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, View } from 'react-native';
import ListHomeScreen from './src/screens/ListHomeScreen';
import ListDetailScreen from './src/screens/ListDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ShareModal from './src/components/ShareModal';
import SharedTimelineScreen from './src/screens/SharedTimelineScreen';
import SharedListManager from './src/components/SharedListManager';
import { CardLayout } from './src/screens/ListHomeScreen';
import { getItemCount, getCompletedCount, getCompletedItemTitles, GoodList, getSharedLists } from './src/services/database';
import { getCurrentUserId } from './src/services/auth';
import { getCouplePartner } from './src/services/couple';
import { fetchPartnerSharedLists, SharedList, fetchSharedItems, SharedItem } from './src/services/couple';
import { upsertItem } from './src/services/database';

const { width: SW } = Dimensions.get('window');

type Overlay = 'none' | 'detail' | 'settings' | 'timeline' | 'sharedManager';

export default function App() {
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const cardLayout = useRef<CardLayout>({ x: 0, y: 0, width: SW, height: 600 });

  const [shareVisible, setShareVisible] = useState(false);
  const [shareList, setShareList] = useState<GoodList | null>(null);
  const [shareTotal, setShareTotal] = useState(0);
  const [shareDone, setShareDone] = useState(0);
  const [shareCompletedItems, setShareCompletedItems] = useState<string[]>([]);

  // 双人模式状态
  const [partnerUid, setPartnerUid] = useState<string | null>(null);
  const [partnerSharedLists, setPartnerSharedLists] = useState<GoodList[]>([]);
  const [timelineListId, setTimelineListId] = useState('');
  const [timelineListTitle, setTimelineListTitle] = useState('');
  const [timelineListIcon, setTimelineListIcon] = useState('');
  const [isSharedList, setIsSharedList] = useState(false);

  useEffect(() => {
    getCurrentUserId().then(async (uid) => {
      if (!uid) return;
      const partner = await getCouplePartner(uid);
      setPartnerUid(partner);
      if (partner) {
        const shareLists = await fetchPartnerSharedLists(partner);
        // Sync partner's shared lists as local read-only copies
        for (const sl of shareLists) {
          const { getSharedLists: gsl } = require('./src/services/database');
          // We just store locally; ListHomeScreen will display them
        }
        // trigger home refresh
        setHomeRefreshKey(k => k + 1);
      }
    });
  }, []);

  const loadPartnerLists = useCallback(async () => {
    if (!partnerUid) return;
    const sl = await fetchPartnerSharedLists(partnerUid);
    const mapped: GoodList[] = sl.map(l => ({
      id: l.list_id,
      userId: l.owner_uid,
      title: l.title,
      themeType: l.theme_type,
      iconEmoji: l.icon_emoji,
      coverColor: l.cover_color,
      itemLimit: l.item_limit,
      createdAt: l.created_at,
      isShared: 1,
    }));
    setPartnerSharedLists(mapped);
  }, [partnerUid]);

  const handleOpenTimeline = useCallback((listId: string, title: string, icon: string) => {
    if (!partnerUid) return;
    setTimelineListId(listId);
    setTimelineListTitle(title);
    setTimelineListIcon(icon);
    setOverlay('timeline');
    slideAnim.setValue(SW * 0.15);
    Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
  }, [partnerUid, slideAnim]);

  // 🔧 简化右滑返回
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderMove: (_, g) => { if (g.dx > 0) slideAnim.setValue(g.dx); },
    onPanResponderRelease: (_, g) => {
      if (g.dx > SW * 0.3) {
        Animated.timing(slideAnim, { toValue: SW, duration: 250, useNativeDriver: true }).start(() => {
          setOverlay('none');
          setHomeRefreshKey(k => k + 1);
        });
      } else {
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
      }
    },
  })).current;

  const openOverlay = (type: Overlay, listId?: string, layout?: CardLayout, shared?: boolean) => {
    if (listId) setSelectedListId(listId);
    if (layout) cardLayout.current = layout;
    setIsSharedList(!!shared);
    setOverlay(type);
    slideAnim.setValue(SW * 0.15);
    Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
  };

  const closeOverlay = () => {
    Animated.timing(slideAnim, { toValue: SW, duration: 250, useNativeDriver: true })
      .start(() => { setOverlay('none'); setHomeRefreshKey(k => k + 1); });
  };

  const handleOpenShare = useCallback(async (list: GoodList) => {
    const [total, done, items] = await Promise.all([
      getItemCount(list.id),
      getCompletedCount(list.id),
      getCompletedItemTitles(list.id),
    ]);
    setShareList(list);
    setShareTotal(total);
    setShareDone(done);
    setShareCompletedItems(items);
    setShareVisible(true);
  }, []);

  return (
    <View style={s.container}>
      <StatusBar style="dark" />
      <ListHomeScreen
        refreshKey={homeRefreshKey}
        onSelectList={(id, layout, isShared) => openOverlay('detail', id, layout, isShared)}
        onGoSettings={() => openOverlay('settings', undefined, undefined, false)}
        onShareList={handleOpenShare}
        onOpenSharing={(listId) => openOverlay('sharedManager', listId)}
        partnerSharedLists={partnerSharedLists}
        partnerUid={partnerUid}
        onOpenTimeline={handleOpenTimeline}
      />

      {overlay === 'detail' && (
        <Animated.View style={[s.overlay, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
          <ListDetailScreen
            listId={selectedListId}
            onBack={closeOverlay}
            partnerUid={partnerUid}
            isShared={isSharedList}
            onOpenTimeline={(title, icon) => handleOpenTimeline(selectedListId, title, icon)}
          />
        </Animated.View>
      )}

      {overlay === 'settings' && (
        <Animated.View style={[s.overlay, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
          <SettingsScreen
            onBack={closeOverlay}
            onOpenSharing={(listId) => openOverlay('sharedManager', listId)}
            onJoinedList={() => setHomeRefreshKey(k => k + 1)}
          />
        </Animated.View>
      )}

      {overlay === 'timeline' && (
        <Animated.View style={[s.overlay, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
          <SharedTimelineScreen
            listId={timelineListId}
            listTitle={timelineListTitle}
            listIcon={timelineListIcon}
            partnerUid={partnerUid || ''}
            onBack={() => {
              Animated.timing(slideAnim, { toValue: SW, duration: 250, useNativeDriver: true })
                .start(() => setOverlay('none'));
            }}
          />
        </Animated.View>
      )}

      {overlay === 'sharedManager' && (
        <Animated.View style={[s.overlay, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
          <SharedListManager listId={selectedListId} onBack={closeOverlay} />
        </Animated.View>
      )}

      <ShareModal
        visible={shareVisible}
        list={shareList}
        totalCount={shareTotal}
        doneCount={shareDone}
        completedItems={shareCompletedItems}
        onClose={() => setShareVisible(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E8ECF1',
  },
});