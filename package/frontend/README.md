# Prism 前端

React 19 + Vite 8（纯 JavaScript）。

```bash
npm install
npm run dev      # http://localhost:5191
npm run build    # 产物在 dist/，放到 .exe 同级的 frontend/ 目录即可被后端代理
```

## 分层（UI 与数据分离）

| 目录 | 职责 |
| --- | --- |
| `src/ui/` | 只做界面与交互：页面（home / group）、浮层（search / tags / tasks / settings / editors）、组件、图标、星月夜画作 |
| `src/bridge/` | 中间层：React hooks（Suspense 页面数据、按主题失效的缓存、实时任务/设置 store、乐观更新的页面设置） |
| `src/data/api/` | 数据层对外 API，UI 只经由 bridge 调用这里；每个接口的数据结构写在 `data/api/index.js` 的注释里 |
| `src/data/domain/` | 业务规则：搜索（各搜索域取并集）、标签的规范化与合并、画质档位 |
| `src/data/mock/` | 本轮的模拟后端：`backend.js`（分组、文件、媒体地址、搜索、标签、任务、设置）、`seed.js` + `content.js`（可确定生成的样例图库）、`art.js`（代替真实图片的 SVG 画作）、`persist.js`（代替 config.toml 与数据库里的页面设置）。接入 Go 服务时把 `data/api` 引用的 `mock/backend.js` 换成 HTTP/SSE 客户端即可 |

## 约定

- 路由为 hash：`#/`、`#/group/:id`、`#/group/:id/file/:fileId`（在分组里打开某个文件），任何目录下都可直接托管。
- 字体只使用 `public/fonts/` 中的三款 TTF（源文件在 `font/`）；图标全部来自 `src/ui/icons/Icon.jsx`（项目标志在 `Logo.jsx`），禁止 emoji。
- 文件的图片地址一律通过 `bridge` 的 `mediaUrl(file, quality)` 取得（`original` / `high` / `medium` / `low`），UI 不拼接后端地址；分组封面固定使用 `original`。
- 首页星月夜：`src/ui/art/starry/`，原样复用自 PostPock（厚涂引擎移植自 The Pelican Test 第 12 幕，MIT）。在 Web Worker 中绘制并缓存到 IndexedDB（`prism-art`），之后访问直接解码。
- 文案在 `src/i18n/`（简体中文 / English），两份词典的键保持一致。首次启动跟随系统的语言与深浅色。

## 首页

- 分组墙：封面默认按原始比例排成“两端对齐”的行（`ui/lib/justify.js`，极端比例收进 0.5–2.4 之间裁切显示）；分组栏上的图标开关可切换为统一方形。每张卡片都由计算出的位置摆放，切换排版、拖动排序、查找、新增或删除分组时卡片会滑到新位置。
- 在封面上左右移动指针，可以快速翻看分组里的几张图片（首次悬停时才加载）。
- 拖动卡片排序，松手后卡片从松手的位置滑入新位置；查找分组时暂停拖动。
- 上次浏览显示所在分组和它在分组中的位置；随机一张会洗一遍牌，再打开抽到的文件。

## 模拟层的行为

| 功能 | 模拟层的行为 |
| --- | --- |
| 样例图库 | 27 个分组、约 3400 个文件（含视频、ComfyUI 元信息、模型标签与手动标签、颜色组配置），按当天日期确定生成 |
| 持久化 | 设置（语言、主题）、首页的封面比例、分组顺序、上次浏览存在浏览器存储里（对应后端的 config.toml / sqlite）；新增、修改、删除分组只保存在内存中，刷新后回到样例库 |
| 以文搜图 / 以图搜图 | 需要后端具备图像索引，默认锁定。地址加上 `?image-search`（如 `http://localhost:5191/?image-search#/`）可模拟已建好索引的后端：以文搜图按画面内容与色调匹配，以图搜图按图片的整体色调匹配 |
| 任务 | 预置一个进行中的“重新索引”和一个排队中的“导入文件”；导入运行时文件会逐个加入“未整理”分组，首页的数量随之变化 |

## 阶段说明

本轮为第一阶段（基础设施、模拟数据、主页面）。以下入口已就位，目标页面在后续阶段完成：

- 导出：顶栏入口已有，导出配置页在第二阶段完成（目前点击会提示“这部分还在制作中”）。
- 设置：目前只有“常规”（语言、主题）；数据库路径、标签模型、GPU、文件命名、白板渲染器，以及数据备份、MCP、服务端模式在第二阶段加入。
- 分组页与灯箱：路由已就位，页面在第三阶段完成（目前显示分组名称和返回首页）。
