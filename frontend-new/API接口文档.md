# 百度网盘自动追更 - API 接口文档

## 概述

本文档描述了百度网盘自动追更系统的所有后端API接口。

**基础信息：**
- 基础URL: `http://localhost:5000`
- 框架: Flask
- 认证方式: Session-based
- 响应格式: JSON

**统一响应格式：**
```json
{
  "success": true/false,
  "message": "操作结果描述",
  "data": {}  // 可选，具体数据
}
```

---

## 1. 认证相关 API

### 1.1 登录（表单方式）

**端点:** `POST /login`

**描述:** 用户登录接口（支持表单提交）

**需要登录:** ❌

**请求参数:**
```json
{
  "username": "string",  // 用户名
  "password": "string"   // 密码
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "登录成功"
}
```

---

### 1.2 API登录

**端点:** `POST /api/auth/login`

**描述:** API登录接口（支持JSON格式）

**需要登录:** ❌

**请求参数:**
```json
{
  "username": "string",  // 用户名
  "password": "string"   // 密码
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "登录成功",
  "username": "admin"
}
```

---

### 1.3 登出

**端点:** `POST /api/auth/logout`

**描述:** 用户登出接口

**需要登录:** ❌

**响应示例:**
```json
{
  "success": true,
  "message": "登出成功"
}
```

---

### 1.4 检查认证状态

**端点:** `GET /api/auth/check`

**描述:** 检查当前用户的认证状态

**需要登录:** ❌

**响应示例:**
```json
{
  "success": true,
  "message": "认证有效",
  "username": "admin"
}
```

**错误响应:**
```json
{
  "success": false,
  "message": "未登录"
}
```

---

### 1.5 更新登录凭据

**端点:** `POST /api/auth/update`

**描述:** 更新用户名和密码

**需要登录:** ✅

**请求参数:**
```json
{
  "username": "string",      // 新用户名
  "password": "string",      // 新密码
  "old_password": "string"   // 旧密码（验证用）
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "登录凭据更新成功"
}
```

---

## 2. 任务管理 API

### 2.1 获取所有任务

**端点:** `GET /api/tasks`

**描述:** 获取所有任务列表

**需要登录:** ✅

**响应示例:**
```json
{
  "success": true,
  "tasks": [
    {
      "url": "https://pan.baidu.com/s/xxxxx",
      "save_dir": "/我的资源/电影",
      "pwd": "1234",
      "name": "电影更新",
      "cron": "0 2 * * *",
      "category": "电影",
      "regex_pattern": "",
      "regex_replace": "",
      "order": 1,
      "status": "normal",
      "message": "转存成功",
      "last_update": 1702345678
    }
  ]
}
```

---

### 2.2 获取任务状态（轮询）

**端点:** `GET /api/tasks/status`

**描述:** 获取所有任务的状态，用于前端轮询更新

**需要登录:** ✅

**响应示例:**
```json
{
  "success": true,
  "tasks": [
    {
      "order": 1,
      "status": "running",
      "message": "正在转存文件..."
    }
  ]
}
```

---

### 2.3 获取单个任务状态

**端点:** `GET /api/tasks/<task_id>/status`

**描述:** 获取指定任务的状态

**需要登录:** ✅

**路径参数:**
- `task_id`: 任务ID（从0开始的索引）

**响应示例:**
```json
{
  "success": true,
  "status": {
    "url": "https://pan.baidu.com/s/xxxxx",
    "status": "running",
    "message": "正在转存..."
  }
}
```

---

### 2.4 获取正在运行的任务

**端点:** `GET /api/tasks/running`

**描述:** 获取所有正在运行的任务

**需要登录:** ✅

**响应示例:**
```json
{
  "success": true,
  "tasks": [
    {
      "order": 1,
      "name": "电影更新",
      "status": "running",
      "message": "正在转存文件..."
    }
  ]
}
```

---

### 2.5 添加任务

**端点:** `POST /api/task/add`

**描述:** 添加新的转存任务

**需要登录:** ✅

**请求参数:**
```json
{
  "url": "string",              // 必填，分享链接
  "save_dir": "string",         // 必填，保存目录
  "pwd": "string",              // 可选，提取码
  "name": "string",             // 可选，任务名称
  "cron": "string",             // 可选，定时规则（cron表达式）
  "category": "string",         // 可选，任务分类
  "regex_pattern": "string",    // 可选，文件名正则匹配
  "regex_replace": "string"     // 可选，文件名替换规则
}
```

**URL格式支持:**
- `https://pan.baidu.com/s/xxxxx?pwd=1234`
- `https://pan.baidu.com/share/init?surl=xxxxx&pwd=1234`

**响应示例:**
```json
{
  "success": true,
  "message": "添加任务成功"
}
```

