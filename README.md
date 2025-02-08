# 百度网盘自动转存

一个基于Flask的百度网盘自动转存系统，支持多用户管理、定时任务调度和通知推送。

## 主要特性

- 🔄 自动转存：支持自动转存百度网盘分享链接到指定目录
- 👥 多用户管理：支持添加多个百度网盘账号
- ⏰ 定时任务：支持全局定时和单任务定时规则
- 📱 消息推送：支持多种通知方式（目前支持PushPlus）
- 🎯 任务分类：支持对任务进行分类管理
- 📊 状态监控：实时显示任务执行状态和进度
- 🔍 智能去重：自动跳过已转存的文件
- 🎨 美观界面：响应式设计，支持移动端访问

## 系统要求

- Python 3.8+
- Windows/Linux/MacOS

## 安装说明

1. 克隆仓库：
```bash
git clone https://github.com/your-username/baidu-autosave.git
cd baidu-autosave
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 运行应用：
```bash
python web_app.py
```

4. 访问Web界面：
```
http://localhost:5000
```

## 使用说明

### 1. 添加用户

1. 登录百度网盘网页版
2. 按F12打开开发者工具获取cookies
3. 在系统中添加用户，填入cookies

### 2. 添加任务

1. 点击"添加任务"按钮
2. 填写任务信息：
   - 任务名称（可选）
   - 分享链接（必填）
   - 保存目录（必填）
   - 定时规则（可选）
   - 分类（可选）

### 3. 定时设置

- 全局定时规则：适用于所有未设置自定义定时的任务
- 单任务定时：可为每个任务设置独立的定时规则
- 定时规则使用cron表达式，例如：
  - `*/5 * * * *` : 每5分钟执行一次
  - `0 */1 * * *` : 每小时执行一次
  - `0 8,12,18 * * *` : 每天8点、12点、18点执行

### 4. 通知设置

目前支持PushPlus推送服务：
1. 访问 [pushplus.plus](http://www.pushplus.plus) 获取Token
2. 在系统设置中填入Token
3. 可选填写群组编码用于群发

## 配置文件说明

`config.json` 包含以下主要配置：

```json
{
    "baidu": {
        "users": {},          // 用户信息
        "current_user": "",   // 当前用户
        "tasks": []          // 任务列表
    },
    "retry": {
        "max_attempts": 3,    // 最大重试次数
        "delay_seconds": 5    // 重试间隔
    },
    "cron": {
        "default_schedule": [], // 默认定时规则
        "auto_install": true    // 自动启动定时
    },
    "notify": {
        "enabled": true,      // 启用通知
        "channels": {         // 通知渠道配置
            "pushplus": {
                "token": "",
                "topic": ""
            }
        }
    },
    "scheduler": {
        "max_workers": 1,     // 最大工作线程数
        "misfire_grace_time": 3600,  // 错过执行的容错时间
        "coalesce": true      // 合并执行错过的任务
    }
}
```

## 常见问题

1. **任务执行失败**
   - 检查分享链接是否有效
   - 确认账号登录状态
   - 查看错误日志了解详细原因

2. **定时任务不执行**
   - 确认定时规则格式正确
   - 检查系统时间是否准确
   - 查看调度器日志

3. **通知推送失败**
   - 验证PushPlus Token是否正确
   - 测试通知功能
   - 检查网络连接

## 开发说明

### 项目结构

```
baidu-autosave/
├── web_app.py      # Web应用主程序
├── storage.py      # 存储管理模块
├── scheduler.py    # 任务调度模块
├── utils.py        # 工具函数
├── notify.py       # 通知模块
├── config.json     # 配置文件
├── requirements.txt # 依赖清单
├── static/         # 静态资源
│   ├── style.css   # 样式表
│   └── main.js     # 前端脚本
└── templates/      # 模板文件
    └── index.html  # 主页面
```

### 主要模块说明

- **web_app.py**: Web应用核心，处理HTTP请求和WebSocket通信
- **storage.py**: 管理百度网盘API调用和数据存储
- **scheduler.py**: 处理定时任务的调度和执行
- **notify.py**: 实现各种通知方式
- **utils.py**: 提供通用工具函数

## 更新日志

### v1.0.0
- 初始版本发布
- 实现基本功能：任务管理、定时执行、通知推送

## 许可证

MIT License

## 致谢

- [Flask](https://flask.palletsprojects.com/)
- [APScheduler](https://apscheduler.readthedocs.io/)
- [baidupcs-py](https://github.com/PeterDing/BaiduPCS-Py)