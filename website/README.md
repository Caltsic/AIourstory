# AIourStory Website

独立官网静态工程，默认包含 5 个页面：

- `index.html` 首页
- `features.html` 功能页
- `download.html` 下载页
- `about.html` 关于页
- `legal.html` 协议页

## 本地预览

在 `website/` 目录下用任意静态服务启动，例如：

```bash
python -m http.server 4173
```

然后访问 `http://127.0.0.1:4173`。

## Nginx 同域示例

将官网目录部署到 `/opt/aistory/ai-story-game/website` 后，可在 Nginx 中使用如下思路：

- `/v1/` 反代到 `127.0.0.1:3000/v1/`
- `/health` 反代到 `127.0.0.1:3000/health`
- `/admin/` 指向 `server/admin` 静态后台页面
- 其余路径回退到静态页面

示例（仅展示核心片段）：

```nginx
location = /health {
    proxy_pass http://127.0.0.1:3000/health;
}

location /v1/ {
    proxy_pass http://127.0.0.1:3000/v1/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /admin/ {
    root /opt/aistory/ai-story-game/server;
    try_files $uri $uri/ /admin/index.html;
}

location / {
    root /opt/aistory/ai-story-game/website;
    try_files $uri $uri/ /index.html;
}
```

## 上线前需要替换

- `download.html` 中 APK 链接
- `about.html` 中联系方式
- `legal.html` 中正式法务文本
- 各页面页脚备案号
