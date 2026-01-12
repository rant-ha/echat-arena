# 使用官方 Python 环境
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 安装 git (fschat 安装时可能需要)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 安装 FastChat 的 WebUI 组件
# 我们直接从官方源安装，这样你不需要上传那几百兆的源代码
RUN pip install --no-cache-dir "fschat[webui]"

# 复制当前目录下的所有文件到容器中
COPY . .

# 设置环境变量，确保 Python 输出直接打印到日志
ENV PYTHONUNBUFFERED=1

# 赋予启动脚本执行权限
RUN chmod +x start.sh

# 启动命令
CMD ["./start.sh"]
