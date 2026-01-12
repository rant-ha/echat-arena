FROM python:3.9-slim
WORKDIR /app

# 1. 安装基础工具
# build-essential 用于编译 psutil 等扩展
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. 修复依赖兼容性 (huggingface_hub)
RUN pip install --no-cache-dir "huggingface_hub==0.23.0"

# 3. 修复缺失模块 (psutil)
RUN pip install --no-cache-dir psutil

# 4. 【新增】安装 CPU 版 PyTorch
# 必须使用 --index-url 指定下载 CPU 版本，否则体积太大无法部署
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# 5. 安装 FastChat WebUI
RUN pip install --no-cache-dir "fschat[webui]"

COPY . .
ENV PYTHONUNBUFFERED=1
RUN chmod +x start.sh
CMD ["./start.sh"]
