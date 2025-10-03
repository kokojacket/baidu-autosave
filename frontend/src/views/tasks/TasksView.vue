<template>
  <div class="tasks-view">
    <div class="page-header">
      <h1 class="page-title">任务管理</h1>
      <div class="header-actions">
        <el-button type="primary" @click="addTask">
          <el-icon><Plus /></el-icon>
          添加任务
        </el-button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchQuery"
          placeholder="搜索任务..."
          clearable
          style="width: 300px"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        
        <el-select v-model="statusFilter" placeholder="状态筛选" style="width: 120px">
          <el-option label="全部" value="all" />
          <el-option label="正常" value="normal" />
          <el-option label="运行中" value="running" />
          <el-option label="成功" value="success" />
          <el-option label="错误" value="error" />
        </el-select>
        
        <el-select v-model="categoryFilter" placeholder="分类筛选" style="width: 140px">
          <el-option label="全部分类" value="all" />
          <el-option 
            v-for="category in uniqueCategories" 
            :key="category" 
            :label="category" 
            :value="category" 
          />
        </el-select>
        
        <el-button @click="toggleSortOrder" :type="isReversed ? 'primary' : ''" size="default">
          <el-icon><Sort /></el-icon>
          {{ isReversed ? '倒序' : '正序' }}
        </el-button>
        
        <el-tooltip content="列设置" placement="top">
          <el-button @click="showColumnSettings = true" size="default">
            <el-icon><Setting /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
      
      <div class="toolbar-right">
        <el-button-group v-if="selectedTasks.length > 0">
          <el-button @click="executeBatchTasks">
            <el-icon><VideoPlay /></el-icon>
            批量执行 ({{ selectedTasks.length }})
          </el-button>
          <el-button @click="deleteBatchTasks">
            <el-icon><Delete /></el-icon>
            批量删除
          </el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 任务列表 -->
    <div class="task-list-container">
      <!-- 桌面端表格 -->
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="filteredTasks"
        stripe
        row-key="order"
        :key="tableKey"
        @selection-change="handleSelectionChange"
        class="desktop-table"
      >
        <el-table-column type="selection" class-name="col-selection" />
        
        <!-- 拖拽手柄列 -->
        <el-table-column label="排序" class-name="col-drag" align="center">
          <template #default>
            <div class="drag-handle" :class="{ 'dragging': isDragging }">
              <el-icon><DCaret /></el-icon>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="order" label="序号" class-name="col-order" v-if="columnVisible.order" />
        
        <el-table-column prop="name" label="任务名称" class-name="col-name" v-if="columnVisible.name">
          <template #default="{ row }">
            <div class="task-name">
              <a 
                :href="getFullSourceLink(row)" 
                target="_blank" 
                class="source-link"
                :title="`完整转存链接: ${getFullSourceLink(row)}`"
              >
                {{ row.name || '未命名任务' }}
                <el-icon class="link-icon"><Link /></el-icon>
              </a>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="分享链接" class-name="col-share" v-if="columnVisible.shareLink">
          <template #default="{ row }">
            <div class="share-link-container">
              <template v-if="row.share_info">
                <a 
                  :href="getFullShareLink(row.share_info)" 
                  target="_blank"
                  class="share-link"
                  :title="`分享链接: ${getFullShareLink(row.share_info)}`"
                >
                  {{ getFullShareLink(row.share_info) }}
                  <el-icon class="copy-icon" @click.prevent="copyShareLink(row.share_info)">
                    <CopyDocument />
                  </el-icon>
                </a>
              </template>
              <span v-else class="no-share">未生成分享链接</span>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="save_dir" label="保存路径" class-name="col-savedir" v-if="columnVisible.saveDir">
          <template #default="{ row }">
            <div class="save-dir text-truncate" :title="row.save_dir">
              {{ row.save_dir }}
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="category" label="分类" class-name="col-category" v-if="columnVisible.category">
          <template #default="{ row }">
            <div class="task-category">
              <el-tag v-if="row.category" size="small" type="primary">
                {{ row.category }}
              </el-tag>
              <span v-else class="text-muted">-</span>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="status" label="状态" class-name="col-status" v-if="columnVisible.status">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="message" label="消息" class-name="col-message" v-if="columnVisible.message">
          <template #default="{ row }">
            <div class="task-message text-truncate" :title="row.message">
              {{ row.message || '-' }}
            </div>
          </template>
        </el-table-column>
        
        <!-- 定时规则列 -->
        <el-table-column label="定时规则" class-name="col-cron" v-if="columnVisible.cron">
          <template #default="{ row }">
            <div class="cron-display">
              <el-tag v-if="row.cron" size="small" type="warning">
                {{ row.cron }}
              </el-tag>
              <span v-else class="text-muted">使用默认</span>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" class-name="col-actions">
          <template #default="{ row }">
            <el-button-group size="small">
              <el-button 
                type="primary" 
                @click="executeTask(row.order - 1)"
                :disabled="row.status === 'running'"
              >
                <el-icon><VideoPlay /></el-icon>
              </el-button>
              
              <el-button @click="editTask(row)">
                <el-icon><Edit /></el-icon>
              </el-button>
              
              <el-button @click="shareTask(row.order - 1)">
                <el-icon><Share /></el-icon>
              </el-button>
              
              <el-button 
                type="danger" 
                @click="deleteTask(row.order - 1)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 移动端卡片布局 -->
      <div class="mobile-cards" v-loading="loading">
        <div v-if="filteredTasks.length === 0" class="empty-state">
          <div class="empty-text">暂无任务</div>
        </div>
        <div 
          v-for="task in filteredTasks" 
          :key="task.order"
          class="task-card"
        >
          <div class="task-card-body">
            <!-- 卡片头部 -->
            <div class="card-header">
              <div class="task-info">
                <h4 class="task-name">
                  <a 
                    :href="getFullSourceLink(task)" 
                    target="_blank" 
                    class="source-link"
                  >
                    {{ task.name || '未命名任务' }}
                    <el-icon class="link-icon"><Link /></el-icon>
                  </a>
                </h4>
                <div class="task-order">#{{ task.order }}</div>
              </div>
              <el-tag :type="getStatusType(task.status)" size="default">
                {{ getStatusText(task.status) }}
              </el-tag>
            </div>
            
            <!-- 卡片内容 -->
            <div class="card-content">
              <div class="content-row">
                <span class="label">保存路径:</span>
                <span class="value">{{ task.save_dir }}</span>
              </div>
              
              <div class="content-row" v-if="task.category">
                <span class="label">分类:</span>
                <span class="value">{{ task.category }}</span>
              </div>
              
              <div class="content-row" v-if="task.message">
                <span class="label">消息:</span>
                <span class="value">{{ task.message }}</span>
              </div>
              
              <!-- 高级功能标签 -->
              <div class="content-row" v-if="task.cron || task.regex_pattern || task.regex_replace">
                <span class="label">高级功能:</span>
                <div class="advanced-tags">
                  <el-tag v-if="task.cron" size="small" type="warning">定时</el-tag>
                  <el-tag v-if="task.regex_pattern" size="small" type="info">过滤</el-tag>
                  <el-tag v-if="task.regex_replace" size="small" type="success">重命名</el-tag>
                </div>
              </div>
              
              <!-- 分享链接 -->
              <div class="content-row" v-if="task.share_info">
                <span class="label">分享链接:</span>
                <a 
                  :href="getFullShareLink(task.share_info)" 
                  target="_blank"
                  class="share-link"
                >
                  查看分享链接
                  <el-icon class="copy-icon" @click.prevent="copyShareLink(task.share_info)">
                    <CopyDocument />
                  </el-icon>
                </a>
              </div>
            </div>
          </div>
          
          <!-- 卡片操作按钮 -->
          <div class="card-actions">
            <button 
              class="action-btn action-btn-primary"
              @click="executeTask(task.order - 1)"
              :disabled="task.status === 'running'"
              :title="task.status === 'running' ? '执行中...' : '执行任务'"
            >
              <el-icon><VideoPlay /></el-icon>
            </button>
            
            <button 
              class="action-btn"
              @click="editTask(task)"
              title="编辑任务"
            >
              <el-icon><Edit /></el-icon>
            </button>
            
            <button 
              class="action-btn"
              @click="shareTask(task.order - 1)"
              title="分享任务"
            >
              <el-icon><Share /></el-icon>
            </button>
            
            <button 
              class="action-btn action-btn-danger"
              @click="deleteTask(task.order - 1)"
              title="删除任务"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑任务对话框 -->
    <AddTaskDialog
      v-model="showAddTaskDialog"
      :task="editingTask"
      @success="handleTaskSuccess"
      @update:modelValue="handleDialogClose"
    />

    <!-- 任务运行窗口 -->
    <TaskRunnerDialog
      v-model="showTaskRunner"
      :task="runningTask"
      :task-id="runningTaskId"
      @task-completed="handleTaskCompleted"
      @task-cancelled="handleTaskCancelled"
      @update:modelValue="handleTaskRunnerClose"
    />
    
    <!-- 列设置对话框 -->
    <el-dialog
      v-model="showColumnSettings"
      title="列设置"
      width="400px"
    >
      <div class="column-settings">
        <el-checkbox v-model="columnVisible.order">序号</el-checkbox>
        <el-checkbox v-model="columnVisible.name">任务名称</el-checkbox>
        <el-checkbox v-model="columnVisible.shareLink">分享链接</el-checkbox>
        <el-checkbox v-model="columnVisible.saveDir">保存路径</el-checkbox>
        <el-checkbox v-model="columnVisible.category">分类</el-checkbox>
        <el-checkbox v-model="columnVisible.status">状态</el-checkbox>
        <el-checkbox v-model="columnVisible.message">消息</el-checkbox>
        <el-checkbox v-model="columnVisible.cron">定时规则</el-checkbox>
      </div>
      <template #footer>
        <el-button @click="showColumnSettings = false">取消</el-button>
        <el-button type="primary" @click="saveColumnSettings">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox, type TableInstance } from 'element-plus'
