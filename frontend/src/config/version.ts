// 版本管理配置
export const VERSION_CONFIG = {
  APP_VERSION: 'v1.1.3',
  BUILD_TIME: '2024-09-15T20:00:00Z',
  RELEASE_NOTES: '前端重构版本 - Vue 3 + TypeScript',
  UPDATE_NOTES: {
    'v1.1.3': '前端重构版本 - Vue 3 + TypeScript',
    'v1.1.2': '优化轮询机制', 
    'v1.1.1': '优化界面响应速度'
  }
} as const

export const APP_VERSION = VERSION_CONFIG.APP_VERSION
export const BUILD_TIME = VERSION_CONFIG.BUILD_TIME
export const RELEASE_NOTES = VERSION_CONFIG.RELEASE_NOTES
