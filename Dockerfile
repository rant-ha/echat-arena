FROM python:3.9-slim
WORKDIR /app

# 1. 安装基础工具 
# 增加 build-essential，因为 psutil 有时需要编译 C 扩展
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. 修复依赖兼容性 (huggingface_hub)
RUN pip install --no-cache-dir "huggingface_hub==0.23.0"

# 3. 修复缺失模块 (psutil)
# 显式单独安装它，确保它一定存在
RUN pip install --no-cache-dir psutil

# 4. 安装 FastChat WebUI
RUN pip install --no-cache-dir "fschat[webui]"

# 复制当前目录下的所有文件到容器中
COPY . .

# 设置环境变量，确保 Python 输出直接打印到日志
ENV PYTHONUNBUFFERED=1

# 赋予启动脚本执行权限
RUN chmod +x start.sh

# 启动命令
CMD ["./start.sh"]