---

### 2.6 更新任务

**端点:** `POST /api/task/update`

**描述:** 更新现有任务的信息

**需要登录:** ✅

**请求参数:**
```json
{
  "task_id": 0,                 // 必填，任务ID
  "url": "string",              // 必填，分享链接
  "save_dir": "string",         // 必填，保存目录
  "pwd": "string",              // 可选，提取码
  "name": "string",             // 可选，任务名称
  "cron": "string",             // 可选，定时规则
  "category": "string",         // 可选，任务分类
  "regex_pattern": "string",    // 可选，文件名正则匹配
  "regex_replace": "string"     // 可选，文件名替换规则
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "更新任务成功",
  "task": {
    "url": "https://pan.baidu.com/s/xxxxx",
    "save_dir": "/我的资源/电影",
    "order": 1
  }
}
```

---

### 2.7 删除任务

**端点:** `POST /api/task/delete`

**描述:** 删除指定任务

**需要登录:** ✅

**请求参数:**
```json
{
  "task_id": 0  // 任务ID
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "删除任务成功"
}
```

---

### 2.8 批量删除任务

**端点:** `POST /api/tasks/batch-delete`

**描述:** 批量删除多个任务

**需要登录:** ✅

**请求参数:**
```json
{
  "task_ids": [0, 1, 2]  // 任务ID数组
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "成功删除3个任务"
}
```

---

### 2.9 移动任务位置

**端点:** `POST /api/task/move`

**描述:** 移动任务在列表中的位置

**需要登录:** ✅

**请求参数:**
```json
{
  "task_id": 0,      // 要移动的任务ID
  "new_index": 2     // 新的位置索引
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "任务位置已更新"
}
```

---

### 2.10 重新排序任务

**端点:** `POST /api/task/reorder`

**描述:** 重新排序任务

**需要登录:** ✅

**请求参数:**
```json
{
  "task_id": 0,      // 任务ID
  "new_order": 3     // 新的顺序号
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "任务重排序成功"
}
```

---

### 2.11 执行任务

**端点:** `POST /api/task/execute`

**描述:** 立即执行指定任务

**需要登录:** ✅

**请求参数:**
```json
{
  "task_id": 0  // 任务ID
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "任务已开始执行"
}
```

**说明:** 任务会在后台异步执行，可通过轮询任务状态或日志接口查看执行进度。

---

### 2.12 批量执行任务

**端点:** `POST /api/tasks/execute-all`

**描述:** 批量执行多个任务

**需要登录:** ✅

**请求参数:**
```json
{
  "task_ids": [0, 1, 2]  // 要执行的任务ID数组
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "批量执行完成，成功: 2，跳过: 0，失败: 1",
  "results": {
    "success": [...],      // 成功的任务列表
    "skipped": [...],      // 跳过的任务列表
    "failed": [...],       // 失败的任务列表
    "transferred_files": {}  // 转存的文件信息
  }
}
```

---

### 2.13 获取任务执行日志

**端点:** `GET /api/task/log/<task_id>`

**描述:** 获取指定任务的执行日志（用于实时查看任务进度）

**需要登录:** ✅

**路径参数:**
- `task_id`: 任务ID

