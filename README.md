# 图·声 · Image to Sound

GPLY ART STUDIO 创作的视听工作室。上传一幅图像或一段短视频，把画面的亮度、色相、纹理和运动转换成声音。

**[打开图·声工作室](https://eiyun.github.io/Image-to-sound/)**

点击播放即可试听《相位环》的 12 秒钢琴短旋律。钢琴支持短旋律和自由扫描，也可以切换白噪音或合成器。开启扫描光点后，每次琴键起音会在画面上留下一簇微光。

支持拖动、循环、独立视觉形变和立体声 WAV 导出。素材仅在浏览器本地处理。短视频最长 60 秒，最大 100 MB，解码格式取决于浏览器。

## 本地运行

使用 Node.js 20 或更高版本，在项目根目录运行：

```sh
node server.mjs
```

然后打开 <http://127.0.0.1:4173/>。运行测试：

```sh
node --test tests/engine.test.mjs
```

GitHub Pages 从 main 分支的 docs 目录发布，无需构建。