import { 
  Plus, Search, VideoPlay, Delete, Edit, Share, 
  Link, CopyDocument, DCaret, Sort, Setting
} from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/stores/tasks'
import { useTasks } from '@/composables/useTasks'
import AddTaskDialog from '@/components/business/AddTaskDialog.vue'
import TaskRunnerDialog from '@/components/business/TaskRunnerDialog.vue'
import type { Task } from '@/types'
import { getTaskStatusText, getTaskStatusColor } from '@/utils/helpers'
import Sortable from 'sortablejs'

const taskStore = useTaskStore()
const { tasks, loading } = storeToRefs(taskStore)
const { 
  executeTask: executeTaskWithPolling, 
  executeBatchTasks: executeBatchTasksWithPolling,
  deleteTask: deleteTaskWithConfirm,
  deleteBatchTasks: deleteBatchTasksWithConfirm,
  shareTask: shareTaskWithOptions,
  moveTask,
  initTasks,
  fetchTasks
} = useTasks()

// 表格引用
const tableRef = ref<TableInstance>()

// 搜索和筛选
const searchQuery = ref('')
const statusFilter = ref('all')
const categoryFilter = ref('all')
// 从localStorage加载排序状态
const isReversed = ref(localStorage.getItem('taskListSortOrder') === 'desc')
const selectedTasks = ref<Task[]>([])

