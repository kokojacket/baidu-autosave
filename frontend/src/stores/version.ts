// 版本管理状态
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiService } from '@/services'
import { APP_VERSION } from '@/config/version'
import { compareVersions } from '@/utils/helpers'
import { getErrorMessage } from '@/utils/helpers'

export const useVersionStore = defineStore('version', () => {
  // 状态
  const currentVersion = ref(APP_VERSION)
  const latestVersion = ref('')
  const hasUpdate = ref(false)
  const checking = ref(false)
  const lastCheckTime = ref<number>(0)
  const updateInfo = ref<{
    version: string
    link?: string
    notes?: string
  } | null>(null)
  
  const checkForUpdates = async () => {
    // 防止重复检查：如果正在检查或最近30分钟内已检查过，则跳过
    const CACHE_DURATION = 30 * 60 * 1000 // 30分钟缓存
    const now = Date.now()
    
    if (checking.value) return
    if (lastCheckTime.value && (now - lastCheckTime.value) < CACHE_DURATION) {
      console.log('版本检查缓存有效，跳过检查')
      return
    }
    
    // 避免在任务执行期间检查版本，防止干扰任务监控
    if (window.location.pathname.includes('/tasks')) {
      console.log('用户正在任务管理页面，跳过版本检查')
      return
    }
    
    checking.value = true
    
    try {
      const sources = ['github', 'dockerhub', 'dockerhub_alt', 'msrun', '1ms']
      
      for (const source of sources) {
        try {
          const response = await apiService.checkVersion(source)
          
          if (response.success && response.version) {
            latestVersion.value = response.version
            hasUpdate.value = compareVersions(response.version, currentVersion.value) > 0
            lastCheckTime.value = now
            
            if (hasUpdate.value) {
              console.log(`发现新版本: ${response.version}，当前版本: ${currentVersion.value}`)
              
              updateInfo.value = {
                version: response.version,
                link: response.link || response.data?.link,
                notes: response.release_notes || response.data?.release_notes
              }
            }
            
            break // 成功获取版本信息后退出循环
          }
        } catch (error) {
          console.warn(`从${source}获取版本信息失败:`, getErrorMessage(error))
          continue
        }
      }
    } catch (error) {
      console.error('版本检查失败:', getErrorMessage(error))
    } finally {
      checking.value = false
    }
  }
  
  // 重置状态
  const resetVersionCheck = () => {
    latestVersion.value = ''
    hasUpdate.value = false
    updateInfo.value = null
    lastCheckTime.value = 0
  }
  
  // 初始化版本检查（只在应用启动时调用一次）
  const initVersionCheck = () => {
    // 使用更智能的版本检查策略，避免干扰用户操作
    let checkAttempts = 0
    const maxAttempts = 3
    
    const smartVersionCheck = () => {
      checkAttempts++
      
      // 检查是否在关键操作页面
      const isInTaskPage = window.location.pathname.includes('/tasks')
      const isUserActive = document.hasFocus() && !document.hidden
      
      // 如果用户不在任务页面且页面不活跃，则进行版本检查
      if (!isInTaskPage && !isUserActive) {
        console.log('后台静默检查版本更新')
        checkForUpdates()
        return
      }
      
      // 如果检查次数未达上限，延迟重试
      if (checkAttempts < maxAttempts) {
        const nextDelay = 30000 * checkAttempts // 30秒、60秒、90秒
        setTimeout(smartVersionCheck, nextDelay)
      } else {
        console.log('版本检查已跳过，避免干扰用户操作')
      }
    }
    
    // 初始延迟15秒后开始智能检查
    setTimeout(smartVersionCheck, 15000)
  }
  
  return {
    // 状态
    currentVersion,
    latestVersion,
    hasUpdate,
    checking,
    updateInfo,
    lastCheckTime,
    
    // 方法
    checkForUpdates,
    resetVersionCheck,
    initVersionCheck
  }
})
