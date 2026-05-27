import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  initDatabase,
  getAllLists,
  createList,
  deleteList,
  bulkInsertItems,
  getItemCount,
  GoodList,
} from '../services/database';
import { TEMPLATES, TEMPLATE_LIST } from '../services/templates';

interface Props {
  onSelectList: (listId: string) => void;
  onGoSettings: () => void;
}

export default function ListHomeScreen({ onSelectList, onGoSettings }: Props) {
  const [lists, setLists] = useState<GoodList[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('love');
  const [selectedLimit, setSelectedLimit] = useState(100);

  const loadLists = useCallback(async () => {
    const data = await getAllLists();
    setLists(data);
    // 加载每个 list 的条目数
    const counts: Record<string, number> = {};
    for (const l of data) {
      counts[l.id] = await getItemCount(l.id);
    }
    setItemCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    initDatabase().then(() => loadLists());
  }, [loadLists]);

  const handleCreate = async () => {
    const tpl = TEMPLATES[selectedTemplate];
    const id = `list_${Date.now()}`;
    const title = newTitle.trim() || TEMPLATE_LIST.find((t) => t.key === selectedTemplate)?.title || '新建清单';

    await createList(id, title, tpl.themeType, tpl.iconEmoji, tpl.coverColor, selectedLimit);
    if (tpl.items.length > 0) {
      const limited = tpl.items.slice(0, selectedLimit);
      await bulkInsertItems(id, limited);
    }

    setShowCreate(false);
    setNewTitle('');
    await loadLists();
  };

  const handleDelete = (item: GoodList) => {
    Alert.alert('删除清单', `确定要删除「${item.title}」吗？这将同时删除其中的所有事项。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteList(item.id);
          await loadLists();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color="#9BA4B5" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.bgGradient}>
        <View style={s.bgCircle1} />
        <View style={s.bgCircle2} />
      </View>

      <View style={s.safeArea}>
        {/* 顶部 */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>好事100</Text>
            <Text style={s.headerSub}>
              {lists.length === 0 ? '创建你的第一个清单吧 ✨' : `${lists.length} 个清单`}
            </Text>
          </View>
          <TouchableOpacity style={s.settingsBtn} onPress={onGoSettings}>
            <Text style={s.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* 清单网格 */}
        {lists.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📋</Text>
            <Text style={s.emptyText}>还没有清单</Text>
            <Text style={s.emptyHint}>点击下方按钮创建</Text>
          </View>
        ) : (
          <FlatList
            data={lists}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={s.listContent}
            renderItem={({ item }) => {
              const count = itemCounts[item.id] || 0;
              const progress = item.itemLimit > 0 ? count / item.itemLimit : 0;
              return (
                <TouchableOpacity
                  style={[s.card, { backgroundColor: item.coverColor + '88' }]}
                  activeOpacity={0.7}
                  onPress={() => onSelectList(item.id)}
                  onLongPress={() => handleDelete(item)}
                >
                  <Text style={s.cardIcon}>{item.iconEmoji}</Text>
                  <Text style={s.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={s.cardProgressBar}>
                    <View style={[s.cardProgressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
                  </View>
                  <Text style={s.cardCount}>
                    {count}/{item.itemLimit}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* FAB 按钮 */}
        <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)}>
          <Text style={s.fabText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* 新建清单弹窗 */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>新建清单</Text>

            <TextInput
              style={s.input}
              placeholder="清单名称（可选）"
              placeholderTextColor="#B2BEC3"
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <Text style={s.sectionLabel}>选择主题模板</Text>
            <View style={s.templateGrid}>
              {TEMPLATE_LIST.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[s.templateItem, selectedTemplate === t.key && s.templateItemSelected]}
                  onPress={() => setSelectedTemplate(t.key)}
                >
                  <Text style={s.templateIcon}>{t.icon}</Text>
                  <Text style={s.templateName}>{t.title}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.sectionLabel}>数量上限</Text>
            <View style={s.limitRow}>
              {[10, 50, 100].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[s.limitBtn, selectedLimit === n && s.limitBtnSelected]}
                  onPress={() => setSelectedLimit(n)}
                >
                  <Text style={[s.limitText, selectedLimit === n && s.limitTextSelected]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={s.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.createBtn} onPress={handleCreate}>
                <Text style={s.createBtnText}>创建</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8ECF1' },
  bgGradient: { ...StyleSheet.absoluteFillObject },
  bgCircle1: {
    position: 'absolute', top: -80, right: -60,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: '#C8D6E5', opacity: 0.35,
  },
  bgCircle2: {
    position: 'absolute', bottom: 100, left: -80,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#B8C9DD', opacity: 0.25,
  },
  loading: { flex: 1, backgroundColor: '#E8ECF1', alignItems: 'center', justifyContent: 'center' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, marginHorizontal: 12, marginBottom: 8,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.65)',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#2D3436', letterSpacing: 3 },
  headerSub: { fontSize: 13, color: '#636E72', marginTop: 2, fontWeight: '500' },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(45,52,54,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  settingsIcon: { fontSize: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#636E72' },
  emptyHint: { fontSize: 14, color: '#7A8A9E' },
  listContent: { paddingHorizontal: 12, paddingBottom: 100, gap: 10 },
  card: {
    flex: 1, margin: 5, borderRadius: 20, padding: 16,
    minHeight: 130, justifyContent: 'space-between',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#4A5568', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardIcon: { fontSize: 28, marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#2D3436', flex: 1 },
  cardProgressBar: {
    height: 3, backgroundColor: 'rgba(45,52,54,0.08)', borderRadius: 1.5, marginTop: 8, overflow: 'hidden',
  },
  cardProgressFill: { height: '100%', backgroundColor: 'rgba(45,52,54,0.4)', borderRadius: 1.5 },
  cardCount: { fontSize: 11, color: '#7A8A9E', marginTop: 4, fontWeight: '600' },
  fab: {
    position: 'absolute', bottom: 30, right: 24,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#2D3436', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  fabText: { fontSize: 30, color: '#FFF', marginTop: -2 },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#F5F0EB', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, maxHeight: '80%',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#2D3436', marginBottom: 16 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 14, padding: 14,
    fontSize: 16, color: '#2D3436', marginBottom: 16,
  },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#636E72', marginBottom: 8 },
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  templateItem: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.6)', flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  templateItemSelected: { backgroundColor: '#2D343618', borderWidth: 1, borderColor: '#2D343630' },
  templateIcon: { fontSize: 18 },
  templateName: { fontSize: 13, fontWeight: '600', color: '#2D3436' },
  limitRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  limitBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center',
  },
  limitBtnSelected: { backgroundColor: '#2D3436' },
  limitText: { fontSize: 15, fontWeight: '600', color: '#636E72' },
  limitTextSelected: { color: '#FFF' },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#636E72' },
  createBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#2D3436', alignItems: 'center',
  },
  createBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});