// 列可见性配置（从localStorage加载）
const defaultColumnVisible = {
  order: true,
  name: true,
  shareLink: true,
  saveDir: true,
  category: true,
  status: true,
  message: true,
  cron: true
}
const columnVisible = ref(
  JSON.parse(localStorage.getItem('taskListColumnVisible') || JSON.stringify(defaultColumnVisible))
)

// 对话框相关
const showAddTaskDialog = ref(false)
const showColumnSettings = ref(false)
const editingTask = ref<Task | null>(null)

// 任务运行窗口相关
const showTaskRunner = ref(false)
const runningTask = ref<Task | null>(null)
const runningTaskId = ref(-1)

// 拖拽状态
const isDragging = ref(false)
let sortableInstance: Sortable | null = null

// 强制重新渲染的key
const tableKey = ref(0)

// 计算属性
const uniqueCategories = computed(() => {
  const categories = tasks.value
    .map(task => task.category)
    .filter(category => category && category.trim())
  return [...new Set(categories)]
})

const filteredTasks = computed(() => {
  let result = tasks.value

  // 搜索筛选（任务名称、保存路径、分类）
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(task => {
      const nameMatch = task.name?.toLowerCase().includes(query)
      const dirMatch = task.save_dir.toLowerCase().includes(query)
      const categoryMatch = task.category?.toLowerCase().includes(query)
      return nameMatch || dirMatch || categoryMatch
    })
  }

  // 状态筛选
  if (statusFilter.value !== 'all') {
    result = result.filter(task => task.status === statusFilter.value)
  }
  
  // 分类筛选
  if (categoryFilter.value !== 'all') {
    result = result.filter(task => task.category === categoryFilter.value)
  }
  
  // 排序（基于order字段）
  result = result.slice().sort((a, b) => {
    const orderA = a.order || 0
    const orderB = b.order || 0
    return isReversed.value ? orderB - orderA : orderA - orderB
  })

  return result
})

// 方法

