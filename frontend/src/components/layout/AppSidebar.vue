<template>
  <aside class="app-sidebar" :class="{ collapsed: isCollapsed }">
    <div class="sidebar-content">
      <!-- 侧边栏头部 -->
      <div class="sidebar-header">
        <div v-if="!isCollapsed" class="header-content">
          <img src="/favicon/favicon.svg" alt="Logo" class="sidebar-logo" />
          <h2 class="sidebar-title">自动转存</h2>
        </div>
        
        <!-- 折叠按钮 -->
        <el-button
          type="text"
          class="collapse-btn"
          @click="toggleCollapse"
        >
          <el-icon>
            <component :is="isCollapsed ? 'Expand' : 'Fold'" />
          </el-icon>
        </el-button>
      </div>
      
      <!-- 导航菜单 -->
      <nav class="sidebar-nav">
        <el-menu
          :default-active="activeRoute"
          :collapse="isCollapsed"
          :unique-opened="false"
          class="sidebar-menu"
          @select="handleMenuSelect"
        >
          <!-- 仪表盘 -->
          <el-menu-item index="/dashboard" class="menu-item">
            <el-icon><Odometer /></el-icon>
            <template #title>仪表盘</template>
          </el-menu-item>
          
          <!-- 任务管理 -->
          <el-menu-item index="/tasks" class="menu-item">
            <el-icon><List /></el-icon>
            <template #title>
              <span>任务管理</span>
              <el-badge
                v-if="taskStats.running > 0"
                :value="taskStats.running"
                :max="99"
                class="menu-badge"
              />
            </template>
          </el-menu-item>
          
          <!-- 用户管理 -->
          <el-menu-item index="/users" class="menu-item">
            <el-icon><User /></el-icon>
            <template #title>
              <span>用户管理</span>
              <el-tag
                v-if="userStats.invalid > 0"
                type="danger"
                size="small"
                class="menu-tag"
              >
                {{ userStats.invalid }}
              </el-tag>
            </template>
          </el-menu-item>
          
          <!-- 系统设置 -->
          <el-menu-item index="/settings" class="menu-item">
            <el-icon><Setting /></el-icon>
            <template #title>系统设置</template>
          </el-menu-item>
        </el-menu>
      </nav>
      
      <!-- 侧边栏底部 -->
      <div class="sidebar-footer">
        <!-- 系统状态 -->
        <div v-if="!isCollapsed" class="system-status">
          <div class="status-item">
            <span class="status-label">轮询状态</span>
            <el-tag
              :type="pollingStatus ? 'success' : 'danger'"
              size="small"
              class="status-value"
            >
              {{ pollingStatus ? '运行中' : '已停止' }}
            </el-tag>
          </div>
          
          <div v-if="currentUser" class="status-item">
            <span class="status-label">当前用户</span>
            <span class="status-value user-name">{{ currentUser }}</span>
          </div>
          
          <div v-if="userQuota" class="quota-info">
            <div class="quota-text">
              <span class="quota-label">存储空间</span>
              <span class="quota-used">{{ userQuota.used_formatted }}</span>
              <span class="quota-divider">/</span>
              <span class="quota-total">{{ userQuota.total_formatted }}</span>
            </div>
            <el-progress
              :percentage="quotaPercentage"
              :stroke-width="4"
              :show-text="false"
              class="quota-progress"
            />
          </div>
        </div>
        
        <!-- 快捷操作 -->
        <div class="quick-actions">
          <el-tooltip content="添加任务" :disabled="!isCollapsed">
            <el-button
              type="primary"
              :icon="Plus"
              :class="{ 'collapsed-btn': isCollapsed }"
              @click="showAddTaskDialog"
            >
              <span v-if="!isCollapsed">添加任务</span>
            </el-button>
          </el-tooltip>
        </div>
        
        <!-- 版本信息 -->
        <div v-if="!isCollapsed" class="version-section">
          <div class="version-item" @click="handleVersionCheck">
            <span class="version-label">版本</span>
            <el-badge :is-dot="hasUpdate" type="warning">
              <span class="version-number">{{ APP_VERSION }}</span>
            </el-badge>
          </div>
          
          <div v-if="hasUpdate" class="update-notice">
            <el-button type="text" size="small" @click="handleVersionCheck">
              <el-icon><Download /></el-icon>
              发现新版本
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useTaskStore, useUserStore, useVersionStore } from '@/stores'
import { usePolling } from '@/composables/usePolling'
import { APP_VERSION } from '@/config/version'
import { appStorage } from '@/utils/storage'
import { Plus, Odometer, List, User, Setting, Download } from '@element-plus/icons-vue'

// Props & Emits
interface Emits {
  (e: 'add-task'): void
}

const emit = defineEmits<Emits>()

// Composables
const router = useRouter()
const route = useRoute()
const taskStore = useTaskStore()
const userStore = useUserStore()
const versionStore = useVersionStore()

