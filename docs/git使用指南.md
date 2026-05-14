# Git & GitHub 使用指南

> 本指南面向第一次使用 Git 的团队成员，目标是让你能独立完成日常工作流。
> 不需要搞懂所有概念，照着做就能用。

---

## 一、Git 和 GitHub 是什么？

先用一个比喻理解：

- **Git** 是一个"存档系统"，装在你电脑里。每次你改了文件，Git 帮你记录"改了什么、什么时候改的"，以后可以随时回到任意一个存档点。
- **GitHub** 是一个"云端存档服务器"，把你本地的存档同步到网上，团队所有人共享同一份最新内容。

日常工作流就三步：
```
① 从服务器拉取最新内容（pull）
② 在本地改文件
③ 把改动存档并推送到服务器（commit → push）
```

---

## 二、安装与初始配置

### 第一步：安装 Git

前往 https://git-scm.com/downloads 下载安装，一路点"Next"即可。

安装完后，打开**开始菜单**，搜索 `Git Bash`，点击打开。后续所有命令都在这个窗口里输入。

### 第二步：配置你的身份

第一次使用需要告诉 Git 你是谁（这会显示在每次提交记录上）：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

示例：
```bash
git config --global user.name "茉莉"
git config --global user.email "moli@example.com"
```

**只需要做一次，以后不用再设置。**

### 第三步：配置 SSH 密钥（让你免密码访问 GitHub）

在 Git Bash 里输入：

```bash
ssh-keygen -t ed25519 -C "你的邮箱"
```

一路按回车（不用设密码）。完成后输入：

```bash
cat ~/.ssh/id_ed25519.pub
```

会显示一长串以 `ssh-ed25519` 开头的文字，**全部复制**。

然后：
1. 登录 GitHub → 右上角头像 → **Settings**
2. 左侧菜单 → **SSH and GPG keys**
3. 点 **New SSH key**
4. Title 随便填（比如"我的电脑"），Key 里粘贴刚才复制的内容
5. 点 **Add SSH key**

验证一下是否成功：
```bash
ssh -T git@github.com
```

看到 `Hi 你的用户名! You've successfully authenticated` 就代表配置成功了。

---

## 三、第一次获取项目（Clone）

Clone 就是把 GitHub 上的项目完整下载到你电脑上，**只需要做一次**。

在 Git Bash 里，先进入你想放项目的目录，然后：

```bash
git clone git@github.com:RainbowLion0320/TabletopRPG.git
```

执行完后，当前目录下会多出一个 `TabletopRPG` 文件夹，里面就是完整的项目内容。

以后每次打开 Git Bash，需要先进入这个文件夹：
```bash
cd TabletopRPG
```

---

## 四、日常工作流

### 🔁 每次开始工作前：先拉取最新内容

在你动手改文件之前，先把别人最新的改动同步过来：

```bash
git pull
```

**养成习惯：每次坐下来开始工作的第一件事就是 `git pull`。** 否则你的文件可能是旧版本，改完提交容易出冲突。

---

### ✏️ 改文件

正常用你熟悉的软件改文件就行：

- **刘晓**：用任何 Markdown 编辑器编辑 `docs/` 里的文件（推荐 Typora 或 VS Code）
- **茉莉**：把美术资源文件放进 `assets/` 对应子目录
- **唐龙翔**：用 VS Code 编辑 `src/` 里的代码（流程稍有不同，见下方第五节）

---

### 💾 提交改动（Commit）

改完文件后，告诉 Git "我要存档这些改动"，分两步：

**第一步：告诉 Git 你要存档哪些文件**

如果你改了很多文件，全部存档：
```bash
git add .
```

如果只想存档某个文件：
```bash
git add docs/世界观简介.md
```

**第二步：存档，并写上这次改了什么**

```bash
git commit -m "这里写你改了什么"
```

提交说明怎么写？**简短描述你做了什么**，方便队友看懂：

