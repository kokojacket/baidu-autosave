<template>
  <div class="app-layout" :class="{ 'mobile-layout': isMobile, 'sidebar-collapsed': isCollapsed }">
    <!-- 桌面端布局 -->
    <template v-if="!isMobile">
      <!-- 侧边栏 -->
      <AppSidebar
        @add-task="handleAddTask"
        @collapse="handleSidebarCollapse"
      />
      
      <!-- 主要内容区域 -->
      <div class="main-wrapper">
        <!-- 顶部导航 -->
        <AppHeader />
        
        <!-- 内容区域 -->
        <main class="main-content">
          <div class="content-container">
            <router-view v-slot="{ Component, route }">
              <Transition
                name="fade-slide"
                mode="out-in"
                appear
              >
                <component
                  :is="Component"
                  :key="route.path"
                  class="page-component"
                />
              </Transition>
            </router-view>
          </div>
        </main>
      </div>
    </template>
    
    <!-- 移动端布局 -->
    <template v-else>
      <!-- 顶部导航 -->
      <AppHeader />
      
      <!-- 主要内容区域 -->
      <main class="mobile-main-content">
        <div class="mobile-content-container">
          <router-view v-slot="{ Component, route }">
            <Transition
              name="fade-slide"
              mode="out-in"
              appear
            >
              <component
                :is="Component"
                :key="route.path"
                class="page-component"
              />
            </Transition>
          </router-view>
        </div>
      </main>
      
      <!-- 底部导航 -->
      <AppBottomNav @add-task="handleAddTask" />
      
      <!-- 移动端侧边栏抽屉已移除，使用底部导航代替 -->
    </template>
    
    <!-- 全局加载遮罩 -->
    <div v-if="globalLoading" class="global-loading">
      <el-icon class="loading-icon"><Loading /></el-icon>
      <p>加载中...</p>
    </div>
    
    
    <!-- 全局消息提示容器 -->
    <div id="message-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore, useTaskStore, useUserStore } from '@/stores'
import { usePolling } from '@/composables/usePolling'
import { isMobile as checkIsMobile } from '@/utils/helpers'
import { appStorage } from '@/utils/storage'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import AppBottomNav from './AppBottomNav.vue'

// Composables
const route = useRoute()
const authStore = useAuthStore()
const taskStore = useTaskStore()
const userStore = useUserStore()
const { isRunning: pollingRunning } = usePolling()

// Store 数据
const { loading: authLoading } = storeToRefs(authStore)
const { loading: taskLoading } = storeToRefs(taskStore)
const { loading: userLoading } = storeToRefs(userStore)

// 响应式状态
const isMobile = ref(checkIsMobile())
const isCollapsed = ref(false)

// 计算属性
const globalLoading = computed(() => {
  return authLoading.value || taskLoading.value || userLoading.value
})

// 方法
const handleAddTask = () => {
  // 触发全局添加任务事件
  window.dispatchEvent(new CustomEvent('global-add-task'))
}

const handleSidebarCollapse = (collapsed: boolean) => {
  isCollapsed.value = collapsed
}

// 移动端侧边栏相关方法已移除，使用底部导航代替

const handleResize = () => {
  const mobile = checkIsMobile()
  if (mobile !== isMobile.value) {
    isMobile.value = mobile
  }
}

const initializeApp = async () => {
  try {
    // 初始化用户数据
    await Promise.all([
      taskStore.fetchTasks(),
      userStore.init()
    ])
  } catch (error) {
    console.error('应用初始化失败:', error)
  }
}

// 生命周期
onMounted(async () => {
  // 恢复侧边栏折叠状态
  const savedCollapsed = appStorage.getItem<boolean>('sidebar-collapsed')
  if (savedCollapsed !== null) {
    isCollapsed.value = savedCollapsed
  }
  
  // 监听窗口大小变化
  window.addEventListener('resize', handleResize)
  
  // 监听认证状态变化，只在用户已认证时初始化应用数据
  watch(
    () => authStore.isLoggedIn,
    async (isLoggedIn) => {
      if (isLoggedIn) {
        await nextTick()
        await initializeApp()
      }
    },
    { immediate: true } // 立即检查当前认证状态
  )
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// 监听路由变化，在移动端关闭侧边栏
const unwatchRoute = route && (() => {
  return route ? null : null // TODO: 实现路由监听
})

onUnmounted(() => {
  if (unwatchRoute) {
    unwatchRoute()
  }
})
</script>

<style scoped>
.app-layout {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background-color: #f5f5f5;
}

/* 桌面端布局 */
.main-wrapper {
  margin-left: 260px;
  transition: margin-left 0.3s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sidebar-collapsed .main-wrapper {
  margin-left: 64px;
}

.main-content {
  flex: 1;
  overflow: hidden;
  margin-top: 60px; /* 头部高度 */
}

.content-container {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 移动端布局 */
.mobile-layout .main-wrapper {
  margin-left: 0;
}

.mobile-main-content {
  height: 100vh;
  padding-top: 60px; /* 头部高度 */
  padding-bottom: 60px; /* 底部导航高度 */
  overflow: hidden;
}

.mobile-content-container {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 页面组件样式 */
.page-component {
  min-height: 100%;
}

/* 过渡动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* 全局加载遮罩 */
.global-loading {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-icon {
  font-size: 32px;
  color: #409eff;
  animation: rotate 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.global-loading p {
  font-size: 14px;
  color: #666;
  margin: 0;
}

/* 移动端侧边栏抽屉样式已移除 */

/* 滚动条样式 */
.content-container::-webkit-scrollbar,
.mobile-content-container::-webkit-scrollbar {
  width: 6px;
}

.content-container::-webkit-scrollbar-track,
.mobile-content-container::-webkit-scrollbar-track {
  background: transparent;
}

.content-container::-webkit-scrollbar-thumb,
.mobile-content-container::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}

.content-container::-webkit-scrollbar-thumb:hover,
.mobile-content-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 响应式断点 - 统一断点保持一致 */
@media (max-width: 1200px) {
  .main-wrapper {
    margin-left: 0;
  }
  
  .sidebar-collapsed .main-wrapper {
    margin-left: 0;
  }
  
  .mobile-main-content {
    padding-top: 60px;
    padding-bottom: 70px; /* 稍微增加底部间距 */
  }
}

/* 确保在移动端隐藏桌面端的侧边栏 */
.mobile-layout .app-sidebar:not(.mobile-sidebar) {
  display: none;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .app-layout {
    background-color: #1a1a1a;
  }
  
  .global-loading {
    background-color: rgba(26, 26, 26, 0.8);
  }
  
  .global-loading p {
    color: #ccc;
  }
}

/* 打印样式 */
@media print {
  .app-sidebar,
  .app-header,
  .app-bottom-nav,
  .global-loading {
    display: none !important;
  }
  
  .main-wrapper {
    margin-left: 0 !important;
  }
  
  .main-content {
    margin-top: 0 !important;
  }
  
  .mobile-main-content {
    padding: 0 !important;
  }
}

/* 无障碍支持 */
@media (prefers-reduced-motion: reduce) {
  .fade-slide-enter-active,
  .fade-slide-leave-active,
  .main-wrapper,
  .loading-icon {
    transition: none !important;
    animation: none !important;
  }
}

/* 高对比度模式 */
@media (prefers-contrast: high) {
  .app-layout {
    background-color: #000;
    color: #fff;
  }
  
  .main-wrapper {
    border: 2px solid #fff;
  }
}
</style>
