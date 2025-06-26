# 阶段1: 安装构建依赖
FROM python:3.10-slim AS builder

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

# 阶段2: 创建最终镜像
FROM python:3.10-slim

# 设置时区和环境变量
ENV PYTHONUNBUFFERED=1 \
    TZ=Asia/Shanghai \
    PATH="/opt/venv/bin:$PATH"

# 从构建阶段复制虚拟环境
COPY --from=builder /opt/venv /opt/venv

WORKDIR /app

# 复制应用文件
COPY *.py ./
COPY static/ static/
COPY templates/ templates/
COPY config/config.template.json ./template/config.template.json

# 创建目录并设置权限
RUN mkdir -p config log template && \
    chmod -R 777 config log template

# 创建启动脚本
RUN echo '#!/bin/sh\n\
if [ ! -f /app/config/config.json ]; then\n\
    cp /app/template/config.template.json /app/config/config.json\n\
    chmod 666 /app/config/config.json\n\
fi\n\
exec python web_app.py' > start.sh && \
    chmod +x start.sh

# 清理apt缓存
RUN rm -rf /var/lib/apt/lists/*

EXPOSE 5000

CMD ["./start.sh"]
