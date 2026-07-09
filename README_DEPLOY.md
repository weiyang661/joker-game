# 五人牌局网页版公网联机版

这个目录就是可部署的网页联机应用。部署后，玩家打开同一个公网网址即可开房和加入。

## 本地运行

```powershell
cd C:\Users\21619\Documents\Codex\2026-07-09\1-2-4-3-100-20\outputs
node server.js
```

打开：

```text
http://localhost:8787
```

## 部署要求

- Node.js 20 或更高版本
- 启动命令：`npm start`
- 服务端口：读取环境变量 `PORT`，没有时默认 `8787`
- 健康检查路径：`/healthz`

## 推荐方案：Render 公网部署

Render 适合先做公网试玩版，不需要自己买云服务器、配置系统环境。这个目录已经包含 `package.json` 和 `render.yaml`。

操作步骤：

1. 把 `outputs` 目录里的文件上传到一个 GitHub 仓库。
2. 打开 Render，新建 Web Service。
3. 连接这个 GitHub 仓库。
4. 如果 Render 识别到 `render.yaml`，按提示创建服务即可。
5. 如果手动填写，使用：
   - Build Command：`npm install`
   - Start Command：`npm start`
   - Health Check Path：`/healthz`
6. 部署完成后，Render 会给一个公网网址，例如：

```text
https://five-player-card-game.onrender.com
```

所有玩家都打开这个网址即可联机。

## 部署到公网后的玩法

1. 房主打开公网网址。
2. 点击左侧“联机”里的“开房”。
3. 把房号发给其他玩家。
4. 其他玩家打开同一个公网网址，输入房号，选择座位 1-4，点击“加入”。
5. 所有已加入真人点击“准备”。
6. 房主点击“开始本局”后发牌。
7. 未加入真人的座位会继续由人机控制。

## 重要说明

当前版本是“房主权威”的网页联机版：房主浏览器运行完整牌局规则，服务器负责房间和消息转发。

适合公网试玩和规则验证。正式发布时，建议下一步把牌局规则迁移到服务器端，避免玩家通过浏览器开发者工具查看完整牌局状态。
