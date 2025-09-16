import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
      imports: ['vue', 'vue-router', 'pinia'],
      dts: true,
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0', // 允许外部网络访问（包括手机）
    port: 3001,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: false, // 保持原始host
        secure: false,
        ws: true,
        xfwd: true,
        cookieDomainRewrite: false, // 禁用cookie域重写
        cookiePathRewrite: false,   // 禁用cookie路径重写
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 动态设置转发的Host头，支持本地IP访问
            const host = req.headers.host || 'localhost:3001'
            proxyReq.setHeader('X-Forwarded-Host', host)
            proxyReq.setHeader('X-Forwarded-Proto', 'http')
          })
        }
      },
      '/login': {
        target: 'http://localhost:5000',
        changeOrigin: false,
        secure: false,
        xfwd: true,
        cookieDomainRewrite: false,
        cookiePathRewrite: false,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 动态设置转发的Host头，支持本地IP访问
            const host = req.headers.host || 'localhost:3001'
            proxyReq.setHeader('X-Forwarded-Host', host)
            proxyReq.setHeader('X-Forwarded-Proto', 'http')
          })
        },
        bypass: (req, res, options) => {
          // 只代理POST请求，GET请求让Vue Router处理
          if (req.method !== 'POST') {
            return '/index.html'
          }
        }
      },
      '/logout': {
        target: 'http://localhost:5000',
        changeOrigin: false,
        secure: false,
        xfwd: true,
        cookieDomainRewrite: false,
        cookiePathRewrite: false,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 动态设置转发的Host头，支持本地IP访问
            const host = req.headers.host || 'localhost:3001'
            proxyReq.setHeader('X-Forwarded-Host', host)
            proxyReq.setHeader('X-Forwarded-Proto', 'http')
          })
        },
        bypass: (req, res, options) => {
          // 只代理POST请求
          if (req.method !== 'POST') {
            return '/index.html'
          }
        }
      },
    },
  },
  build: {
    outDir: '../static-new',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          element: ['element-plus'],
        },
      },
    },
  },
})
