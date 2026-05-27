import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  initDatabase,
  getItemsByList,
  updateItemStatus,
  updateItemTitle,
  deleteItem,
  addItem,
  getAllLists,
  GoodItem,
  GoodList,
} from '../services/database';
import MemoryModal from '../components/MemoryModal';

// 12 色果冻色板
const JELLY_COLORS = [
  { bg: '#FFE0E5', border: '#F0C4CC' }, // 桃粉
  { bg: '#E0EEFF', border: '#C4D8F0' }, // 冰蓝
  { bg: '#D5F5E3', border: '#B8DFC8' }, // 薄荷
  { bg: '#E8E0F0', border: '#D0C4DC' }, // 薰衣草
  { bg: '#FFE8D6', border: '#F0D0B8' }, // 杏橙
  { bg: '#FFF3CD', border: '#F0E0A8' }, // 奶油黄
  { bg: '#D6F0FA', border: '#B8D8F0' }, // 天蓝
  { bg: '#FADDE4', border: '#F0C0CC' }, // 玫瑰
  { bg: '#FEE3D0', border: '#F0CCB4' }, // 蜜桃
  { bg: '#E0EBE3', border: '#C4D4C8' }, // 鼠尾草
  { bg: '#DCEFF5', border: '#BCD4E0' }, // 海雾
  { bg: '#FDE2E7', border: '#F0C8D0' }, // 樱花
];

interface Props {
  listId: string;
  onBack: () => void;
}