const toggleSortOrder = () => {
  isReversed.value = !isReversed.value
  // 保存到localStorage
  localStorage.setItem('taskListSortOrder', isReversed.value ? 'desc' : 'asc')
  // 排序切换后强制重新渲染，确保排序立即生效
  tableKey.value++
}

// 保存列可见性配置
const saveColumnSettings = () => {
  localStorage.setItem('taskListColumnVisible', JSON.stringify(columnVisible.value))
  showColumnSettings.value = false
  ElMessage.success('列设置已保存')
}

const handleSelectionChange = (selection: Task[]) => {
  selectedTasks.value = selection
}

const executeTask = async (taskId: number) => {
  // 找到对应的任务
  const task = tasks.value.find(t => t.order - 1 === taskId)
  if (!task) {
    ElMessage.error('任务不存在')
    return
  }
  
  // 检查任务是否正在运行
  if (task.status === 'running') {
    ElMessage.warning('任务正在执行中')
    return
  }
  
  // 设置运行窗口数据并显示
  runningTask.value = task
  runningTaskId.value = taskId
  showTaskRunner.value = true
  
  // 执行任务（不等待完成）
  executeTaskWithPolling(taskId).catch((error) => {
    console.error('任务执行失败:', error)
  })
}

const executeBatchTasks = async () => {
  const taskIds = selectedTasks.value.map(task => task.order - 1)
  await executeBatchTasksWithPolling(taskIds)
  // 批量执行后强制重新渲染，确保任务状态更新立即显示
  tableKey.value++
}

const deleteTask = async (taskId: number) => {
  await deleteTaskWithConfirm(taskId)
  // 删除后强制重新渲染，确保任务立即从列表中消失
  tableKey.value++
}

const deleteBatchTasks = async () => {
  const taskIds = selectedTasks.value.map(task => task.order - 1)
  await deleteBatchTasksWithConfirm(taskIds)
  // 批量删除后强制重新渲染，确保删除的任务立即从列表中消失
  tableKey.value++
  // 清空选择状态
  selectedTasks.value = []
}

const shareTask = async (taskId: number) => {
  try {
    const shareInfo = await shareTaskWithOptions(taskId)
    
    ElMessageBox.alert(
      `分享链接：\n${getFullShareLink(shareInfo)}`,
      '分享信息',
      {
        confirmButtonText: '复制链接',
        callback: async () => {
          try {
            await navigator.clipboard.writeText(getFullShareLink(shareInfo))
            ElMessage.success('链接已复制到剪贴板')
          } catch {
            ElMessage.warning('复制失败，请手动复制')
          }
        }
      }
    )
  } catch (error) {
    // 错误已在composable中处理
  }
}

const addTask = () => {
  editingTask.value = null
  showAddTaskDialog.value = true
}

const editTask = (task: Task) => {
  editingTask.value = task
  showAddTaskDialog.value = true
}

const handleTaskSuccess = () => {
  editingTask.value = null
  // 强制重新渲染任务列表，确保新增/编辑的任务立即显示
  tableKey.value++
}

const handleDialogClose = (visible: boolean) => {
  // 当对话框关闭时，确保清除编辑状态
  if (!visible) {
    editingTask.value = null
  }
}

// 任务运行窗口相关处理
const handleTaskCompleted = (task: Task) => {
  // 任务完成后更新任务列表
  taskStore.fetchTasks()
}

const handleTaskCancelled = () => {
  // 任务取消处理
  ElMessage.info('任务已取消')
}

const handleTaskRunnerClose = () => {
  // 清理运行窗口状态
  runningTask.value = null
  runningTaskId.value = -1
}

// 拖拽功能
const initSortable = async () => {
  await nextTick()
  
  const el = tableRef.value?.$el?.querySelector('.el-table__body-wrapper tbody')
  if (!el) return
  
  // 销毁之前的实例
  if (sortableInstance) {
    sortableInstance.destroy()
  }
  
  sortableInstance = Sortable.create(el, {
    animation: 300,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    handle: '.drag-handle', // 只有拖拽手柄可以拖拽
    onStart: () => {
      isDragging.value = true
    },
    onEnd: async (event) => {
      isDragging.value = false
      
      const { oldIndex, newIndex } = event
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
        return
      }
      
      try {
        const movedTask = filteredTasks.value[oldIndex]
        if (movedTask) {
          // 找到任务在完整任务列表中的索引
          const taskIndex = tasks.value.findIndex(t => t.order === movedTask.order)
          if (taskIndex !== -1) {
            // 调用API移动任务
            moveTask(taskIndex, newIndex).then(async () => {
              console.log('任务顺序已同步到后端')
              
              // 重新获取最新数据
              await fetchTasks()
              
              // 强制重新渲染整个表格（这会销毁并重新创建所有DOM）
              tableKey.value++
              
              console.log('拖拽排序完成，表格已强制重新渲染')
              
            }).catch(async (error) => {
              console.error('API调用失败:', error)
              // 失败时也重新获取数据恢复状态
              await fetchTasks()
              tableKey.value++
            })
          }
        }
      } catch (error) {
        // 错误已在moveTask中处理
        console.error('任务排序失败:', error)
        // 发生错误时恢复状态
        fetchTasks()
        tableKey.value++
      }
    }
  })
}

