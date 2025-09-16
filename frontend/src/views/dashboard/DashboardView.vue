<template>
  <div class="dashboard">
    <div class="page-header">
      <h1 class="page-title">仪表盘</h1>
      <p class="page-subtitle">欢迎使用百度网盘自动转存工具</p>
    </div>

    <div class="dashboard-content">
      <!-- 统计卡片 -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">
            <el-icon size="24"><List /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ taskStats.total }}</div>
            <div class="stat-label">总任务数</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon running">
            <el-icon size="24"><Loading /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ taskStats.running }}</div>
            <div class="stat-label">运行中</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon success">
            <el-icon size="24"><Check /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ taskStats.success }}</div>
            <div class="stat-label">已完成</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon error">
            <el-icon size="24"><Close /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-number">{{ taskStats.error }}</div>
            <div class="stat-label">失败</div>
          </div>
        </div>
      </div>

      <!-- 快速操作 -->
      <div class="quick-actions">
        <h2 class="section-title">快速操作</h2>
        <div class="action-grid">
          <el-card class="action-card" shadow="hover" @click="goToTasks">
            <div class="action-content">
              <el-icon size="32"><List /></el-icon>
              <h3>任务管理</h3>
              <p>查看和管理所有转存任务</p>
            </div>
          </el-card>
          
          <el-card class="action-card" shadow="hover" @click="goToUsers">
            <div class="action-content">
              <el-icon size="32"><User /></el-icon>
              <h3>用户管理</h3>
              <p>管理百度网盘用户账户</p>
            </div>
          </el-card>
          
          <el-card class="action-card" shadow="hover" @click="goToSettings">
            <div class="action-content">
              <el-icon size="32"><Setting /></el-icon>
              <h3>系统设置</h3>
              <p>配置系统参数和通知</p>
            </div>
          </el-card>
        </div>
      </div>

      <!-- 系统信息 -->
      <div class="system-info">
        <h2 class="section-title">系统信息</h2>
        <el-card>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">当前版本</span>
              <span class="info-value">{{ APP_VERSION }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">当前用户</span>
              <span class="info-value">{{ currentUser || '未知' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">轮询状态</span>
              <span class="info-value" :class="pollingStatus ? 'status-active' : 'status-inactive'">
                {{ pollingStatus ? '运行中' : '已停止' }}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">最新版本</span>
              <span class="info-value">
                {{ latestVersion || '检查中...' }}
                <el-tag v-if="hasUpdate" type="warning" size="small" style="margin-left: 8px">
                  有更新
                </el-tag>
              </span>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useTaskStore, useUserStore, useVersionStore } from '@/stores'
import { usePolling } from '@/composables/usePolling'
import { APP_VERSION } from '@/config/version'

const router = useRouter()
const taskStore = useTaskStore()
const userStore = useUserStore()
const versionStore = useVersionStore()

// 解构store数据
const { taskStats } = storeToRefs(taskStore)
const { currentUser } = storeToRefs(userStore)
const { latestVersion, hasUpdate } = storeToRefs(versionStore)

// 轮询状态
const { isRunning: pollingStatus } = usePolling()

// 导航方法
const goToTasks = () => router.push('/tasks')
const goToUsers = () => router.push('/users')
const goToSettings = () => router.push('/settings')

onMounted(async () => {
  // 获取任务统计数据
  await taskStore.fetchTasks()
  
  // 获取用户信息
  await userStore.fetchUsers()
})
</script>

<style scoped>
.dashboard {
  padding: 24px;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.page-header {
  margin-bottom: 32px;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.page-subtitle {
  font-size: 14px;
  color: #666;
  margin: 0;
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* 统计卡片样式 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.stat-card {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 16px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #409eff;
  color: white;
}

.stat-icon.running {
  background-color: #e6a23c;
}

.stat-icon.success {
  background-color: #67c23a;
}

.stat-icon.error {
  background-color: #f56c6c;
}

.stat-content {
  flex: 1;
}

.stat-number {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #666;
}

/* 快速操作样式 */
.quick-actions {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-bottom: 20px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.action-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.action-card:hover {
  transform: translateY(-2px);
}

.action-content {
  text-align: center;
  padding: 20px;
}

.action-content .el-icon {
  color: #409eff;
  margin-bottom: 12px;
}

.action-content h3 {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.action-content p {
  font-size: 14px;
  color: #666;
  margin: 0;
}

/* 系统信息样式 */
.system-info {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 14px;
  color: #666;
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.status-active {
  color: #67c23a !important;
}

.status-inactive {
  color: #f56c6c !important;
}

/* 响应式设计 - 统一断点为1200px */
@media (max-width: 1200px) {
  .dashboard {
    padding: 16px;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  
  .action-grid {
    grid-template-columns: 1fr;
  }
  
  .info-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .dashboard {
    padding: 12px;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  
  .stat-card {
    padding: 16px;
  }
  
  .page-title {
    font-size: 24px;
  }
}
</style>
