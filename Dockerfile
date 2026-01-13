FROM python:3.9-slim
WORKDIR /app

# 1-6. 依赖安装（尽量收敛层数，避免无用系统包进入最终镜像）
# 说明：保留 google-api-python-client/google-auth 用于 Drive API 上传 CSV（符合“上传文件到 Drive”而非实时写 Sheets）。
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    \
    # 2. 【核心修复】锁定 Pydantic 和 HF Hub 版本
    # Pydantic 必须锁定在 2.8.2，否则新版生成的 Schema 会搞崩 Gradio
    # Huggingface_hub 必须锁定 0.23.0，否则报 HfFolder 错误
    && pip install --no-cache-dir "pydantic==2.8.2" "huggingface_hub==0.23.0" \
    \
    # 3. 安装 CPU 版 PyTorch (节省空间)
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    \
    # 4. 补全模型与界面依赖 (防止缺包)
    && pip install --no-cache-dir psutil transformers accelerate sentencepiece protobuf plotly scipy \
    \
    # 4.1 归档任务（可选）：apscheduler + Google Drive API 客户端
    # 注意：归档逻辑会在 ARCHIVE_ENABLED=true/1 时才启动（见 app.py）
    && pip install --no-cache-dir apscheduler google-api-python-client google-auth \
    \
    # 5. 安装 FastChat WebUI
    && pip install --no-cache-dir "fschat[webui]" \
    \
    # 6. 再次强制锁定 Gradio
    # 确保 fschat 没有把 Gradio 降级回旧版本
    && pip install --no-cache-dir "gradio==4.44.1" \
    \
    # 尽量移除构建工具，减小最终镜像体积
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY . .
ENV PYTHONUNBUFFERED=1
RUN chmod +x start.sh
CMD ["./start.sh"]