// Store 数据
const { taskStats } = storeToRefs(taskStore)
const { userStats, currentUser, userQuota } = storeToRefs(userStore)
const { hasUpdate } = storeToRefs(versionStore)

// 轮询状态
const { isRunning: pollingStatus } = usePolling()

// 版本检查方法
const handleVersionCheck = () => {
  versionStore.checkForUpdates() // 检查版本
}

// 状态
const isCollapsed = ref(false)

// 计算属性
const activeRoute = computed(() => {
  return route.path
})

const quotaPercentage = computed(() => {
  if (!userQuota.value) return 0
  return Math.round((userQuota.value.used / userQuota.value.total) * 100)
})

// 方法
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
  // 保存折叠状态
  appStorage.setItem('sidebar-collapsed', isCollapsed.value)
}

const handleMenuSelect = (index: string) => {
  router.push(index)
}

const showAddTaskDialog = () => {
  emit('add-task')
}

// 监听路由变化，确保菜单高亮正确
watch(() => route.path, (newPath) => {
  // 如果需要特殊处理子路由，可以在这里添加逻辑
})

// 初始化
onMounted(() => {
  // 恢复折叠状态
  const savedCollapsed = appStorage.getItem<boolean>('sidebar-collapsed')
  if (savedCollapsed !== null) {
    isCollapsed.value = savedCollapsed
  }
  
  // 根据屏幕大小自动折叠
  const handleResize = () => {
    if (window.innerWidth < 1200) {
      isCollapsed.value = true
    }
  }
  
  handleResize()
  window.addEventListener('resize', handleResize)
  
  return () => {
    window.removeEventListener('resize', handleResize)
  }
})
</script>

<style scoped>
.app-sidebar {
  width: 260px;
  height: 100vh;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.05);
  position: fixed;
  top: 0;
  left: 0;
  z-index: 999;
  transition: width 0.3s ease;
  overflow: hidden;
}

.app-sidebar.collapsed {
  width: 64px;
}

.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.sidebar-logo {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
}

.collapse-btn {
  padding: 8px !important;
  flex-shrink: 0;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding-top: 16px;
}

.sidebar-menu {
  border: none;
  background: transparent;
}

.sidebar-menu :deep(.el-menu-item) {
  margin: 0 12px 4px;
  border-radius: 6px;
  height: 44px;
  line-height: 44px;
}

.sidebar-menu :deep(.el-menu-item:hover) {
  background-color: #f5f7fa;
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  background-color: #409eff1a;
  color: #409eff;
}

.sidebar-menu :deep(.el-menu-item .el-icon) {
  width: 20px;
  height: 20px;
  margin-right: 12px;
}

.menu-badge {
  margin-left: 8px;
}

.menu-tag {
  margin-left: 8px;
  transform: scale(0.85);
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #e4e7ed;
  flex-shrink: 0;
}

.system-status {
  margin-bottom: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}

.status-label {
  color: #909399;
  white-space: nowrap;
}

.status-value {
  font-weight: 500;
}

.user-name {
  color: #303133;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quota-info {
  margin-top: 12px;
  padding: 8px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.quota-text {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  margin-bottom: 6px;
}

.quota-label {
  color: #909399;
}

.quota-used {
  color: #409eff;
  font-weight: 500;
}

.quota-divider {
  color: #c0c4cc;
}

.quota-total {
  color: #606266;
}

.quota-progress {
  margin-top: 4px;
}

.quick-actions {
  margin-bottom: 16px;
}

.quick-actions .el-button {
  width: 100%;
  height: 36px;
}

.collapsed-btn {
  width: 36px !important;
  padding: 0 !important;
}

.version-section {
  border-top: 1px solid #f0f0f0;
  padding-top: 12px;
}

.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.version-item:hover {
  background-color: #f5f7fa;
}

.version-label {
  color: #909399;
}

.version-number {
  color: #606266;
  font-family: monospace;
  font-weight: 500;
}

.update-notice {
  margin-top: 8px;
  text-align: center;
}

/* 折叠状态下的样式调整 */
.app-sidebar.collapsed .sidebar-header {
  padding: 0 12px;
}

.app-sidebar.collapsed .sidebar-menu :deep(.el-menu-item) {
  margin: 0 6px 4px;
}

.app-sidebar.collapsed .sidebar-footer {
  padding: 12px 8px;
}

.app-sidebar.collapsed .system-status,
.app-sidebar.collapsed .version-section {
  display: none;
}

/* 滚动条样式 */
.sidebar-nav::-webkit-scrollbar {
  width: 4px;
}

.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 2px;
}

.sidebar-nav::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .app-sidebar {
    transform: translateX(-100%);
    transition: transform 0.3s ease, width 0.3s ease;
  }
  
  .app-sidebar.mobile-open {
    transform: translateX(0);
  }
}
</style>
