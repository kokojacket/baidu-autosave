<template>
  <div class="users-view">
    <div class="page-header">
      <h1 class="page-title">用户管理</h1>
      <el-button type="primary" @click="showAddUserDialog = true">
        <el-icon><Plus /></el-icon>
        添加用户
      </el-button>
    </div>

    <!-- 用户统计 -->
    <div class="stats-section">
      <div class="stat-card">
        <div class="stat-content">
          <div class="stat-number">{{ userStats.total }}</div>
          <div class="stat-label">总用户数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <div class="stat-number">{{ userStats.valid }}</div>
          <div class="stat-label">有效用户</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <div class="stat-number">{{ userStats.invalid }}</div>
          <div class="stat-label">失效用户</div>
        </div>
      </div>
    </div>

    <!-- 用户列表 -->
    <div class="users-list">
      <el-card v-loading="loading">
        <div class="user-grid">
          <div
            v-for="user in users"
            :key="user.username"
            class="user-card"
            :class="{ 'current-user': user.is_current, 'invalid-user': user.cookies_valid === false }"
          >
            <div class="user-header">
              <div class="user-info">
                <h3 class="username">{{ user.username }}</h3>
                <el-tag v-if="user.is_current" type="success" size="small">当前用户</el-tag>
                <el-tag v-else-if="user.cookies_valid === false" type="danger" size="small">失效</el-tag>
              </div>
              <div class="user-actions">
                <el-dropdown trigger="click">
                  <el-button type="text">
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item v-if="!user.is_current" @click="switchUser(user.username)">
                        切换用户
                      </el-dropdown-item>
                      <el-dropdown-item @click="editUser(user)">
                        编辑用户
                      </el-dropdown-item>
                      <el-dropdown-item @click="getUserCookies(user.username)">
                        查看Cookies
                      </el-dropdown-item>
                      <el-dropdown-item 
                        v-if="!user.is_current"
                        @click="deleteUser(user.username)"
                        style="color: #f56c6c"
                      >
                        删除用户
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
            
            <div v-if="user.quota" class="user-quota">
              <div class="quota-info">
                <span class="quota-label">存储空间：</span>
                <span class="quota-value">{{ user.quota.used_formatted }} / {{ user.quota.total_formatted }}</span>
              </div>
              <el-progress 
                :percentage="Math.round((user.quota.used / user.quota.total) * 100)"
                :stroke-width="6"
                :show-text="false"
              />
            </div>
            
            <div v-if="user.last_active" class="user-activity">
              <span class="activity-label">最后活跃：</span>
              <span class="activity-time">{{ formatTime(user.last_active) }}</span>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 添加/编辑用户对话框 -->
    <el-dialog
      v-model="showAddUserDialog"
      :title="editingUser ? '编辑用户' : '添加用户'"
      width="600px"
    >
      <el-form
        ref="userFormRef"
        :model="userForm"
        :rules="userFormRules"
        label-width="100px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input 
            v-model="userForm.username" 
            placeholder="请输入用户名"
            :disabled="!!editingUser"
          />
        </el-form-item>
        
        <el-form-item label="Cookies" prop="cookies">
          <el-input
            v-model="userForm.cookies"
            type="textarea"
            :rows="6"
            placeholder="请输入百度网盘的Cookies..."
          />
          <div class="form-help">
            获取方法：打开百度网盘网页版，按F12打开开发者工具，在Network标签下找到任意请求，复制Cookies值
          </div>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showAddUserDialog = false">取消</el-button>
        <el-button type="primary" @click="handleUserSubmit" :loading="submitting">
          {{ editingUser ? '更新' : '添加' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/users'
import type { User } from '@/types'
import { formatTime } from '@/utils/helpers'

const userStore = useUserStore()
const { users, loading, userStats } = storeToRefs(userStore)

// 表单相关
const showAddUserDialog = ref(false)
const userFormRef = ref<FormInstance>()
const editingUser = ref<User | null>(null)
const submitting = ref(false)

const userForm = ref({
  username: '',
  cookies: ''
})

const userFormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  cookies: [
    { required: true, message: '请输入Cookies', trigger: 'blur' },
    { min: 100, message: 'Cookies长度不能少于100字符', trigger: 'blur' }
  ]
}

// 方法
const switchUser = async (username: string) => {
  try {
    await userStore.switchUser(username)
    ElMessage.success(`已切换到用户：${username}`)
  } catch (error) {
    ElMessage.error(`切换用户失败：${error}`)
  }
}

const editUser = async (user: User) => {
  editingUser.value = user
  
  try {
    // 获取用户的完整cookies信息
    const userCookies = await userStore.getUserCookies(user.username)
    userForm.value = {
      username: user.username,
      cookies: userCookies || '' // 加载现有cookies以供编辑
    }
  } catch (error) {
    // 如果获取cookies失败，使用空字符串
    userForm.value = {
      username: user.username,
      cookies: ''
    }
    console.warn('无法加载用户cookies:', error)
  }
  
  showAddUserDialog.value = true
}

const deleteUser = async (username: string) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除用户 ${username} 吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    await userStore.deleteUser(username)
    ElMessage.success('用户已删除')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(`删除用户失败：${error}`)
    }
  }
}

const getUserCookies = async (username: string) => {
  try {
    const cookies = await userStore.getUserCookies(username)
    
    ElMessageBox.alert(
      cookies,
      `用户 ${username} 的Cookies`,
      {
        confirmButtonText: '复制',
        callback: async () => {
          try {
            await navigator.clipboard.writeText(cookies)
            ElMessage.success('Cookies已复制到剪贴板')
          } catch {
            ElMessage.warning('复制失败，请手动复制')
          }
        }
      }
    )
  } catch (error) {
    ElMessage.error(`获取Cookies失败：${error}`)
  }
}

const handleUserSubmit = async () => {
  if (!userFormRef.value) return

  const valid = await userFormRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true

  try {
    if (editingUser.value) {
      await userStore.updateUser({
        username: editingUser.value.username,
        cookies: userForm.value.cookies
      })
      ElMessage.success('用户信息已更新')
    } else {
      await userStore.addUser(userForm.value)
      ElMessage.success('用户已添加')
    }

    showAddUserDialog.value = false
    resetUserForm()
  } catch (error) {
    ElMessage.error(`操作失败：${error}`)
  } finally {
    submitting.value = false
  }
}

const resetUserForm = () => {
  editingUser.value = null
  userForm.value = {
    username: '',
    cookies: ''
  }
  userFormRef.value?.resetFields()
}

onMounted(async () => {
  await userStore.init()
})
</script>

<style scoped>
.users-view {
  padding: 24px;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.stats-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.stat-number {
  font-size: 28px;
  font-weight: 600;
  color: #409eff;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: #666;
}

.users-list {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.user-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  padding: 20px;
}

.user-card {
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  padding: 20px;
  transition: all 0.3s;
}

.user-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.1);
}

.user-card.current-user {
  border-color: #67c23a;
  background-color: #f0f9ff;
}

.user-card.invalid-user {
  border-color: #f56c6c;
  background-color: #fef0f0;
}

.user-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.user-info {
  flex: 1;
}

.username {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.user-quota {
  margin-bottom: 12px;
}

.quota-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
}

.quota-label {
  color: #666;
}

.quota-value {
  font-weight: 500;
  color: #333;
}

.user-activity {
  font-size: 12px;
  color: #999;
}

.activity-label {
  margin-right: 4px;
}

.form-help {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .users-view {
    padding: 16px;
  }
  
  .page-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  
  .user-grid {
    grid-template-columns: 1fr;
    padding: 16px;
    gap: 16px;
  }
}
</style>
