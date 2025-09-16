// 配置管理状态
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiService } from '@/services'
import { getErrorMessage } from '@/utils/helpers'

// 配置接口定义，严格匹配config.json结构
interface NotifyConfig {
  enabled?: boolean
  notification_delay?: number
  direct_fields?: {
    [key: string]: string | undefined
    PUSH_PLUS_TOKEN?: string
    PUSH_PLUS_USER?: string
    WEBHOOK_URL?: string
    WEBHOOK_METHOD?: string
    WEBHOOK_CONTENT_TYPE?: string
    WEBHOOK_HEADERS?: string
    WEBHOOK_BODY?: string
  }
}

interface CronConfig {
  default_schedule?: string[]
}

interface ShareConfig {
  default_password?: string
  default_period_days?: number
}

interface RetryConfig {
  max_attempts?: number
  delay_seconds?: number
}

interface SchedulerConfig {
  max_workers?: number
  misfire_grace_time?: number
  coalesce?: boolean
  max_instances?: number
}

interface FileOpsConfig {
  rename_delay_seconds?: number
  batch_size?: number
  concurrent_limit?: number
}

interface QuotaAlertConfig {
  enabled?: boolean
  threshold_percent?: number
  check_schedule?: string
}

interface AuthConfig {
  users?: string
  password?: string
  session_timeout?: number
}

interface RealConfig {
  notify?: NotifyConfig
  cron?: CronConfig
  share?: ShareConfig
  retry?: RetryConfig
  scheduler?: SchedulerConfig
  file_operations?: FileOpsConfig
  quota_alert?: QuotaAlertConfig
  auth?: AuthConfig
  baidu?: {
    current_user?: any
  }
}