// 转存链接处理方法
const getFullSourceLink = (task: any) => {
  if (!task.url) return ''
  
  // 如果URL已经包含密码参数，直接返回
  if (task.url.includes('?pwd=') || task.url.includes('&pwd=')) {
    return task.url
  }
  
  // 如果任务中有密码信息，添加到URL中
  // 根据config.json的数据结构，密码存储在pwd字段中
  if (task.pwd && task.pwd.trim() !== '') {
    const separator = task.url.includes('?') ? '&' : '?'
    return `${task.url}${separator}pwd=${task.pwd}`
  }
  
  return task.url
}

// 分享链接处理方法
const getFullShareLink = (shareInfo: any) => {
  if (!shareInfo) return ''
  
  const baseUrl = shareInfo.url
  if (shareInfo.password) {
    // 如果URL已包含密码参数，直接返回
    if (baseUrl.includes('?pwd=') || baseUrl.includes('&pwd=')) {
      return baseUrl
    }
    // 添加密码参数
    const separator = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${separator}pwd=${shareInfo.password}`
  }
  
  return baseUrl
}

const copyShareLink = async (shareInfo: any) => {
  const fullLink = getFullShareLink(shareInfo)
  if (fullLink) {
    try {
      await navigator.clipboard.writeText(fullLink)
      ElMessage.success('分享链接已复制到剪贴板')
    } catch (error) {
      ElMessage.warning('复制失败，请手动复制')
    }
  }
}

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

// 全局添加任务事件处理
const handleGlobalAddTask = () => {
  addTask() // 调用现有的添加任务方法
}

onMounted(async () => {
  await initTasks()
  // 初始化拖拽功能
  await initSortable()
  
  // 监听全局添加任务事件
  window.addEventListener('global-add-task', handleGlobalAddTask)
})

onUnmounted(() => {
  // 清理全局事件监听器
  window.removeEventListener('global-add-task', handleGlobalAddTask)
})

// 监听tasks变化，重新初始化拖拽
watch(tasks, async () => {
  if (tasks.value.length > 0) {
    await nextTick()
    await initSortable()
  }
}, { deep: true })
</script>

<style scoped>
.tasks-view {
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

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.toolbar-left {
  display: flex;
  gap: 16px;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 16px;
  align-items: center;
}

.task-list-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.desktop-table {
  width: 100%;
}

/* 表格固定布局 */
.desktop-table :deep(.el-table__header),
.desktop-table :deep(.el-table__body) {
  table-layout: fixed;
  width: 100%;
}

/* 通过 colgroup > col 设置列宽百分比 */
.desktop-table :deep(colgroup col[name="el-table_1_column_1"]) {
  width: 3% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_2"]) {
  width: 3% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_3"]) {
  width: 3% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_4"]) {
  width: 9% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_5"]) {
  width: 25% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_6"]) {
  width: 14% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_7"]) {
  width: 6% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_8"]) {
  width: 5% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_9"]) {
  width: 14% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_10"]) {
  width: 7% !important;
}

.desktop-table :deep(colgroup col[name="el-table_1_column_11"]) {
  width: 11% !important;
}

.task-name {
  font-weight: 500;
  color: #333;
}

.source-link {
  color: #409eff;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.source-link:hover {
  color: #66b1ff;
  text-decoration: underline;
}


.link-icon {
  font-size: 12px;
  opacity: 0.7;
}

.share-link-container {
  font-family: monospace;
  font-size: 12px;
}

.share-link {
  color: #67c23a;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-link:hover {
  color: #85ce61;
  text-decoration: underline;
}

.copy-icon {
  font-size: 16px;
  opacity: 0.7;
  cursor: pointer;
  flex-shrink: 0;
  padding: 2px;
}

.copy-icon:hover {
  opacity: 1;
  color: #409eff;
}

.no-share {
  color: #c0c4cc;
  font-style: italic;
}

.task-url {
  font-family: monospace;
  font-size: 12px;
  color: #666;
}

.save-dir {
  color: #666;
}

.task-message {
  color: #888;
  font-size: 12px;
}

.advanced-features {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.no-advanced {
  color: #c0c4cc;
  font-size: 12px;
}

/* 拖拽相关样式 */
.drag-handle {
  cursor: grab;
  color: #c0c4cc;
  transition: color 0.3s;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4px;
}

.drag-handle:hover {
  color: #409eff;
}

.drag-handle:active,
.drag-handle.dragging {
  cursor: grabbing;
  color: #409eff;
}

/* Sortable样式 */
:deep(.sortable-ghost) {
  opacity: 0.4;
  background-color: #f0f9ff !important;
}

:deep(.sortable-chosen) {
  background-color: #e1f5fe !important;
}

:deep(.sortable-drag) {
  opacity: 0.8;
  transform: rotate(5deg);
  background-color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

/* 禁用拖拽时的行选择 */
:deep(.el-table__body-wrapper tbody) {
  user-select: none;
}

/* 移动端卡片样式 */
.mobile-cards {
  display: none;
}

.task-card {
  background: white;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
  padding: 14px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border-left: 3px solid transparent;
  transition: all 0.2s ease;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.task-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  border-left-color: #409eff;
}

.task-card-body {
  flex: 1;
  min-width: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.task-info {
  flex: 1;
  min-width: 0;
}

.task-name {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.task-name .source-link {
  color: #409eff;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
  word-break: break-all;
}

.task-name .source-link:hover {
  color: #66b1ff;
}

.task-order {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}

.card-content {
  margin-bottom: 16px;
}

.content-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
  font-size: 14px;
}

.content-row:last-child {
  margin-bottom: 0;
}

.content-row .label {
  color: #606266;
  font-weight: 500;
  min-width: 80px;
  flex-shrink: 0;
}

.content-row .value {
  color: #303133;
  word-break: break-all;
  flex: 1;
}

.advanced-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.card-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: flex-start;
  min-width: 44px;
  width: 44px;
  flex-shrink: 0;
}

.action-btn {
  width: 36px;
  height: 36px;
  padding: 8px;
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.2s ease;
  touch-action: manipulation;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  color: #606266;
  margin: 0;
  cursor: pointer;
}

.action-btn:hover:not(:disabled) {
  transform: scale(0.95);
  background: #409eff;
  color: white;
  border-color: #409eff;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f5f7fa;
  color: #c0c4cc;
}

.action-btn-primary {
  color: #409eff;
  border-color: rgba(64, 158, 255, 0.3);
}

.action-btn-primary:hover:not(:disabled) {
  background: #409eff;
  color: white;
}

.action-btn-danger {
  color: #f56c6c;
  border-color: rgba(245, 108, 108, 0.3);
}

.action-btn-danger:hover:not(:disabled) {
  background: #f56c6c;
  border-color: #f56c6c;
  color: white;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.empty-text {
  font-size: 16px;
}

/* 列设置对话框 */
.column-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.column-settings .el-checkbox {
  margin: 0;
  height: 40px;
  display: flex;
  align-items: center;
}

/* 响应式设计 - 统一断点为1200px */
@media (max-width: 1200px) {
  .tasks-view {
    padding: 16px;
  }
  
  .page-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
  
  .toolbar {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  
  .toolbar-left {
    flex-direction: column;
    align-items: stretch;
  }
  
  .toolbar-left .el-input,
  .toolbar-left .el-select {
    width: 100% !important;
  }
  
  /* 移动端隐藏表格，显示卡片 */
  .desktop-table {
    display: none !important;
  }
  
  .mobile-cards {
    display: block !important;
  }
  
  /* 移动端隐藏拖拽列 */
  .drag-handle {
    display: none;
  }
  
  /* 优化移动端操作按钮 */
  .card-actions .el-button {
    min-height: 44px;
    font-size: 14px;
  }
  
  /* 移动端表头按钮优化 */
  .header-actions .el-button {
    min-height: 44px;
    padding: 12px 16px;
  }
  
  /* 移动端工具栏按钮优化 */
  .toolbar .el-button {
    min-height: 44px;
    padding: 12px 16px;
  }
  
  /* 移动端复制按钮优化 */
  .copy-icon {
    font-size: 18px;
    padding: 8px;
    opacity: 0.8;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
