#!/bin/bash

# 后台启动 Controller
python3 -m fastchat.serve.controller --host 127.0.0.1 --port 21001 &

# 等待 Controller 启动
sleep 5

# 启动 Web Server (多模型竞技场模式)
# --register-api-endpoint-file 读取你刚才的 json 配置
# $PORT 是 Heroku 自动分配的
python3 -m fastchat.serve.gradio_web_server_multi \
    --controller-url http://127.0.0.1:21001 \
    --register-api-endpoint-file api_endpoints.json \
    --host 0.0.0.0 \
    --port $PORT \
    --share
