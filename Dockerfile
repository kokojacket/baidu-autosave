FROM python:3.10

WORKDIR /app

# 安装系统依赖
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制项目文件
COPY requirements.txt .
COPY *.py ./
COPY static/ static/
COPY templates/ templates/
COPY config/config.template.json /app/template/config.template.json

# 创建必要的目录
RUN mkdir -p config && \
    mkdir -p log && \
    mkdir -p template

# 创建启动脚本
RUN echo '#!/bin/sh\n\
if [ ! -f /app/config/config.json ]; then\n\
    cp /app/template/config.template.json /app/config/config.json\n\
fi\n\
exec python web_app.py' > /app/start.sh && \
    chmod +x /app/start.sh

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV TZ=Asia/Shanghai

# 暴露端口
EXPOSE 5000

# 启动命令
CMD ["/app/start.sh"]