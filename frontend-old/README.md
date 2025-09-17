# 旧前端代码备份

这个文件夹包含了项目重构前的旧前端代码，基于传统的HTML + JavaScript + CSS技术栈。

## 文件说明

- **`index.html`** - 主页面模板文件（原来位于 `templates/index.html`）
- **`login.html`** - 登录页面模板文件（原来位于 `templates/login.html`）
- **`main.js`** - 主要的JavaScript逻辑文件（原来位于 `static/main.js`）
- **`style.css`** - 样式文件（原来位于 `static/style.css`）
- **`sortable.min.js`** - 拖拽排序库（原来位于 `static/sortable.min.js`）
- **`favicon.png`** - 网站图标（原来位于 `templates/favicon.png`）

## 技术栈

- **前端框架**: 原生 HTML + JavaScript + CSS
- **UI库**: 无框架，使用原生DOM操作
- **拖拽功能**: SortableJS库
- **模板引擎**: Flask Jinja2模板

## 功能特性

旧前端包含以下主要功能：
- 任务管理（添加、编辑、删除、执行）
- 用户管理和切换
- 系统设置配置
- 通知配置
- 分享链接生成
- 网盘容量监控
- 版本检查
- 定时任务设置

## 提取时间

提取时间：2025年9月17日
基于Git提交：`3234982` (包含网盘容量监控功能的版本)

## 注意事项

1. 这些文件仅供参考和备份用途
2. 当前项目已迁移到新的Vue.js前端架构
3. 如需使用旧前端，需要相应调整后端路由配置
4. 旧前端代码可能不包含最新的功能特性

## 新前端对比

| 特性 | 旧前端 | 新前端 |
|------|--------|--------|
| 技术栈 | HTML + JS + CSS | Vue.js + TypeScript |
| 构建工具 | 无 | Vite |
| 状态管理 | 全局变量 | Pinia |
| 路由 | 服务端路由 | Vue Router |
| 组件化 | 无 | Vue组件 |
| 类型检查 | 无 | TypeScript |
| 开发体验 | 基础 | 现代化开发工具链 |
