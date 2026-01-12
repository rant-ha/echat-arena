FROM python:3.9-slim
WORKDIR /app

# 1. 安装基础工具
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. 【核心修复】锁定 Pydantic 和 HF Hub 版本
# Pydantic 必须锁定在 2.8.2，否则新版生成的 Schema 会搞崩 Gradio
# Huggingface_hub 必须锁定 0.23.0，否则报 HfFolder 错误
RUN pip install --no-cache-dir "pydantic==2.8.2" "huggingface_hub==0.23.0"

# 3. 安装 CPU 版 PyTorch (节省空间)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# 4. 补全模型与界面依赖 (防止缺包)
RUN pip install --no-cache-dir psutil transformers accelerate sentencepiece protobuf plotly scipy

# 5. 安装 FastChat WebUI
RUN pip install --no-cache-dir "fschat[webui]"

# 6. 再次强制锁定 Gradio
# 确保 fschat 没有把 Gradio 降级回旧版本
RUN pip install --no-cache-dir "gradio==4.44.1"

COPY . .
ENV PYTHONUNBUFFERED=1
RUN chmod +x start.sh
CMD ["./start.sh"]
