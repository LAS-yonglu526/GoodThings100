/**
 * @copyright 2025 L.A.S 庸禄 (LAS-yonglu526). All rights reserved.
 * 好事100 (GoodThings100) — 数字清单 App
 */

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
import { getItemCount, getCompletedCount, getCompletedItemTitles, GoodList } from './src/services/database';
import { checkAndPromptUpdate } from './src/utils/updateChecker';

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

  const [timelineListId, setTimelineListId] = useState('');
  const [timelineListTitle, setTimelineListTitle] = useState('');
  const [timelineListIcon, setTimelineListIcon] = useState('');
  const [isSharedList, setIsSharedList] = useState(false);

  const handleOpenTimeline = useCallback((listId: string, title: string, icon: string) => {
    setTimelineListId(listId);
    setTimelineListTitle(title);
    setTimelineListIcon(icon);
    setOverlay('timeline');
    slideAnim.setValue(SW * 0.15);
    Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
  }, [slideAnim]);

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

  // 热更新检测（仅 Android 端生效，iOS 走 App Store 正规流程）
  useEffect(() => {
    checkAndPromptUpdate();
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
        onOpenTimeline={handleOpenTimeline}
      />

      {overlay === 'detail' && (
        <Animated.View style={[s.overlay, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
          <ListDetailScreen
            listId={selectedListId}
            onBack={closeOverlay}
            isShared={isSharedList}
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
            partnerUid=""
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