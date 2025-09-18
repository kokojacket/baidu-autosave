// 轮询管理组合式函数
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { pollingService } from '@/services/polling'
import { useAuthStore } from '@/stores/auth'
import type { Task } from '@/types'

// 全局共享的轮询状态
const globalPollingState = ref(false)
const globalPollingError = ref<string | null>(null)

export function usePolling() {
  // 使用全局共享状态，而不是每次创建新的ref
  const isRunning = computed(() => globalPollingState.value)
  const error = computed(() => globalPollingError.value)
  
  // 获取认证状态
  const authStore = useAuthStore()

  const start = () => {
    pollingService.start()
  }

  const stop = () => {
    pollingService.stop()
  }

  const setFastPolling = (enabled: boolean) => {
    pollingService.setFastPolling(enabled)
  }

  const onTaskUpdate = (callback: (tasks: Task[]) => void) => {
    pollingService.on('task_update', callback)
  }


  const onError = (callback: (error: any) => void) => {
    pollingService.on('error', callback)
  }

  // 移除监听器
  const offTaskUpdate = (callback: (tasks: Task[]) => void) => {
    pollingService.off('task_update', callback)
  }


  const offError = (callback: (error: any) => void) => {
    pollingService.off('error', callback)
  }

  // 获取轮询状态
  const getPollingStatus = () => {
    return pollingService.isPolling()
  }

  // 更新轮询配置
  const updatePollingConfig = (config: {
    taskStatusInterval?: number
    fastPollingInterval?: number
    retryDelay?: number
  }) => {
    pollingService.updateConfig(config)
  }

  // 生命周期处理
  onMounted(() => {
    pollingService.on('started', () => {
      globalPollingState.value = true
      globalPollingError.value = null
      console.log('轮询服务已启动')
    })

    pollingService.on('stopped', () => {
      globalPollingState.value = false
      console.log('轮询服务已停止')
    })

    pollingService.on('error', (err: any) => {
      globalPollingError.value = err.error instanceof Error ? err.error.message : '轮询错误'
      console.error('轮询错误:', err)
    })

    // 初始化状态：从pollingService获取当前状态
    globalPollingState.value = pollingService.isPolling()

    // 监听认证状态变化，只在用户已认证时启动轮询
    watch(
      () => authStore.isLoggedIn,
      (isLoggedIn) => {
        if (isLoggedIn) {
          // 用户已登录，启动轮询
          start()
        } else {
          // 用户未登录或已登出，停止轮询
          stop()
        }
      },
      { immediate: true } // 立即执行一次检查
    )
  })

  onUnmounted(() => {
    // 清理所有监听器
    pollingService.removeAllListeners()
    stop()
  })

  return {
    // 状态
    isRunning,
    error,
    
    // 控制方法
    start,
    stop,
    setFastPolling,
    
    // 事件监听
    onTaskUpdate,
    onError,
    
    // 移除监听器
    offTaskUpdate,
    offError,
    
    // 工具方法
    getPollingStatus,
    updatePollingConfig
  }
}
