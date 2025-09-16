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
    // 异步延迟检查版本，避免阻塞页面加载
    setTimeout(() => {
      checkForUpdates()
    }, 3000) // 延迟3秒，让页面先完全加载
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