**响应示例:**
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "14:30:25",
      "level": "INFO",
      "message": "开始执行任务: 电影更新",
      "task_order": 1
    },
    {
      "timestamp": "14:30:26",
      "level": "INFO",
      "message": "正在获取分享文件列表...",
      "task_order": 1
    }
  ]
}
```

---

### 2.14 生成任务分享链接

**端点:** `POST /api/task/share`

**描述:** 为任务的保存目录生成百度网盘分享链接

**需要登录:** ✅

**请求参数:**
```json
{
  "task_id": 0,              // 必填，任务ID
  "password": "1234",        // 可选，自定义提取码
  "period": 7                // 可选，有效期（天），0表示永久
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "分享链接生成成功",
  "share_info": {
    "url": "https://pan.baidu.com/s/xxxxx",
    "password": "1234",
    "expire_time": "2024-01-01 00:00:00"
  }
}
```

---

## 3. 任务分类 API

### 3.1 获取所有分类

**端点:** `GET /api/categories`

**描述:** 获取所有任务分类

**需要登录:** ✅

**响应示例:**
```json
{
  "success": true,
  "categories": ["电影", "电视剧", "动漫", "纪录片"]
}
```

---

### 3.2 获取指定分类的任务

**端点:** `GET /api/tasks/category/<category>`

**描述:** 获取指定分类下的所有任务

**需要登录:** ✅

**路径参数:**
- `category`: 分类名称，使用 `uncategorized` 获取未分类任务

**响应示例:**
```json
{
  "success": true,
  "tasks": [
    {
      "url": "https://pan.baidu.com/s/xxxxx",
      "name": "电影更新",
      "category": "电影",
      "order": 1
    }
  ]
}
```

---

## 4. 用户管理 API

### 4.1 获取所有用户

**端点:** `GET /api/users`

**描述:** 获取所有百度网盘用户账号

**需要登录:** ✅

**响应示例:**
```json
{
  "success": true,
  "users": [
    {
      "username": "user1",
      "cookies": "BDUSS=...",
      "is_current": true
    }
  ],
  "current_user": "user1"
}
```

---

### 4.2 添加用户

**端点:** `POST /api/user/add`

**描述:** 添加新的百度网盘用户

**需要登录:** ✅

**请求参数:**
```json
{
  "username": "string",  // 用户名（自定义）
  "cookies": "string"    // 百度网盘cookies
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "添加用户成功"
}
```

---

### 4.3 切换用户

**端点:** `POST /api/user/switch`

**描述:** 切换当前使用的百度网盘账号

**需要登录:** ✅

**请求参数:**
```json
{
  "username": "string"  // 要切换到的用户名
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "切换用户成功",
  "current_user": {
    "username": "user1",
    "quota": {
      "total": 2199023255552,
      "used": 1099511627776,
      "total_gb": 2048.0,
      "used_gb": 1024.0,
      "percent": 50.0
    }
  },
  "login_status": true
}
```

---

### 4.4 删除用户

**端点:** `POST /api/user/delete`

**描述:** 删除百度网盘用户

**需要登录:** ✅

**请求参数:**
```json
{
  "username": "string"  // 要删除的用户名
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "删除用户成功"
}
```

**注意:** 不能删除当前正在使用的用户

---

### 4.5 更新用户信息

**端点:** `POST /api/user/update`

**描述:** 更新用户的cookies或重命名用户

**需要登录:** ✅

**请求参数:**
```json
{
  "original_username": "string",  // 原用户名
  "username": "string",           // 新用户名
  "cookies": "string"             // 新的cookies
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "用户更新成功"
}
```

---

### 4.6 获取用户Cookies

**端点:** `GET /api/user/<username>/cookies`

**描述:** 获取指定用户的cookies

**需要登录:** ✅

**路径参数:**
- `username`: 用户名

**响应示例:**
```json
{
  "success": true,
  "cookies": "BDUSS=..."
}
```

---

### 4.7 获取用户配额

**端点:** `GET /api/user/quota`

**描述:** 获取当前用户的网盘配额信息

**需要登录:** ✅

**响应示例:**
```json
{
  "success": true,
  "quota": {
    "total": 2199023255552,      // 总空间（字节）
    "used": 1099511627776,       // 已使用（字节）
    "total_gb": 2048.0,          // 总空间（GB）
    "used_gb": 1024.0,           // 已使用（GB）
    "percent": 50.0              // 使用百分比
  }
}
```

---

## 5. 配置管理 API

### 5.1 获取配置

**端点:** `GET /api/config`

**描述:** 获取系统配置

**需要登录:** ✅

**响应示例:**
```json
{
  "success": true,
  "config": {
    "cron": {
      "enabled": true,
      "schedule": "0 2 * * *"
    },
    "notify": {
      "enabled": true,
      "notification_delay": 30,
      "direct_fields": {
        "PUSH_PLUS_TOKEN": "xxx"
      }
    },
    "scheduler": {
      "max_workers": 3
    },
    "quota_alert": {
      "enabled": true,
      "threshold": 90
    },
    "share": {
      "default_password": "1234",
      "default_period_days": 7
    },
    "file_operations": {
      "retry_times": 3
    },
    "baidu": {
      "current_user": {
        "username": "user1",
        "cookies": "BDUSS=..."
      }
    }
  }
}
```

---

### 5.2 更新配置

**端点:** `POST /api/config/update`

**描述:** 更新系统配置

**需要登录:** ✅

**请求参数:**
```json
{
  "cron": {
    "enabled": true,
    "schedule": "0 2 * * *"
  },
  "notify": {
    "enabled": true,
    "notification_delay": 30,
    "direct_fields": {
      "PUSH_PLUS_TOKEN": "xxx"
    }
  }
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "更新配置成功"
}
```

---

### 5.3 更新分享配置

**端点:** `POST /api/config/share`

**描述:** 更新分享链接的默认配置

**需要登录:** ✅

**请求参数:**
```json
{
  "default_password": "1234",    // 默认提取码
  "default_period_days": 7       // 默认有效期（天）
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "分享配置已更新"
}
```

---

## 6. 通知管理 API

### 6.1 测试通知

**端点:** `POST /api/notify/test`

**描述:** 发送测试通知，验证通知配置是否正确

**需要登录:** ✅

**响应示例:**
```json
{
  "success": true,
  "message": "测试通知已发送"
}
```

---

### 6.2 添加通知字段

**端点:** `POST /api/notify/fields`

**描述:** 添加自定义通知字段

**需要登录:** ✅

**请求参数:**
```json
{
  "name": "PUSH_PLUS_TOKEN",   // 字段名
  "value": "xxx"                // 字段值
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "添加通知字段成功"
}
```

---

### 6.3 删除通知字段

**端点:** `DELETE /api/notify/fields`

**描述:** 删除通知字段

**需要登录:** ✅

**请求参数:**
```json
{
  "name": "PUSH_PLUS_TOKEN"  // 要删除的字段名
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "字段 PUSH_PLUS_TOKEN 已删除"
}
```

---

## 7. 分享链接 API

### 7.1 获取分享链接信息

**端点:** `POST /api/share/info`

**描述:** 获取百度网盘分享链接的文件夹名称等信息

**需要登录:** ✅

**请求参数:**
```json
{
  "url": "string",   // 分享链接
  "pwd": "string"    // 提取码（可选）
}
```

**响应示例:**
```json
{
  "success": true,
  "folder_name": "电影合集",
  "message": "获取文件夹名称成功"
}
```

---

## 8. 调度器 API

### 8.1 重新加载调度器

**端点:** `POST /api/scheduler/reload`

**描述:** 重新加载调度器，使配置更改生效

**需要登录:** ✅

**响应示例:**
```json
{
  "success": true,
  "message": "调度器已重新加载"
}
```

---

## 9. 日志 API

### 9.1 获取系统日志

**端点:** `GET /api/logs`

**描述:** 获取最近的系统日志

**需要登录:** ✅

**查询参数:**
- `limit`: 返回的日志条数，默认20

**响应示例:**
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2024-01-01 14:30:25",
      "level": "INFO",
      "message": "应用初始化完成"
    }
  ]
}
```