```bash
# 好的例子
git commit -m "新增世界观简介初稿"
git commit -m "更新第一章剧本，补充地牢场景"
git commit -m "添加战士职业头像"

# 不好的例子
git commit -m "改了文件"
git commit -m "aaa"
git commit -m "update"
```

---

### ☁️ 推送到 GitHub（Push）

存档只是保存在你自己电脑上，还需要推送到 GitHub，队友才能看到：

```bash
git push
```

看到类似 `main -> main` 的输出就说明推送成功了。

---

### 完整流程回顾

```
每次工作开始  →  git pull           （拉取最新）
改文件        →  正常编辑保存
改完          →  git add .          （标记要存档的文件）
              →  git commit -m "说明"  （存档）
              →  git push           （推到 GitHub）
```

---

## 五、唐龙翔的工作流（代码开发，走 PR 流程）

由于 `src/` 里的代码直接影响游戏运行，需要 Robert review 之后再合并，所以唐龙翔走一套稍微不同的流程：**新建分支开发 → 提交 PR → Robert 审核合并**。

### 第一步：每次开始新功能前，新建一个分支

分支就像"草稿本"，在上面随便改，不会影响主线。

```bash
git checkout -b feature/你要做的功能
```

示例：
```bash
git checkout -b feature/character-creation   # 角色创建页
git checkout -b feature/main-ui              # 主界面
git checkout -b fix/dialog-bug               # 修复对话框 bug
```

### 第二步：正常开发、commit

跟上面一样，该 `add` 就 `add`，该 `commit` 就 `commit`，可以 commit 很多次。

### 第三步：推送这个分支到 GitHub

```bash
git push origin feature/你的分支名
```

第一次推新分支会提示你加 `--set-upstream`，直接复制它给的命令执行就行。

### 第四步：在 GitHub 上提交 PR

1. 打开 GitHub 仓库页面：https://github.com/RainbowLion0320/TabletopRPG
2. 页面顶部会出现一个黄色提示条，点 **Compare & pull request**
3. 写清楚这个 PR 做了什么（方便 Robert review）
4. 点 **Create pull request**

Robert 收到通知后会来看代码，没问题就合并到主线。

### 第五步：PR 合并后，回到主线更新

```bash
git checkout main   # 切回主线
git pull            # 拉取最新（包含刚合并的内容）
```

---

## 六、常见问题

### ❓ `git pull` 提示有冲突（conflict）怎么办？

冲突意味着你和别人修改了同一个文件的同一个地方。冲突的文件里会出现这样的内容：

```
<<<<<<< HEAD
你的版本
=======
别人的版本
>>>>>>> origin/main
```

手动编辑文件，保留正确的内容，删掉 `<<<<<<<`、`=======`、`>>>>>>>` 这些标记，然后重新 `add` 和 `commit`。

**最简单的预防方式：每次开始工作前先 pull，减少冲突发生概率。**

---

### ❓ 我 commit 完忘记 push 了，怎么确认有没有推上去？

```bash
git status
```

如果看到 `Your branch is ahead of 'origin/main' by N commits`，说明你有 N 条 commit 还没推。执行 `git push` 就行。

---

### ❓ 我想看看别人最近做了什么改动

```bash
git log --oneline -10
```

显示最近 10 条提交记录，每条一行，简洁明了。

---

### ❓ 我改坏了，想撤销还没 commit 的改动

```bash
git restore 文件名
```

示例：
```bash
git restore docs/世界观简介.md
```

⚠️ 这个操作会**丢弃**你对这个文件的所有改动，无法恢复，谨慎使用。

---

## 七、速查卡

```bash
# 每次开始工作
git pull

# 查看哪些文件改动了
git status

# 存档（全部文件）
git add .
git commit -m "改动说明"

# 推送到 GitHub
git push

# 查看提交历史
git log --oneline -10

# 唐龙翔：新建开发分支
git checkout -b feature/功能名

# 唐龙翔：推送分支
git push origin feature/功能名

# 切回主线
git checkout main
```

---

> 有任何问题直接问 Robert，或者在群里 @ 一下。别怕出错，Git 的大多数操作都是可以撤销的。
