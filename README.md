# FAST 精简静态网页

运行：在本文件夹中执行 `python -m http.server 8000`，或使用任意静态 HTTP 服务，然后打开 http://localhost:8000。不要通过 file:// 打开，点云及 Worker 需要 HTTP。可将本文件夹内容直接部署到 GitHub Pages。

保留现有所有结果、视频与点云场景。PNG 转为无损 WebP，像素和尺寸一致；JPEG 预览保留。点云采用 gzip，所有顶点、颜色和现有精度完全保留，浏览器在 Worker 内解压。视频保持原编码数据、分辨率和帧率，采用 faststart，并仅在需要播放时加载。

使用支持 WebP、WebGL 和 DecompressionStream 的现代 Chrome、Edge、Firefox 或 Safari。普通静态服务器无需配置 gzip Content-Encoding；.bin.gz 是文件内容，页面会自动识别并解压。若服务器自动解压，页面也可读取。正文使用的 Google Fonts 和论文链接仍需要联网。
