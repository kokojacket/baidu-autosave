<template>
  <header class="app-header">
    <div class="header-content">
      <!-- 左侧：Logo和标题 -->
      <div class="header-left">
        <div class="logo-area">
          <img src="/favicon/favicon.svg" alt="Logo" class="app-logo" />
          <h1 class="app-title">百度网盘自动转存</h1>
        </div>
        
        <!-- 移动端菜单按钮已移除，使用底部导航代替 -->
      </div>
      
      <!-- 右侧：用户信息和操作 -->
      <div class="header-right">
        <!-- 版本信息 -->
        <div class="version-info" @click="handleVersionCheck">
          <el-badge :is-dot="hasUpdate" type="warning">
            <span class="version-text">{{ APP_VERSION }}</span>
          </el-badge>
        </div>
        
        <!-- 轮询状态 -->
        <div class="polling-status">
          <el-tooltip :content="pollingStatus ? '轮询运行中' : '轮询已停止'">
            <el-icon 
              :class="['polling-icon', { 'active': pollingStatus, 'inactive': !pollingStatus }]"
              size="16"
            >
              <Connection />
            </el-icon>
          </el-tooltip>
        </div>
        
        <!-- 当前用户 -->
        <el-dropdown v-if="currentUser" trigger="click" class="user-dropdown">
          <div class="user-info">
            <el-avatar :size="32" class="user-avatar">
              <el-icon><User /></el-icon>
            </el-avatar>
            <span class="username">{{ currentUser }}</span>
            <el-icon class="dropdown-arrow"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="goToUsers">
                <el-icon><User /></el-icon>
                用户管理
              </el-dropdown-item>
              <el-dropdown-item @click="goToSettings">
                <el-icon><Setting /></el-icon>
                系统设置
              </el-dropdown-item>
              <el-dropdown-item divided @click="logout">
                <el-icon><SwitchButton /></el-icon>
                退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        
        <!-- 通知按钮 -->
        <el-button type="text" class="notification-btn" @click="showNotifications = true">
          <el-badge :value="unreadCount" :hidden="unreadCount === 0" :max="99">
            <el-icon size="18"><Bell /></el-icon>
          </el-badge>
        </el-button>
      </div>
    </div>
    
    <!-- 移动端菜单抽屉已移除，使用底部导航代替 -->
    
    <!-- 通知面板 -->
    <el-drawer
      v-model="showNotifications"
      title="通知中心"
      direction="rtl"
      size="320px"
      class="notification-drawer"
    >
      <div class="notification-content">
        <div v-if="notifications.length === 0" class="empty-notifications">
          <el-icon size="48" color="#c0c4cc"><Bell /></el-icon>
          <p>暂无通知</p>
        </div>
        
        <div v-else class="notification-list">
          <div
            v-for="notification in notifications"
            :key="notification.id"
            class="notification-item"
            :class="{ 'unread': !notification.read }"
          >
            <div class="notification-icon">
              <el-icon :color="getNotificationColor(notification.type)">
                <component :is="getNotificationIcon(notification.type)" />
              </el-icon>
            </div>
            <div class="notification-body">
              <h4 class="notification-title">{{ notification.title }}</h4>
              <p class="notification-message">{{ notification.message }}</p>
              <span class="notification-time">{{ formatTime(notification.time) }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore, useUserStore, useVersionStore } from '@/stores'
import { usePolling } from '@/composables/usePolling'
import { getMenuRoutes } from '@/router'
import { APP_VERSION } from '@/config/version'
import { formatTime, isMobile as checkIsMobile } from '@/utils/helpers'
import { ElMessage, ElMessageBox } from 'element-plus'

// Props & Emits - 移动端菜单相关的emit已移除

// Composables
const router = useRouter()
const authStore = useAuthStore()
const userStore = useUserStore()
const versionStore = useVersionStore()
const { currentUser } = storeToRefs(userStore)
const { hasUpdate } = storeToRefs(versionStore)
const { isRunning: pollingStatus } = usePolling()

// 版本检查方法
const handleVersionCheck = () => {
  versionStore.checkForUpdates() // 检查版本
}

// 响应式状态
const isMobile = ref(checkIsMobile())
const showNotifications = ref(false)
const unreadCount = ref(0)
const notifications = ref<any[]>([])

// 方法

const logout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '确认退出', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await authStore.logout()
    ElMessage.success('已退出登录')
    await router.push('/login')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('退出登录失败')
    }
  }
}

const goToUsers = () => {
  router.push('/users')
}

const goToSettings = () => {
  router.push('/settings')
}

const getNotificationColor = (type: string) => {
  const colors = {
    success: '#67c23a',
    warning: '#e6a23c',
    error: '#f56c6c',
    info: '#409eff'
  }
  return colors[type as keyof typeof colors] || '#909399'
}

const getNotificationIcon = (type: string) => {
  const icons = {
    success: 'Check',
    warning: 'Warning',
    error: 'Close',
    info: 'InfoFilled'
  }
  return icons[type as keyof typeof icons] || 'Bell'
}

// 响应式监听
const handleResize = () => {
  isMobile.value = checkIsMobile()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  
  // 初始化通知数据（模拟）
  // 实际项目中应该从API获取
  
  return () => {
    window.removeEventListener('resize', handleResize)
  }
})
</script>

<style scoped>
.app-header {
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
}

.header-content {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  max-width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-logo {
  width: 32px;
  height: 32px;
}

.app-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

/* 移动端菜单按钮样式已移除 */

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.version-info {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.version-info:hover {
  background-color: #f5f7fa;
}

.version-text {
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}

.polling-status {
  display: flex;
  align-items: center;
}

.polling-icon {
  transition: color 0.3s;
}

.polling-icon.active {
  color: #67c23a;
  animation: pulse 2s infinite;
}

.polling-icon.inactive {
  color: #f56c6c;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.user-dropdown {
  cursor: pointer;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.user-info:hover {
  background-color: #f5f7fa;
}

.username {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.dropdown-arrow {
  font-size: 12px;
  color: #909399;
}

.notification-btn {
  padding: 8px !important;
}

/* 移动端菜单样式已移除，使用底部导航代替 */

/* 通知面板样式 */
.notification-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.empty-notifications {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.empty-notifications p {
  color: #909399;
  margin: 0;
}

.notification-list {
  flex: 1;
  overflow-y: auto;
}

.notification-item {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.3s;
}

.notification-item:hover {
  background-color: #f8f9fa;
}

.notification-item.unread {
  background-color: #f0f9ff;
}

.notification-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.notification-body {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 4px 0;
}

.notification-message {
  font-size: 13px;
  color: #606266;
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.notification-time {
  font-size: 12px;
  color: #909399;
}

/* 响应式设计 - 统一断点与JavaScript保持一致 */
@media (max-width: 1200px) {
  .header-content {
    padding: 0 16px;
  }
  
  .app-title {
    font-size: 16px;
  }
  
  .header-right {
    gap: 12px;
  }
  
  .user-info .username {
    display: none;
  }
}

@media (max-width: 480px) {
  .header-content {
    padding: 0 12px;
  }
  
  .logo-area .app-title {
    display: none;
  }
  
  .header-right {
    gap: 8px;
  }
  
  .version-info {
    display: none;
  }
}
</style>
