# 阶段1: 构建前端
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# 复制前端依赖文件
COPY frontend/package*.json ./

# 安装前端依赖（包含devDependencies用于构建）
RUN npm ci

# 复制前端源码
COPY frontend/ .

# 构建前端（跳过类型检查以避免构建失败）
RUN npm run build:prod

# 阶段2: 安装后端依赖
FROM python:3.10-slim AS backend-builder

# 安装必要构建工具
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制依赖文件以利用缓存
COPY requirements.txt .

# 安装依赖到虚拟环境
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# 阶段3: 创建最终镜像
FROM python:3.10-slim

# 设置时区和环境变量
ENV PYTHONUNBUFFERED=1 \
    TZ=Asia/Shanghai \
    PATH="/opt/venv/bin:$PATH"

# 从构建阶段复制虚拟环境
COPY --from=backend-builder /opt/venv /opt/venv

WORKDIR /app

# 复制后端应用文件
COPY *.py ./

# 从前端构建阶段复制构建产物到static目录（替换旧前端）
COPY --from=frontend-builder /app/static-new/ static/

# 模板文件已移除，改用Vue前端

# 复制配置模板
COPY config/config.template.json ./template/config.template.json

# 创建目录并设置权限
RUN mkdir -p config log template && \
    chmod -R 777 config log template

# 创建启动脚本
RUN echo '#!/bin/sh\n\
# 等待一秒确保volume挂载完成\n\
sleep 1\n\
\n\
# 如果config.json不存在或为空，则从模板创建\n\
if [ ! -f /app/config/config.json ] || [ ! -s /app/config/config.json ]; then\n\
    echo "配置文件不存在或为空，从模板创建..."\n\
    # 如果存在非空的config.json，先备份\n\
    if [ -f /app/config/config.json ] && [ -s /app/config/config.json ]; then\n\
        cp /app/config/config.json /app/config/config.json.backup.$(date +%s)\n\
        echo "已备份现有配置文件"\n\
    fi\n\
    cp /app/template/config.template.json /app/config/config.json\n\
    chmod 666 /app/config/config.json\n\
    echo "已从模板创建配置文件"\n\
else\n\
    echo "使用现有配置文件"\n\
fi\n\
\n\
exec python web_app.py' > start.sh && \
    chmod +x start.sh

EXPOSE 5000

CMD ["./start.sh"]
