<template>
  <el-dialog
    v-model="visible"
    title="任务执行监控"
    width="800px"
    :before-close="handleClose"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="task-runner-dialog"
  >
    <div class="task-runner-content">
      <!-- 任务基本信息 -->
      <div class="task-info-section">
        <h3 class="section-title">任务信息</h3>
        <div class="task-info-grid">
          <div class="info-item">
            <span class="label">任务名称:</span>
            <span class="value">{{ task?.name || '未命名任务' }}</span>
          </div>
          <div class="info-item">
            <span class="label">保存路径:</span>
            <span class="value">{{ task?.save_dir }}</span>
          </div>
          <div class="info-item">
            <span class="label">执行状态:</span>
            <el-tag :type="getStatusType(currentStatus)" size="default">
              {{ getStatusText(currentStatus) }}
            </el-tag>
          </div>
          <div class="info-item">
            <span class="label">开始时间:</span>
            <span class="value">{{ startTime }}</span>
          </div>
        </div>
      </div>

      <!-- 执行状态 -->
      <div class="status-section">
        <h3 class="section-title">执行状态</h3>
        <div class="status-progress">
          <div class="progress-info">
            <div class="current-message">
              {{ currentMessage || '等待执行...' }}
            </div>
            <div class="elapsed-time">
              执行时间: {{ elapsedTime }}
            </div>
          </div>
          
          <!-- 执行中的进度条 -->
          <div v-if="isRunning" class="progress-bar">
            <el-progress
              :percentage="100"
              :indeterminate="true"
              :duration="3"
              status="success"
            />
          </div>

          <!-- 结果信息 -->
          <div v-if="!isRunning && currentMessage" class="result-info">
            <el-alert
              :type="getAlertType(currentStatus)"
              :title="currentMessage"
              show-icon
              :closable="false"
            />
          </div>
        </div>
      </div>

      <!-- 转存文件列表 -->
      <div v-if="transferredFiles && transferredFiles.length > 0" class="files-section">
        <h3 class="section-title">转存文件 ({{ transferredFiles.length }})</h3>
        <div class="files-list">
          <div
            v-for="(file, index) in transferredFiles"
            :key="index"
            class="file-item"
          >
            <el-icon class="file-icon"><Document /></el-icon>
            <span class="file-name">{{ file.name || file.path || file }}</span>
            <span v-if="file.size" class="file-size">{{ formatFileSize(file.size) }}</span>
          </div>
        </div>
      </div>

      <!-- 执行日志 -->
      <div class="logs-section">
        <h3 class="section-title">
          执行日志
          <el-button
            size="small"
            type="primary"
            text
            @click="refreshLogs"
            :loading="logsLoading"
          >
            刷新日志
          </el-button>
        </h3>
        <div class="logs-container" ref="logsContainer">
          <div v-if="logs.length === 0" class="no-logs">
            暂无日志信息
          </div>
          <div
            v-for="(log, index) in logs"
            :key="index"
            class="log-entry"
            :class="`log-${log.level.toLowerCase()}`"
          >
            <span class="log-time">{{ formatLogTime(log.timestamp) }}</span>
            <span class="log-level">{{ log.level }}</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button
          v-if="isRunning"
          type="warning"
          @click="handleCancel"
          :loading="cancelling"
        >
          取消执行
        </el-button>
        <el-button @click="handleClose">
          {{ isRunning ? '最小化' : '关闭' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Document } from '@element-plus/icons-vue'
import type { Task } from '@/types'
import { getTaskStatusText, formatFileSize } from '@/utils/helpers'
import { apiService } from '@/services/api'

interface Props {
  modelValue: boolean
  task: Task | null
  taskId: number
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'task-completed', task: Task): void
  (e: 'task-cancelled'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 响应式状态
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

// 任务状态
const currentStatus = ref(props.task?.status || 'normal')
const currentMessage = ref(props.task?.message || '')
const startTime = ref('')
const elapsedTime = ref('00:00')
const transferredFiles = ref<any[]>([])

// 日志相关
const logs = ref<any[]>([])
const logsLoading = ref(false)
const logsContainer = ref<HTMLElement>()

// 控制状态
const cancelling = ref(false)
let statusTimer: NodeJS.Timeout | null = null
let timeTimer: NodeJS.Timeout | null = null
let stopDelayTimer: NodeJS.Timeout | null = null
let startTimestamp: Date | null = null
let isStoppingScheduled = false // 防止重复设置停止延迟
let logsRequestId = 0 // 防止日志轮询竞态，丢弃过期响应
let terminalDetectedAt: number | null = null // 终止日志首次出现时间
let lastTerminalLogCount = 0 // 终止日志出现时的日志条数
let terminalStopProcessed = false // 是否已按终止日志完成收尾

// 计算属性
const isRunning = computed(() => currentStatus.value === 'running')

// 方法
const getStatusType = (status: string) => {
  const typeMap: Record<string, string> = {
    normal: 'info',
    running: 'warning', 
    success: 'success',
    error: 'danger'
  }
  return typeMap[status] || 'info'
}

const getStatusText = (status: string) => {
  return getTaskStatusText(status)
}

const getAlertType = (status: string) => {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'error'> = {
    success: 'success',
    error: 'error',
    running: 'warning',
    normal: 'info'
  }
  return typeMap[status] || 'info'
}

const formatLogTime = (timestamp: string) => {
  if (!timestamp) return ''
  
  // 如果是HH:MM:SS格式，直接返回
  if (/^\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    return timestamp
  }
  
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
      return timestamp
    }
    return date.toLocaleTimeString()
  } catch {
    return timestamp
  }
}

