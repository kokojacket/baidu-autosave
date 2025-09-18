<template>
  <div id="app">
    <!-- 登录页面使用独立布局 -->
    <template v-if="isLoginPage">
      <router-view />
    </template>
    
    <!-- 其他页面使用主布局 -->
    <template v-else>
      <AppLayout />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore, useVersionStore } from '@/stores'
import AppLayout from '@/components/layout/AppLayout.vue'

const route = useRoute()
const authStore = useAuthStore()
const versionStore = useVersionStore()

// 检查是否是登录页面
const isLoginPage = computed(() => {
  return route.path === '/login'
})

onMounted(async () => {
  // 初始化认证状态
  await authStore.initAuth()
  
  // 异步初始化版本检查，不阻塞应用启动
  versionStore.initVersionCheck()
  
  // 移除初始加载元素（如果存在）
  const appLoading = document.getElementById('app-loading')
  if (appLoading) {
    appLoading.remove()
  }
})
</script>

<style>
/* 全局样式重置 */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  font-family: 'Helvetica Neue', Arial, 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  color: #333;
  background-color: #f5f5f5;
}

#app {
  height: 100vh;
  overflow: hidden;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 响应式断点变量 */
:root {
  --mobile-breakpoint: 768px;
  --tablet-breakpoint: 1024px;
  --desktop-breakpoint: 1200px;
}

/* 通用工具类 */
.text-truncate {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }

.d-flex { display: flex; }
.d-inline-flex { display: inline-flex; }
.d-none { display: none; }
.d-block { display: block; }

.justify-content-center { justify-content: center; }
.justify-content-between { justify-content: space-between; }
.justify-content-end { justify-content: flex-end; }

.align-items-center { align-items: center; }
.align-items-start { align-items: flex-start; }
.align-items-end { align-items: flex-end; }

.flex-1 { flex: 1; }
.flex-grow-1 { flex-grow: 1; }
.flex-shrink-0 { flex-shrink: 0; }

.w-100 { width: 100%; }
.h-100 { height: 100%; }

.mb-0 { margin-bottom: 0; }
.mb-1 { margin-bottom: 8px; }
.mb-2 { margin-bottom: 16px; }
.mb-3 { margin-bottom: 24px; }

.mt-0 { margin-top: 0; }
.mt-1 { margin-top: 8px; }
.mt-2 { margin-top: 16px; }
.mt-3 { margin-top: 24px; }

.p-0 { padding: 0; }
.p-1 { padding: 8px; }
.p-2 { padding: 16px; }
.p-3 { padding: 24px; }

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease;
}

.slide-right-enter-from {
  transform: translateX(100%);
}

.slide-right-leave-to {
  transform: translateX(-100%);
}

/* 移动端样式 */
@media (max-width: 768px) {
  body {
    font-size: 13px;
  }
  
  .d-mobile-none {
    display: none !important;
  }
  
  .d-mobile-block {
    display: block !important;
  }
}

/* 桌面端样式 */
@media (min-width: 769px) {
  .d-desktop-none {
    display: none !important;
  }
  
  .d-desktop-block {
    display: block !important;
  }
}
</style>
