#!/bin/bash

# ==========================================
# 自动注入配置脚本
# 功能：读取 Heroku 环境变量，覆盖 json 文件里的配置
# ==========================================
python3 -c "
import os, json

# 配置文件路径
config_path = 'api_endpoints.json'

# 从环境变量获取配置
api_base = os.environ.get('OPENAI_API_BASE')
api_key = os.environ.get('OPENAI_API_KEY')

if os.path.exists(config_path):
    with open(config_path, 'r') as f:
        data = json.load(f)
    
    # 遍历所有模型，注入环境变量
    # 这样无论是 gpt-3.5 还是 gpt-4，都会用同一个中转地址和 key
    for model_name, config in data.items():
        if api_base:
            config['api_base'] = api_base
            print(f'注入 API_BASE 到 {model_name}')
        if api_key:
            config['api_key'] = api_key
            print(f'注入 API_KEY 到 {model_name}')

    # 写回文件
    with open(config_path, 'w') as f:
        json.dump(data, f, indent=2)
"
# ==========================================

# 1. 启动 Controller (后台运行)
python3 -m fastchat.serve.controller --host 127.0.0.1 --port 21001 &

# 等待 Controller 启动
sleep 5

# 2. 启动 FastAPI Arena API（替换原 Gradio 前端）
uvicorn app:app \
    --host 0.0.0.0 \
    --port $PORT \
    --workers 1
