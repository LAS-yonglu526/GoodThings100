/**
 * @copyright 2025 L.A.S 庸禄 (LAS-yonglu526). All rights reserved.
 * 好事100 (GoodThings100) — 数字清单 App
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlassView, { SAFE_TOP } from '../components/GlassView';
import { fetchMemories, subscribeMemories, SharedMemory } from '../services/couple';

const { width: SW } = Dimensions.get('window');

interface Props {
  listId: string;
  listTitle: string;
  listIcon: string;
  partnerUid: string;
  onBack: () => void;
}

export default function SharedTimelineScreen({ listId, listTitle, listIcon, partnerUid, onBack }: Props) {
  const [memories, setMemories] = useState<SharedMemory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetchMemories(listId);
    setMemories(data);
    setLoading(false);
  }, [listId]);

  useEffect(() => {
    load();
    const unsub = subscribeMemories(listId, (m) => {
      setMemories(prev => [m, ...prev]);
    });
    return () => unsub();
  }, [load, listId]);

  const formatDate = (s: string) => {
    const d = new Date(s);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <View style={s.root}>
      <View style={s.safeArea}>
        <GlassView intensity={60} tint="light" style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backText}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerLabel}>{listIcon} {listTitle} · 回忆</Text>
          <View style={s.backBtn} />
        </GlassView>

        {loading ? (
          <View style={s.ld}><ActivityIndicator size="large" color="#9BA4B5" /></View>
        ) : memories.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📖</Text>
            <Text style={s.emptyText}>还没有共同的回忆</Text>
            <Text style={s.emptySub}>完成好事后写下手记，这里就会出现你们的回忆时间线</Text>
          </View>
        ) : (
          <ScrollView style={s.scroll} contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
            {memories.map((m) => {
              const isMe = m.author_uid !== partnerUid;
              const media = (() => { try { return JSON.parse(m.media_uris || '[]'); } catch { return []; } })();
              return (
                <View key={m.id} style={s.card}>
                  <View style={s.cardHead}>
                    <Text style={s.cardAuthor}>{isMe ? '👤 我' : '💕 Ta'}</Text>
                    <Text style={s.cardDate}>{formatDate(m.created_at)}</Text>
                  </View>
                  {m.memory_text ? <Text style={s.cardText}>{m.memory_text}</Text> : null}
                  {media.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.mediaRow}>
                      {media.map((uri: string, idx: number) => (
                        <Image key={idx} source={{ uri }} style={s.thumb} />
                      ))}
                    </ScrollView>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8ECF1' },
  safeArea: { flex: 1, paddingTop: SAFE_TOP },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 12,
    borderRadius: 32, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.55)',
  },
  backBtn: { width: 36, height: 36 },
  backText: { fontSize: 20, color: '#2D3436', fontWeight: '600' },
  headerLabel: { fontSize: 17, fontWeight: '700', color: '#2D3436' },
  ld: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#636E72', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#7A8A9E', textAlign: 'center', lineHeight: 20 },
  scroll: { flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 60 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#4A5568', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardAuthor: { fontSize: 14, fontWeight: '700', color: '#2D3436' },
  cardDate: { fontSize: 12, color: '#7A8A9E' },
  cardText: { fontSize: 15, color: '#2D3436', lineHeight: 22, marginBottom: 8 },
  mediaRow: { marginTop: 4 },
  thumb: { width: 120, height: 120, borderRadius: 12, marginRight: 8, backgroundColor: '#E8ECF1' },
});