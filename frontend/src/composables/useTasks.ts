// 任务管理组合式函数
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { usePolling } from './usePolling'
import { ElMessage, ElMessageBox } from 'element-plus'

export function useTasks() {
  const taskStore = useTaskStore()
  const { tasks, loading, error, taskStats, selectedTasks } = storeToRefs(taskStore)
  const { onTaskUpdate, setFastPolling } = usePolling()

  // 任务操作相关
  const executeTaskWithFastPolling = async (taskId: number) => {
    setFastPolling(true)
    try {
      await taskStore.executeTask(taskId)
      ElMessage.success('任务已开始执行')
    } catch (error) {
      ElMessage.error(`执行任务失败: ${error}`)
    } finally {
      // 延迟恢复正常轮询频率
      setTimeout(() => {
        setFastPolling(false)
      }, 30000) // 30秒后恢复
    }
  }

  const executeBatchTasksWithFastPolling = async (taskIds: number[]) => {
    if (taskIds.length === 0) {
      ElMessage.warning('请先选择要执行的任务')
      return
    }

    try {
      await ElMessageBox.confirm(
        `确定要批量执行 ${taskIds.length} 个任务吗？`,
        '确认批量执行',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )

      setFastPolling(true)
      await taskStore.executeBatchTasks(taskIds)
      ElMessage.success(`已开始批量执行 ${taskIds.length} 个任务`)
      
      // 清除选中状态
      taskStore.clearSelection()
      
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage.error(`批量执行失败: ${error}`)
      }
    } finally {
      // 延迟恢复正常轮询频率
      setTimeout(() => {
        setFastPolling(false)
      }, 60000) // 批量执行后1分钟恢复
    }
  }

  const deleteTaskWithConfirm = async (taskId: number) => {
    try {
      await ElMessageBox.confirm(
        '确定要删除这个任务吗？',
        '确认删除',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )

      await taskStore.deleteTask(taskId)
      ElMessage.success('任务已删除')
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage.error(`删除任务失败: ${error}`)
      }
    }
  }

  const deleteBatchTasksWithConfirm = async (taskIds: number[]) => {
    if (taskIds.length === 0) {
      ElMessage.warning('请先选择要删除的任务')
      return
    }

    try {
      await ElMessageBox.confirm(
        `确定要删除 ${taskIds.length} 个任务吗？此操作不可恢复。`,
        '确认批量删除',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )

      await taskStore.deleteBatchTasks(taskIds)
      ElMessage.success(`已删除 ${taskIds.length} 个任务`)
      
      // 清除选中状态
      taskStore.clearSelection()
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage.error(`批量删除失败: ${error}`)
      }
    }
  }

  const shareTaskWithOptions = async (taskId: number, options?: { password?: string, period?: number }) => {
    try {
      const shareInfo = await taskStore.shareTask(taskId, options)
      
      // 复制分享链接到剪贴板
      if (shareInfo?.url) {
        await navigator.clipboard.writeText(shareInfo.url)
        ElMessage.success('分享链接已复制到剪贴板')
      }
      
      return shareInfo
    } catch (error) {
      ElMessage.error(`生成分享链接失败: ${error}`)
      throw error
    }
  }

  // 任务筛选和搜索
  const filterTasks = (searchQuery: string, statusFilter: string, categoryFilter?: string) => {
    return computed(() => {
      let result = tasks.value

      // 搜索筛选
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        result = result.filter(task => 
          task.name?.toLowerCase().includes(query) ||
          task.url.toLowerCase().includes(query) ||
          task.save_dir.toLowerCase().includes(query)
        )
      }

      // 状态筛选
      if (statusFilter !== 'all') {
        result = result.filter(task => task.status === statusFilter)
      }

      // 分类筛选
      if (categoryFilter && categoryFilter !== 'all') {
        result = result.filter(task => task.category === categoryFilter)
      }

      return result
    })
  }

  // 任务排序
  const sortTasks = (tasks: any[], sortField: string, sortOrder: 'asc' | 'desc' = 'asc') => {
    return computed(() => {
      return [...tasks].sort((a, b) => {
        let aValue = a[sortField]
        let bValue = b[sortField]

        // 处理不同类型的值
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = aValue.toLowerCase()
          bValue = bValue.toLowerCase()
        }

        if (aValue < bValue) {
          return sortOrder === 'asc' ? -1 : 1
        }
        if (aValue > bValue) {
          return sortOrder === 'asc' ? 1 : -1
        }
        return 0
      })
    })
  }

  // 任务拖拽排序
  const moveTask = async (taskId: number, newIndex: number) => {
    try {
      await taskStore.moveTask(taskId, newIndex)
      ElMessage.success('任务顺序已更新')
    } catch (error) {
      ElMessage.error(`更新任务顺序失败: ${error}`)
    }
  }

  // 初始化任务数据
  const initTasks = async () => {
    await taskStore.fetchTasks()
    
    // 监听轮询更新
    onTaskUpdate((updatedTasks) => {
      taskStore.handleTaskUpdate(updatedTasks)
    })
  }

  // 监听错误状态
  watch(error, (newError) => {
    if (newError) {
      ElMessage.error(newError)
      taskStore.clearError()
    }
  })

  // 任务状态变化监听
  const onTaskStatusChange = (callback: (task: any, oldStatus: string, newStatus: string) => void) => {
    const oldTasks = new Map()
    
    watch(tasks, (newTasks) => {
      newTasks.forEach(task => {
        const oldTask = oldTasks.get(task.order)
        if (oldTask && oldTask.status !== task.status) {
          callback(task, oldTask.status, task.status)
        }
        oldTasks.set(task.order, { ...task })
      })
    }, { deep: true })
  }

  return {
    // 状态
    tasks,
    loading,
    error,
    taskStats,
    selectedTasks,

    // 基础操作
    initTasks,
    addTask: taskStore.addTask,
    updateTask: taskStore.updateTask,
    
    // 高级操作（带用户交互）
    executeTask: executeTaskWithFastPolling,
    executeBatchTasks: executeBatchTasksWithFastPolling,
    deleteTask: deleteTaskWithConfirm,
    deleteBatchTasks: deleteBatchTasksWithConfirm,
    shareTask: shareTaskWithOptions,
    moveTask,

    // 选择操作
    selectTask: taskStore.selectTask,
    unselectTask: taskStore.unselectTask,
    selectAllTasks: taskStore.selectAllTasks,
    clearSelection: taskStore.clearSelection,
    toggleTaskSelection: taskStore.toggleTaskSelection,

    // 工具方法
    filterTasks,
    sortTasks,
    onTaskStatusChange,
    
    // store 方法直接导出
    fetchTasks: taskStore.fetchTasks
  }
}
