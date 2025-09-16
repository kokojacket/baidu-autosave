<template>
  <nav class="app-bottom-nav">
    <div class="nav-content">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
      >
        <div class="nav-icon">
          <el-badge
            v-if="item.badge && item.badge > 0"
            :value="item.badge"
            :max="99"
            :hidden="false"
          >
            <el-icon size="20">
              <component :is="iconComponents[item.icon]" />
            </el-icon>
          </el-badge>
          <el-icon v-else size="20">
            <component :is="iconComponents[item.icon]" />
          </el-icon>
        </div>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
      
      <!-- 添加按钮 -->
      <div class="nav-item add-btn" @click="showAddTaskDialog">
        <div class="nav-icon add-icon">
          <el-icon size="24"><Plus /></el-icon>
        </div>
        <span class="nav-label">添加</span>
      </div>
    </div>
    
    <!-- 背景安全区域 -->
    <div class="safe-area-padding"></div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useTaskStore, useUserStore } from '@/stores'
import { Plus, Odometer, List, User, Setting } from '@element-plus/icons-vue'

// Props & Emits
interface Emits {
  (e: 'add-task'): void
}

const emit = defineEmits<Emits>()

// 注册图标组件以供动态使用
const iconComponents = {
  Odometer,
  List,
  User,
  Setting
}

// Composables
const route = useRoute()
const taskStore = useTaskStore()
const userStore = useUserStore()

// Store 数据
const { taskStats } = storeToRefs(taskStore)
const { userStats } = storeToRefs(userStore)

// 导航项目
const navItems = computed(() => [
  {
    path: '/dashboard',
    icon: 'Odometer',
    label: '首页',
    badge: 0
  },
  {
    path: '/tasks',
    icon: 'List',
    label: '任务',
    badge: taskStats.value.running
  },
  {
    path: '/users',
    icon: 'User',
    label: '用户',
    badge: userStats.value.invalid
  },
  {
    path: '/settings',
    icon: 'Setting',
    label: '设置',
    badge: 0
  }
])

// 方法
const isActive = (path: string) => {
  return route.path === path || (path !== '/' && route.path.startsWith(path))
}

const showAddTaskDialog = () => {
  emit('add-task')
}
</script>

<style scoped>
.app-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: #fff;
  border-top: 1px solid #e4e7ed;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.nav-content {
  display: flex;
  align-items: center;
  height: 60px;
  padding: 0 8px;
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  border-radius: 8px;
  text-decoration: none;
  color: #909399;
  transition: all 0.3s ease;
  position: relative;
  min-width: 0;
}

.nav-item:hover {
  background-color: #f5f7fa;
}

.nav-item.active {
  color: #409eff;
  background-color: #409eff0a;
}

.nav-item.add-btn {
  cursor: pointer;
  color: #409eff;
}

.nav-item.add-btn:hover {
  background-color: #409eff1a;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
  position: relative;
}

.add-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #409eff, #67c23a);
  border-radius: 50%;
  color: white;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
  transform: scale(0.9);
  transition: transform 0.2s ease;
}

.add-btn:active .add-icon {
  transform: scale(0.85);
}

.nav-label {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.add-btn .nav-label {
  font-size: 10px;
}

.safe-area-padding {
  height: env(safe-area-inset-bottom, 0);
  background: #fff;
}

/* 活跃状态动画 */
.nav-item.active::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 2px;
  background: #409eff;
  border-radius: 1px;
}

/* 徽章样式优化 */
.nav-item :deep(.el-badge__content) {
  font-size: 10px;
  padding: 0 4px;
  height: 16px;
  line-height: 16px;
  min-width: 16px;
  border: 1px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* 响应式调整 - 统一断点 */
@media (max-width: 1200px) {
  .app-bottom-nav {
    display: block;
  }
}

@media (min-width: 1201px) {
  .app-bottom-nav {
    display: none;
  }
}

@media (max-width: 375px) {
  .nav-content {
    padding: 0 4px;
  }
  
  .nav-item {
    padding: 4px 2px;
  }
  
  .nav-label {
    font-size: 10px;
  }
  
  .add-icon {
    width: 32px;
    height: 32px;
  }
  
  .add-icon .el-icon {
    font-size: 20px;
  }
}

@media (max-width: 320px) {
  .nav-label {
    display: none;
  }
  
  .nav-item {
    padding: 8px 2px;
  }
  
  .nav-icon {
    margin-bottom: 0;
  }
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .app-bottom-nav {
    background: rgba(42, 46, 54, 0.95);
    border-top-color: #3c3c3c;
  }
  
  .nav-item:hover {
    background-color: #383838;
  }
  
  .nav-item.active {
    background-color: rgba(64, 158, 255, 0.15);
  }
  
  .safe-area-padding {
    background: rgba(42, 46, 54, 0.95);
  }
}

/* 滑动手势优化 */
@media (hover: none) {
  .nav-item:hover {
    background-color: transparent;
  }
  
  .nav-item:active {
    background-color: #f5f7fa;
    transform: scale(0.95);
  }
  
  .nav-item.add-btn:active {
    background-color: #409eff1a;
  }
}
</style>