const updateElapsedTime = () => {
  if (!startTimestamp) return
  
  const now = new Date()
  const diff = now.getTime() - startTimestamp.getTime()
  const minutes = Math.floor(diff / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  elapsedTime.value = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

const startMonitoring = () => {
  if (!props.task) return
  
  // 重置停止监控状态
  isStoppingScheduled = false
  // 重置日志请求序号，丢弃之前可能未返回的旧请求
  logsRequestId = 0
  // 重置终止检测状态
  terminalDetectedAt = null
  lastTerminalLogCount = 0
  terminalStopProcessed = false
  if (stopDelayTimer) {
    clearTimeout(stopDelayTimer)
    stopDelayTimer = null
  }
  
  // 设置开始时间
  startTimestamp = new Date()
  startTime.value = startTimestamp.toLocaleString()
  currentStatus.value = 'running'
  currentMessage.value = '任务正在执行中...'
  
  // 开始时间计时器
  timeTimer = setInterval(updateElapsedTime, 1000)
  
  // 开始状态轮询 - 使用更频繁的轮询来捕获快速完成的任务
  statusTimer = setInterval(async () => {
    await checkTaskStatus()
    // 监控期间总是刷新日志
    await refreshLogs()
  }, 200) // 每200毫秒检查一次状态，提高实时性
  
  // 立即检查一次状态和日志
  checkTaskStatus()
  refreshLogs()
  
  // 额外的日志轮询 - 确保日志更新及时
  setTimeout(() => {
    refreshLogs()
  }, 100)
  setTimeout(() => {
    refreshLogs()
  }, 300)
}

const checkTaskStatus = async () => {
  if (!props.task) return
  
  try {
    const response = await apiService.getTaskStatus(props.taskId)
    
    if (response.success) {
      const taskData = response.status || response.data
      const oldStatus = currentStatus.value
      
      currentStatus.value = taskData.status
      currentMessage.value = taskData.message || ''
      
      // 如果任务完成，更新转存文件信息
      if (taskData.transferred_files) {
        transferredFiles.value = taskData.transferred_files
      }
      
      // 检查任务是否已完成 (包括直接从pending跳到完成状态的情况)
      const isTaskCompleted = ['success', 'normal', 'error', 'failed', 'completed'].includes(taskData.status)
      const wasTaskCompleted = ['success', 'normal', 'error', 'failed', 'completed'].includes(oldStatus)
      
      // 如果任务状态从运行中或pending变为完成状态，延迟停止监控
      if (!wasTaskCompleted && isTaskCompleted && !isStoppingScheduled) {
        console.log(`任务状态从 ${oldStatus} 变为 ${taskData.status}，准备延迟停止监控`)
        isStoppingScheduled = true
        
        // 任务完成时，延迟停止监控，确保后端日志完全写入
        stopDelayTimer = setTimeout(async () => {
          console.log('延迟时间到，最后刷新日志并停止监控')
          await refreshLogs() // 最后一次刷新日志
          stopMonitoring()    // 然后停止监控
          emit('task-completed', taskData)
          
          // 根据执行结果显示消息
          if (taskData.status === 'success' || (taskData.status === 'normal' && taskData.message?.includes('成功'))) {
            ElMessage.success('任务执行完成')
          } else if (taskData.status === 'error' || taskData.status === 'failed') {
            ElMessage.error('任务执行失败')
          } else if (taskData.status === 'normal') {
            ElMessage.success('任务执行完成')
          }
          
          isStoppingScheduled = false
          stopDelayTimer = null
        }, 6000) // 延迟6秒停止，给后端充足时间写入所有日志
      }
    }
  } catch (error) {
    console.error('检查任务状态失败:', error)
  }
}

const refreshLogs = async () => {
  logsLoading.value = true
  
  try {
    // 获取任务特定的日志
    const currentReqId = ++logsRequestId
    const response = await apiService.getTaskLog(props.taskId)
    
    if (response.success) {
      const newLogs = response.logs || response.data?.logs || []
      // 若在本次请求期间又发起了更新请求，则丢弃当前过期响应
      if (currentReqId !== logsRequestId) {
        return
      }
      // 防止旧响应覆盖新数据，保证日志条数只增不减
      if (newLogs.length < logs.value.length) {
        return
      }
      logs.value = newLogs
      
      // 滚动到底部
      await nextTick()
      if (logsContainer.value) {
        logsContainer.value.scrollTop = logsContainer.value.scrollHeight
      }

      // 基于"终止日志"判断是否可以结束轮询
      // 注意：只检测真正的最终日志，"没有新文件需要转存"会在执行过程中出现，不是最终日志
      const TERMINAL_KEYWORDS = ['任务执行完成', '任务执行失败', '任务执行异常']
      const hasTerminal = newLogs.some((l: any) => typeof l?.message === 'string' && TERMINAL_KEYWORDS.some(k => l.message.includes(k)))
      const now = Date.now()
      if (hasTerminal && !terminalStopProcessed) {
        // 首次或新增日志后重置检测窗口
        if (terminalDetectedAt === null || newLogs.length !== lastTerminalLogCount) {
          terminalDetectedAt = now
          lastTerminalLogCount = newLogs.length
        } else if (now - terminalDetectedAt >= 3000) { // 终止日志稳定>=3s，确保所有日志写入
          terminalStopProcessed = true
          isStoppingScheduled = true
          if (stopDelayTimer) {
            clearTimeout(stopDelayTimer)
            stopDelayTimer = null
          }
          // 最后获取一次最终状态，确保展示一致
          try {
            const st = await apiService.getTaskStatus(props.taskId)
            if (st.success) {
              const taskData = st.status || st.data
              if (taskData) {
                currentStatus.value = taskData.status
                currentMessage.value = taskData.message || ''
                if (taskData.transferred_files) {
                  transferredFiles.value = taskData.transferred_files
                }
                emit('task-completed', taskData)
              }
            }
          } catch {}
          stopMonitoring()
        }
      } else if (!hasTerminal) {
        // 未检测到终止日志，重置检测窗口
        terminalDetectedAt = null
      }
    }
  } catch (error) {
    console.error('获取日志失败:', error)
  } finally {
    logsLoading.value = false
  }
}

const stopMonitoring = () => {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
  
  if (timeTimer) {
    clearInterval(timeTimer)
    timeTimer = null
  }
  
  if (stopDelayTimer) {
    clearTimeout(stopDelayTimer)
    stopDelayTimer = null
  }
  
  isStoppingScheduled = false
  // 使正在进行的日志请求失效，避免关闭后过期响应覆盖UI
  logsRequestId++
}

const handleCancel = async () => {
  // 注意：当前后端没有取消任务的API，这里只是预留接口
  cancelling.value = true
  try {
    ElMessage.warning('任务取消功能暂未实现')
    // TODO: 实现任务取消API
    // await apiService.cancelTask(props.taskId)
    emit('task-cancelled')
  } catch (error) {
    ElMessage.error('取消任务失败')
  } finally {
    cancelling.value = false
  }
}

const handleClose = async () => {
  // 关闭前最后刷新一次日志
  if (currentStatus.value === 'running') {
    await refreshLogs()
  }
  stopMonitoring()
  visible.value = false
}

// 监听器
watch(() => props.modelValue, (newVal) => {
  if (newVal && props.task) {
    startMonitoring()
    refreshLogs()
  } else {
    stopMonitoring()
  }
})

// 生命周期
onUnmounted(() => {
  stopMonitoring()
})
</script>

<style scoped>
.task-runner-dialog {
  --el-dialog-margin-top: 5vh;
}

.task-runner-content {
  max-height: 70vh;
  overflow-y: auto;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-info-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.task-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item .label {
  font-weight: 500;
  color: #606266;
  min-width: 80px;
}

.info-item .value {
  color: #303133;
  word-break: break-all;
}

.status-section {
  margin-bottom: 24px;
}

.status-progress {
  padding: 16px;
  background: white;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.current-message {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.elapsed-time {
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}

.progress-bar {
  margin-bottom: 12px;
}

.result-info {
  margin-top: 12px;
}

.files-section {
  margin-bottom: 24px;
}

.files-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: white;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #f5f7fa;
}

.file-item:last-child {
  border-bottom: none;
}

.file-icon {
  color: #409eff;
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  font-size: 14px;
  color: #303133;
  word-break: break-all;
}

.file-size {
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
}

.logs-section {
  margin-bottom: 16px;
}

.logs-container {
  height: 200px;
  overflow-y: auto;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #f8f9fa;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  padding: 8px;
}

.no-logs {
  text-align: center;
  color: #909399;
  padding: 40px;
}

.log-entry {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px solid #f0f0f0;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-time {
  color: #909399;
  min-width: 60px;
  flex-shrink: 0;
}

.log-level {
  min-width: 50px;
  font-weight: bold;
  flex-shrink: 0;
}

.log-message {
  flex: 1;
  word-break: break-all;
}

.log-info .log-level {
  color: #409eff;
}

.log-warning .log-level {
  color: #e6a23c;
}

.log-error .log-level {
  color: #f56c6c;
}

.log-debug .log-level {
  color: #909399;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .task-runner-dialog {
    --el-dialog-margin-top: 2vh;
  }
  
  :deep(.el-dialog) {
    width: 95vw !important;
    margin: 2vh auto !important;
  }
  
  .task-info-grid {
    grid-template-columns: 1fr;
  }
  
  .progress-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .logs-container {
    font-size: 11px;
  }
}
</style>