export const useConfigStore = defineStore('config', () => {
  // 状态 - 匹配真实的config.json结构
  const config = ref<RealConfig>({})
  
  const loading = ref(false)
  const error = ref<string | null>(null)
  const saving = ref(false)

  // 计算属性
  const isNotificationEnabled = computed(() => config.value.notify?.enabled || false)
  const isCronEnabled = computed(() => {
    // 定时任务默认启用，只要有配置就认为是启用的
    return config.value.cron?.default_schedule && config.value.cron.default_schedule.length > 0
  })
  const isShareEnabled = computed(() => {
    // 分享功能默认启用，只要有配置就认为是启用的
    return config.value.share?.default_password !== undefined
  })
  const isQuotaAlertEnabled = computed(() => config.value.quota_alert?.enabled || false)
  
  // 通知字段 - 基于direct_fields中的非预定义字段
  const notificationFields = computed(() => {
    const directFields = config.value.notify?.direct_fields || {}
    const knownFields = ['PUSH_PLUS_TOKEN', 'PUSH_PLUS_USER', 'WEBHOOK_URL', 'WEBHOOK_METHOD', 'WEBHOOK_CONTENT_TYPE', 'WEBHOOK_HEADERS', 'WEBHOOK_BODY']
    
    return Object.entries(directFields)
      .filter(([name]) => !knownFields.includes(name))
      .map(([name, value]) => ({ name, value: String(value || '') }))
  })

  // 操作方法
  const fetchConfig = async () => {
    loading.value = true
    error.value = null
    
    try {
      const response = await apiService.getConfig()
      if (response.success) {
        const serverConfig = response.config || response.data?.config || response.data
        
        // 直接使用服务端返回的配置结构
        config.value = {
          notify: serverConfig.notify || {},
          cron: serverConfig.cron || {},
          share: serverConfig.share || {},
          retry: serverConfig.retry || {},
          scheduler: serverConfig.scheduler || {},
          file_operations: serverConfig.file_operations || {},
          quota_alert: serverConfig.quota_alert || {},
          auth: serverConfig.auth || {},
          baidu: serverConfig.baidu || {}
        }
      } else {
        throw new Error(response.message || '获取配置失败')
      }
    } catch (err) {
      error.value = getErrorMessage(err)
      console.error('获取配置失败:', err)
    } finally {
      loading.value = false
    }
  }

  const updateConfig = async (newConfig: Partial<RealConfig>) => {
    saving.value = true
    error.value = null
    
    try {
      const response = await apiService.updateConfig(newConfig)
      if (response.success) {
        // 更新本地配置
        config.value = {
          ...config.value,
          ...newConfig
        }
        return true
      } else {
        throw new Error(response.message || '更新配置失败')
      }
    } catch (err) {
      error.value = getErrorMessage(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  // 分类更新方法 - 匹配真实的config.json结构
  const updateNotificationConfig = async (notifyConfig: Partial<NotifyConfig>) => {
    const newConfig = {
      notify: {
        ...config.value.notify,
        ...notifyConfig
      }
    }
    return updateConfig(newConfig)
  }

  const updateCronConfig = async (cronConfig: Partial<CronConfig>) => {
    const newConfig = {
      cron: {
        ...config.value.cron,
        ...cronConfig
      }
    }
    return updateConfig(newConfig)
  }

  const updateShareConfig = async (shareConfig: Partial<ShareConfig>) => {
    const newConfig = {
      share: {
        ...config.value.share,
        ...shareConfig
      }
    }
    return updateConfig(newConfig)
  }

  const updateRetryConfig = async (retryConfig: Partial<RetryConfig>) => {
    const newConfig = {
      retry: {
        ...config.value.retry,
        ...retryConfig
      }
    }
    return updateConfig(newConfig)
  }

  const updateSchedulerConfig = async (schedulerConfig: Partial<SchedulerConfig>) => {
    const newConfig = {
      scheduler: {
        ...config.value.scheduler,
        ...schedulerConfig
      }
    }
    return updateConfig(newConfig)
  }

  const updateFileOpsConfig = async (fileOpsConfig: Partial<FileOpsConfig>) => {
    const newConfig = {
      file_operations: {
        ...config.value.file_operations,
        ...fileOpsConfig
      }
    }
    return updateConfig(newConfig)
  }

  const updateQuotaAlertConfig = async (quotaAlertConfig: Partial<QuotaAlertConfig>) => {
    const newConfig = {
      quota_alert: {
        ...config.value.quota_alert,
        ...quotaAlertConfig
      }
    }
    return updateConfig(newConfig)
  }

  const updateAuthConfig = async (authConfig: Partial<AuthConfig>) => {
    const newConfig = {
      auth: {
        ...config.value.auth,
        ...authConfig
      }
    }
    return updateConfig(newConfig)
  }

  // 通知相关操作
  const testNotification = async () => {
    try {
      const response = await apiService.testNotify()
      if (response.success) {
        return true
      } else {
        throw new Error(response.message || '测试通知失败')
      }
    } catch (err) {
      error.value = getErrorMessage(err)
      throw err
    }
  }

  const addCustomNotificationField = async (name: string, value: string) => {
    try {
      const response = await apiService.addNotifyField(name, value)
      if (response.success) {
        // 更新本地配置 - 添加到direct_fields中
        const newDirectFields = {
          ...config.value.notify?.direct_fields,
          [name]: value
        }
        if (config.value.notify) {
          config.value.notify.direct_fields = newDirectFields
        } else {
          config.value.notify = {
            direct_fields: newDirectFields
          }
        }
        return true
      } else {
        throw new Error(response.message || '添加通知字段失败')
      }
    } catch (err) {
      error.value = getErrorMessage(err)
      throw err
    }
  }

  const deleteCustomNotificationField = async (name: string) => {
    try {
      const response = await apiService.deleteNotifyField(name)
      if (response.success) {
        // 更新本地配置 - 从direct_fields中删除
        const newDirectFields = { ...config.value.notify?.direct_fields }
        delete newDirectFields[name]
        if (config.value.notify) {
          config.value.notify.direct_fields = newDirectFields
        } else {
          config.value.notify = {
            direct_fields: newDirectFields
          }
        }
        return true
      } else {
        throw new Error(response.message || '删除通知字段失败')
      }
    } catch (err) {
      error.value = getErrorMessage(err)
      throw err
    }
  }

  // 配置重置
  const resetToDefaults = () => {
    config.value = {
      notify: {
        enabled: false,
        notification_delay: 30,
        direct_fields: {}
      },
      cron: {
        default_schedule: []
      },
      share: {
        default_password: '8888',
        default_period_days: 7
      },
      retry: {
        max_attempts: 3,
        delay_seconds: 5
      },
      scheduler: {
        max_workers: 1,
        misfire_grace_time: 3600,
        coalesce: true,
        max_instances: 1
      },
      file_operations: {
        rename_delay_seconds: 0.5,
        batch_size: 50,
        concurrent_limit: 1
      },
      quota_alert: {
        enabled: false,
        threshold_percent: 98,
        check_schedule: '0 0 * * *'
      },
      auth: {
        users: '',
        password: '',
        session_timeout: 3600
      }
    }
  }

  // 配置验证
  const validateConfig = (configToValidate?: Partial<RealConfig>): { valid: boolean, errors: string[] } => {
    const targetConfig = configToValidate || config.value
    const errors: string[] = []

    // 验证通知配置
    if (targetConfig.notify?.enabled && !targetConfig.notify.direct_fields?.WEBHOOK_URL) {
      errors.push('启用通知时必须设置webhook URL')
    }

    // 验证重试配置
    if (targetConfig.retry) {
      if (targetConfig.retry.max_attempts && targetConfig.retry.max_attempts < 0) {
        errors.push('最大重试次数不能小于0')
      }
      
      if (targetConfig.retry.delay_seconds && targetConfig.retry.delay_seconds < 1) {
        errors.push('重试延迟必须大于0')
      }
    }

    // 验证调度器配置
    if (targetConfig.scheduler) {
      if (targetConfig.scheduler.max_workers && targetConfig.scheduler.max_workers < 1) {
        errors.push('最大工作线程数必须大于0')
      }
      
      if (targetConfig.scheduler.max_instances && targetConfig.scheduler.max_instances < 1) {
        errors.push('最大实例数必须大于0')
      }
    }

    // 验证文件操作配置
    if (targetConfig.file_operations) {
      if (targetConfig.file_operations.batch_size && targetConfig.file_operations.batch_size < 1) {
        errors.push('批处理大小必须大于0')
      }
      
      if (targetConfig.file_operations.concurrent_limit && targetConfig.file_operations.concurrent_limit < 1) {
        errors.push('并发限制必须大于0')
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  const clearError = () => {
    error.value = null
  }

  return {
    // 状态
    config,
    loading,
    error,
    saving,
    
    // 计算属性
    isNotificationEnabled,
    isCronEnabled,
    isShareEnabled,
    isQuotaAlertEnabled,
    notificationFields,
    
    // 操作方法
    fetchConfig,
    updateConfig,
    updateNotificationConfig,
    updateCronConfig,
    updateShareConfig,
    updateRetryConfig,
    updateSchedulerConfig,
    updateFileOpsConfig,
    updateQuotaAlertConfig,
    updateAuthConfig,
    
    // 通知相关
    testNotification,
    addCustomNotificationField,
    deleteCustomNotificationField,
    
    // 辅助方法
    resetToDefaults,
    validateConfig,
    clearError
  }
})

