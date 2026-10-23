# 海岸狂飙 · ROAD RAGE

[立即游玩](https://liutao1992.github.io/road-rage-pacific-ride/)

原创 3D 浏览器摩托游戏，致敬《暴力摩托》的公路竞速与战斗玩法。包含落日海岸、红杉山道和钢铁边缘三条原创路线，支持键盘和触屏。

| 按键 | 操作 |
| --- | --- |
| W / ↑ | 加速 |
| S / ↓ | 刹车 |
| A / D / ← / → | 转向 |
| 空格 + 转向 | 漂移，松开结算积分并补充氮气 |
| Shift | 氮气加速 |
| J / K | 左右近身攻击 |
| C | 切换镜头 |
| P / Esc | 暂停与继续 |
| R | 重新发车 |
| H | 完整操作指南 |
| M / B / F | 总声音 / 背景音乐 / 全屏 |

推荐首次选择“轻松兜风”。手机建议横屏，屏幕按钮支持多指同时操作。最佳成绩保存在当前浏览器。

纯静态站点，所有运行依赖均包含在仓库中。需要支持 WebGL 的现代浏览器。可用 `python3 -m http.server 8000` 本地预览。

GitHub Pages 使用 `main` 分支根目录作为发布源，`.nojekyll` 保证按原样提供静态文件。

游戏模型、纹理、赛道为原创程序生成内容，并非原版资源的精确复刻。Three.js r170 按 MIT 许可使用，见 [许可文件](vendor/LICENSE.three.txt)。

## 背景音乐

点击开始后自动播放原创器乐曲《Pacific Rebellion》，144 BPM、32 小节、约 53.33 秒循环。B 单独切换配乐，M 静音全部声音；也可以使用右上角 BGM 按钮。暂停时自动降低配乐音量，切换到其他标签页时暂停音频。

曲谱与合成脚本：[scripts/generate-soundtrack.mjs](scripts/generate-soundtrack.mjs)。脚本输出可重建的 WAV 中间文件到 `dist/audio/`；发布资源为 [audio/pacific-rebellion.mp3](audio/pacific-rebellion.mp3)，未使用原版游戏音轨。
