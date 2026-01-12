FROM python:3.9-slim
WORKDIR /app

# 1. 安装基础工具
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. 修复依赖兼容性 (huggingface_hub)
RUN pip install --no-cache-dir "huggingface_hub==0.23.0"

# 3. 修复缺失模块 (psutil)
RUN pip install --no-cache-dir psutil

# 4. 安装 CPU 版 PyTorch
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# 5. 安装 Transformers 及相关依赖
RUN pip install --no-cache-dir transformers accelerate sentencepiece protobuf

# 6. 安装图表库
RUN pip install --no-cache-dir plotly scipy

# 7. 安装 FastChat WebUI
RUN pip install --no-cache-dir "fschat[webui]"

# 8. 【新增】强制升级 Gradio
# FastChat 默认装的 Gradio 版本有 Bug，我们强制升级到 4.44.1 (4.x 系列的稳定版)
# 这一步必须放在最后，覆盖掉 fschat 安装的旧版本
RUN pip install --no-cache-dir "gradio==4.44.1"

COPY . .
ENV PYTHONUNBUFFERED=1
RUN chmod +x start.sh
CMD ["./start.sh"]