---

## 10. 版本检查 API

### 10.1 检查最新版本

**端点:** `GET /api/version/check`

**描述:** 检查是否有新版本可用

**需要登录:** ❌

**查询参数:**
- `source`: 版本源，可选值：`github`（默认）、`dockerhub`、`dockerhub_alt`、`msrun`

**响应示例:**
```json
{
  "success": true,
  "version": "v1.0.8",
  "published": "2024-01-01T00:00:00Z",
  "link": "https://github.com/kokojacket/baidu-autosave/releases/tag/v1.0.8",
  "source": "github"
}
```

---

## 附录

### A. 任务状态说明

| 状态 | 说明 |
|------|------|
| `normal` | 正常状态 |
| `running` | 正在执行 |
| `error` | 执行出错 |
| `success` | 执行成功 |
| `skipped` | 跳过（无新文件） |
| `failed` | 执行失败 |

### B. Cron表达式格式

标准的5位cron表达式：
```
* * * * *
│ │ │ │ │
│ │ │ │ └─ 星期几 (0-6, 0=周日)
│ │ │ └─── 月份 (1-12)
│ │ └───── 日期 (1-31)
│ └─────── 小时 (0-23)
└───────── 分钟 (0-59)
```

**示例：**
- `0 2 * * *` - 每天凌晨2点
- `0 */6 * * *` - 每6小时
- `0 0 * * 0` - 每周日凌晨

### C. 错误码说明

| HTTP状态码 | 说明 |
|-----------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未登录或认证失败 |
| 404 | 接口不存在 |
| 405 | 请求方法不允许 |
| 500 | 服务器内部错误 |

### D. 通知字段说明

常用的通知字段：

| 字段名 | 说明 | 示例 |
|--------|------|------|
| `PUSH_PLUS_TOKEN` | PushPlus推送token | `xxx` |
| `PUSH_PLUS_USER` | PushPlus群组编码 | `xxx` |
| `WEBHOOK_URL` | Webhook地址 | `https://xxx` |
| `WEBHOOK_BODY` | Webhook请求体模板 | `title: "$title"\ncontent: "$content"` |

---

## 开发建议

1. **认证处理**: 所有需要登录的接口都会检查session，未登录会返回401状态码
2. **错误处理**: 统一使用`success`字段判断操作是否成功，`message`字段包含详细信息
3. **轮询接口**: `/api/tasks/status`和`/api/task/log/<task_id>`适合用于轮询，建议间隔2-5秒
4. **异步任务**: 任务执行是异步的，调用执行接口后立即返回，需要通过轮询查看进度
5. **Session超时**: 默认超时时间为3600秒（1小时），可在配置中修改

---

**文档版本:** 1.0
**最后更新:** 2024-01-01
**维护者:** 百度网盘自动追更项目组
