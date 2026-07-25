# 国防教育基地 · 三维游览

面向 GitHub Pages 的静态三维展示站点，源模型由 Blender 转换为面向网页传输的 GLB，并提供独立的移动端 AR 资产。

## 功能

- 全景拖拽、旋转和缩放
- 第一人称真实尺度游览
- 建筑与地面碰撞
- 桌面键盘/鼠标控制
- 手机虚拟摇杆与触屏环视
- Android WebXR / Scene Viewer
- iPhone AR Quick Look（USDZ）

## 操作

- 全景：鼠标拖拽旋转，滚轮缩放；手机上单指旋转、双指缩放
- 游览：`W A S D` 移动，鼠标环视，`Shift` 加速，`Space` 跨越台阶
- 手机游览：左侧摇杆移动，画面右侧滑动环视

## 本地预览

浏览器出于安全策略不能直接从 `file://` 加载模型，请使用本地 HTTP 服务：

```bash
python3 -m http.server 4173
```

然后打开 `http://localhost:4173/`。

## 技术说明

- Three.js 负责实时三维渲染、全景控制与第一人称游览
- 独立低面数碰撞模型配合 Octree + Capsule，用于静态建筑碰撞
- MeshOpt 用于 GLB 几何压缩
- `<model-viewer>` 负责 WebXR、Scene Viewer 与 Quick Look 的 AR 分发
- GitHub Pages 从 `main` 分支根目录直接发布
