const fs = require('fs');
let f = fs.readFileSync('src/screens/SettingsScreen.tsx', 'utf8');

// 1. Face ID → 快速验证
f = f.replace('Face ID 快捷登录', '快速验证');
f = f.replace('开启后可用 Face ID 快速登录', '开启后可用设备锁/生物识别快速验证');

// 2. Hide backup/restore buttons
f = f.replace(
  '<TouchableOpacity onPress={handleBackup} disabled={busy}><Text style={ss.linkText}>📤 备份</Text></TouchableOpacity>\n                  <TouchableOpacity onPress={handleRestore} disabled={busy}><Text style={ss.linkText}>📥 恢复</Text></TouchableOpacity>\n                  ',
  ''
);

// 3. Replace couple section with placeholder
const oldCouple = `<View style={{ marginBottom: 20 }}><Text style={ss.sectionTitle}>伴侣</Text>{!userId ? <View style={ss.hintCard}><Text style={ss.hintText}>登录后可以绑定伴侣</Text></View> : partnered ? (<View style={ss.row}><View style={ss.userInfo}><Text style={ss.userIcon}>💕</Text><View><Text style={ss.userLabel}>已绑定伴侣</Text></View></View><TouchableOpacity style={ss.logoutBtn} onPress={handleUnbind}><Text style={ss.logoutText}>解除</Text></TouchableOpacity></View>) : (<View style={ss.coupleActions}><TouchableOpacity style={[ss.actionBtn, busy && ss.actionBtnDisabled]} onPress={handleCreateInvite} disabled={busy}><Text style={ss.actionBtnText}>🔗 生成邀请码</Text></TouchableOpacity><View style={ss.appleSep}><View style={ss.appleSepLine} /><Text style={ss.appleSepText}> 或输入邀请码 </Text><View style={ss.appleSepLine} /></View><View style={ss.inviteRow}><TextInput style={ss.claimInput} placeholder="输入邀请码" placeholderTextColor="#B2BEC3" value={claimCode} onChangeText={setClaimCode} autoCapitalize="none" autoCorrect={false} /><TouchableOpacity style={[ss.claimBtn, busy && ss.actionBtnDisabled]} onPress={handleClaimInvite} disabled={busy}><Text style={ss.claimBtnText}>绑定</Text></TouchableOpacity></View></View>)}</View>`;

const newCouple = `<View style={{ marginBottom: 20 }}><Text style={ss.sectionTitle}>👥 共享清单</Text>{!userId ? <View style={ss.hintCard}><Text style={ss.hintText}>登录后可管理共享清单</Text></View> : <View style={ss.hintCard}><Text style={ss.hintText}>长按首页清单卡片 → 「👥 共享管理」开启</Text></View>}</View>`;

f = f.replace(oldCouple, newCouple);

// 4. Remove unused handleBackup/handleRestore/handleCreateInvite/handleClaimInvite/handleUnbind imports? No, keep them for backward compat.

fs.writeFileSync('src/screens/SettingsScreen.tsx', f);
console.log('SettingsScreen fixes applied');