export default function ListDetailScreen({ listId, onBack }: Props) {
  const [items, setItems] = useState<GoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GoodItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [listInfo, setListInfo] = useState<GoodList | null>(null);

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [addText, setAddText] = useState('');

  const loadItems = useCallback(async () => {
    const data = await getItemsByList(listId);
    setItems(data);
    // 加载清单信息
    const lists = await getAllLists();
    setListInfo(lists.find((l) => l.id === listId) || null);
    setLoading(false);
  }, [listId]);

  useEffect(() => {
    initDatabase().then(() => loadItems());
  }, [loadItems]);

  // 根据文字长度给一个 hash 到色板
  const getColor = (text: string) => {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return JELLY_COLORS[Math.abs(hash) % JELLY_COLORS.length];
  };

  const handlePress = async (item: GoodItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newStatus = item.status === 'completed' ? 'pending' : 'completed';
    await updateItemStatus(item.id, listId, newStatus);
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, status: newStatus, completedAt: newStatus === 'completed' ? new Date().toISOString() : null }
          : i
      )
    );
    if (newStatus === 'completed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleLongPress = (item: GoodItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(item.title, '选择操作', [
      { text: '编辑标题', onPress: () => { setEditingId(item.id); setEditText(item.title); } },
      { text: '添加手记', onPress: () => { setSelectedItem(item); setModalVisible(true); } },
      { text: '删除', style: 'destructive', onPress: async () => {
          await deleteItem(item.id, listId);
          await loadItems();
        }
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const handleEditSave = async () => {
    if (editingId && editText.trim()) {
      await updateItemTitle(editingId, listId, editText.trim());
      setEditingId(null);
      await loadItems();
    }
  };

  const handleAdd = async () => {
    if (addText.trim()) {
      const limit = listInfo?.itemLimit || 100;
      if (items.length >= limit) {
        Alert.alert('已达上限', `该清单最多${limit}项`);
        return;
      }
      await addItem(listId, addText.trim());
      setAddText('');
      setShowAddInput(false);
      await loadItems();
    }
  };

  if (loading) {
    return (
      <View style={st.loading}>
        <ActivityIndicator size="large" color="#9BA4B5" />
      </View>
    );
  }

  const completedCount = items.filter((i) => i.status === 'completed').length;

  return (
    <View style={st.root}>
      <View style={st.bg} />

      <View style={st.safeArea}>
        {/* 顶栏 */}
        <View style={st.header}>
          <TouchableOpacity onPress={onBack} style={st.backBtn}>
            <Text style={st.backText}>←</Text>
          </TouchableOpacity>
          <View style={st.headerCenter}>
            <Text style={st.headerTitle} numberOfLines={1}>
              {listInfo?.iconEmoji} {listInfo?.title || '清单'}
            </Text>
          </View>
        </View>

        {/* 进度条 */}
        <View style={st.progressBar}>
          <View style={[st.progressFill, { width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` }]} />
        </View>
        <Text style={st.progressText}>{completedCount}/{items.length}</Text>

        {/* 胶囊网格 */}
        <View style={st.pillContainer}>
          {items.map((item, idx) => {
            const color = getColor(item.title);
            const isCompleted = item.status === 'completed';
            const isEditing = editingId === item.id;

            if (isEditing) {
              return (
                <View key={item.id} style={[st.pillEditWrap, { backgroundColor: color.bg, borderColor: color.border }]}>
                  <TextInput
                    style={st.pillEditInput}
                    value={editText}
                    onChangeText={setEditText}
                    autoFocus
                    onBlur={handleEditSave}
                    onSubmitEditing={handleEditSave}
                    returnKeyType="done"
                  />
                </View>
              );
            }

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  st.pill,
                  {
                    backgroundColor: isCompleted ? `${color.bg}44` : color.bg,
                    borderColor: isCompleted ? `${color.border}44` : color.border,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => handlePress(item)}
                onLongPress={() => handleLongPress(item)}
                delayLongPress={400}
              >
                <Text
                  style={[st.pillText, isCompleted && st.pillTextDone]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                {item.memoryText ? <Text style={st.pillDot}>●</Text> : null}
              </TouchableOpacity>
            );
          })}

          {/* 添加按钮胶囊 */}
          {showAddInput ? (
            <View style={st.pillEditWrap}>
              <TextInput
                style={st.pillEditInput}
                placeholder="新事项..."
                placeholderTextColor="#B2BEC3"
                value={addText}
                onChangeText={setAddText}
                autoFocus
                onBlur={() => { if (!addText) setShowAddInput(false); }}
                onSubmitEditing={handleAdd}
                returnKeyType="done"
              />
            </View>
          ) : (
            <TouchableOpacity
              style={[st.pill, st.pillAdd]}
              onPress={() => setShowAddInput(true)}
            >
              <Text style={st.pillAddText}>+ 添加</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 手记弹窗 */}
      <MemoryModal
        visible={modalVisible}
        item={selectedItem}
        onClose={() => { setModalVisible(false); setSelectedItem(null); }}
        onSaved={async () => { setModalVisible(false); setSelectedItem(null); await loadItems(); }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E8ECF1' },
  bg: { ...StyleSheet.absoluteFillObject },
  loading: { flex: 1, backgroundColor: '#E8ECF1', alignItems: 'center', justifyContent: 'center' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 30 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 12,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.65)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(45,52,54,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  backText: { fontSize: 20, color: '#2D3436', fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center', marginRight: 36 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#2D3436' },
  progressBar: {
    height: 2, backgroundColor: 'rgba(45,52,54,0.06)',
    marginHorizontal: 16, marginTop: 8, borderRadius: 1, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#6C7A8D', borderRadius: 1 },
  progressText: {
    fontSize: 11, color: '#7A8A9E', textAlign: 'center', marginTop: 4, marginBottom: 6, fontWeight: '500',
  },
  // 胶囊网格
  pillContainer: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 10, paddingBottom: 40, gap: 6,
    alignContent: 'flex-start',
  },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 999, // 完美圆角药丸
    borderWidth: 1,
    shadowColor: '#4A5568', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 13, fontWeight: '600', color: '#2D3436', maxWidth: 180,
  },
  pillTextDone: {
    textDecorationLine: 'line-through', color: '#B2BEC3', fontWeight: '400',
  },
  pillDot: {
    fontSize: 8, color: '#74B9FF', marginLeft: 4,
  },
  pillAdd: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderColor: 'rgba(45,52,54,0.12)', borderStyle: 'dashed',
  },
  pillAddText: {
    fontSize: 13, fontWeight: '600', color: '#7A8A9E',
  },
  pillEditWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderColor: 'rgba(45,52,54,0.15)',
    alignSelf: 'flex-start',
  },
  pillEditInput: {
    fontSize: 13, fontWeight: '600', color: '#2D3436',
    minWidth: 60, padding: 0,
  },
});