# CatWorld 指令測試計劃

> 針對 `mudlib/cmds/` 下所有指令的自動化測試規劃，供 lpc-js driver 開發時重複驗證。
>
> **最新結果 (2026-03-29): 38/38 通過，零失敗**
> 執行方式: `bash lpc-js/test/catworld-cmds.sh`

## 測試架構

### 執行方式

每個測試透過 `nc` 連線到 boot-catworld.mjs（port 5555），依序送出指令並檢查輸出。
測試腳本位於 `lpc-js/test/catworld-cmds.sh`，可重複執行。

### 帳號與角色

- 英文名: `testplayer`
- 中文名: `測試俠`
- 密碼: `testpass1`
- 性別: 男 (m)
- 職業: 劍客 (s)

### 判斷標準

每條指令的輸出必須：
1. **不含** `執行時段錯誤` 或 `Error`
2. **包含** 該指令的預期關鍵字（見下表）
3. 指令返回後仍有 `>` 提示符（代表角色仍在線）

---

## Phase 1 — 基本生存指令（必須全通過）

創角後立即可測試，不需任何前置條件。

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 1.1 | look | std/觀察 | `look` | `醉仙樓客棧` 或房間描述 |
| 1.2 | who | usr/資訊 | `who` | `使用者連線中` |
| 1.3 | score | usr/狀態 | `score` | `人物名稱` `天賦` |
| 1.4 | inventory | usr/物品 | `inventory` | `布衣` `木劍` `皮甲` |
| 1.5 | hp | usr/狀態 | `hp` | `精` `氣` `神` |
| 1.6 | skills | usr/技能 | `skills` | `技能` |
| 1.7 | time | usr/資訊 | `time` | `小貓時間` `台北時間` |
| 1.8 | uptime | usr/資訊 | `uptime` | `已經執行` |
| 1.9 | version | usr/資訊 | `version` | (任何輸出，不報錯) |
| 1.10 | id | usr/資訊 | `id` | `testplayer` 或角色名 |

## Phase 2 — 移動與觀察

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 2.1 | go | std/移動 | `go east` | `廣場` 或新房間名 |
| 2.2 | look (房間) | std/觀察 | `look` | `出口` |
| 2.3 | go (返回) | std/移動 | `go west` | `客棧` |
| 2.4 | look (物件) | std/觀察 | `look sign` | 招牌描述或 `沒有這樣東西` |
| 2.5 | look (self) | std/觀察 | `look me` | 角色描述 |

## Phase 3 — 說話與溝通

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 3.1 | say | std/溝通 | `say 你好世界` | `說道` `你好世界` |
| 3.2 | shout | std/溝通 | `shout 大聲喊` | `喊` 或錯誤提示 |
| 3.3 | history | std/溝通 | `history` | (歷史記錄或空) |

> **注意**: `tell`, `whisper` 需要第二個玩家在線，暫時跳過。
> `chat` 等頻道指令新角色有禁言期（5分鐘），測試時注意。

## Phase 4 — 裝備操作

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 4.1 | unwield | std/裝備 | `unwield sword` | `收起` 或武器名 |
| 4.2 | wield | std/裝備 | `wield sword` | `拿起` `武器` |
| 4.3 | remove | std/裝備 | `remove armor` | `脫下` 或防具名 |
| 4.4 | wear | std/裝備 | `wear armor` | `穿上` `防具` |
| 4.5 | equip | usr/裝備 | `equip` | 裝備列表或 `沒有` |
| 4.6 | view | std/觀察 | `view sword` | 武器屬性資訊 |

## Phase 5 — 物品操作

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 5.1 | drop | std/物品 | `drop waterskin` | `丟下` 或物品名 |
| 5.2 | get | std/物品 | `get waterskin` | `撿起` 或物品名 |
| 5.3 | secure | std/物品 | `secure sword` | `鎖定` 或物品名 |
| 5.4 | unsecure | std/物品 | `unsecure sword` | `解除` 或物品名 |

> `give`, `put` 需要第二個玩家/容器，測試時注意。

## Phase 6 — 角色管理

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 6.1 | set | usr/設定 | `set` | 設定選項或列表 |
| 6.2 | unset | usr/設定 | `unset` | (不報錯) |
| 6.3 | alias | usr/設定 | `alias` | `別名` 或列表 |
| 6.4 | nick | usr/設定 | `nick` | `暱稱` |
| 6.5 | wimpy | usr/戰鬥 | `wimpy` | `逃跑` |
| 6.6 | careers | usr/職業 | `careers` | `職業` |
| 6.7 | finger | usr/資訊 | `finger testplayer` | 玩家資訊 |
| 6.8 | wizlist | usr/資訊 | `wizlist` | 巫師列表 |
| 6.9 | points | usr/資訊 | `points` | 分數或經驗資訊 |
| 6.10 | stat | usr/資訊 | `stat` | 屬性統計 |
| 6.11 | save | usr/系統 | `save` | `存檔` |
| 6.12 | recall | usr/系統 | `recall` | `回到` 或移動 |
| 6.13 | help | usr/說明 | `help newbie` | 新手相關說明 |

## Phase 7 — NPC 互動（需在有 NPC 的房間）

> 需先移動到有 NPC 的房間（如 `go south` 到有商人的地方）

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 7.1 | talk | std/NPC | `talk <npc>` | 對話或 `沒有` |
| 7.2 | ask | std/NPC | `ask <npc> about job` | 回應或 `沒有` |

## Phase 8 — 戰鬥系統（需找到可攻擊的 NPC）

> 高風險：可能導致角色死亡。建議在 Phase 1-7 全通過後才測試。

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 8.1 | kill | std/戰鬥 | `kill <mob>` | 攻擊描述 |
| 8.2 | fight | std/戰鬥 | `fight <mob>` | 戰鬥描述 |
| 8.3 | surrender | std/戰鬥 | `surrender` | `投降` |
| 8.4 | run | std/移動 | `run east` | 逃跑 |

## Phase 9 — 技能與修練

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 9.1 | exercise | std/修練 | `exercise` | `修練` 或提示 |
| 9.2 | meditate | std/修練 | `meditate` | `冥想` 或提示 |
| 9.3 | practice | std/修練 | `practice` | `練習` 或提示 |
| 9.4 | learn | std/技能 | `learn` | `學習` 或提示 |
| 9.5 | study | std/技能 | `study` | `研讀` 或提示 |
| 9.6 | qskill | std/技能 | `qskill` | 技能資訊 |

## Phase 10 — 巫師指令（jrealm 管理員帳號）

> 用 `jrealm` 帳號登入才有權限。

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 10.1 | goto | imm/移動 | `goto /d/city/square` | 新房間描述 |
| 10.2 | where | apr/資訊 | `where` | 位置列表 |
| 10.3 | clone | apr/物件 | `clone /obj/waterskin` | `複製` 或物件名 |
| 10.4 | dest | apr/物件 | `dest waterskin` | `摧毀` |
| 10.5 | update | apr/編譯 | `update /cmds/usr/who` | `更新` |
| 10.6 | data | apr/偵錯 | `data me` | 角色資料 |
| 10.7 | call | wiz/偵錯 | `call me->query("id")` | `testplayer` 或 `jrealm` |
| 10.8 | status | wiz/系統 | `status` | 系統狀態 |
| 10.9 | localcmds | wiz/指令 | `localcmds` | 指令列表 |
| 10.10 | mem | wiz/系統 | `mem` | 記憶體資訊 |
| 10.11 | ls | imm/檔案 | `ls /cmds/std` | 檔案列表 |
| 10.12 | cat | imm/檔案 | `cat /cmds/usr/who.c` | 原始碼 |
| 10.13 | home | apr/移動 | `home` | 回到工作間 |
| 10.14 | invisible | apr/狀態 | `invisible` | `隱形` |
| 10.15 | visible | apr/狀態 | `visible` | `現形` |

## Phase 11 — 退出流程

| # | 指令 | 分類 | 測試輸入 | 預期輸出關鍵字 |
|---|------|------|----------|----------------|
| 11.1 | quit | usr/系統 | `quit` → `y` | `歡迎下次再來` |

---

## 暫不測試的指令

這些指令需要特殊前置條件（多人互動、特定物件、遊戲進度），不在自動化範圍：

| 指令 | 原因 |
|------|------|
| tell, whisper | 需要第二個玩家在線 |
| give | 需要第二個玩家在場 |
| put | 需要容器物件 |
| open, close | 需要門/容器（客棧有 door，可嘗試） |
| kill, fight | 需要可攻擊 NPC，可能導致死亡 |
| team, follow, recruit, expell | 需要多人 |
| clan, marry | 需要幫會/結婚系統 |
| cast, conjure, exert, perform | 需要學會技能 |
| enchant, scribe | 需要特殊物品 |
| battle, duel | 需要武鬥系統前置 |
| suicide | 危險指令 |
| auc, rent, repair, sac | 需要特殊 NPC/場所 |
| promote, purge, reboot | 管理員危險指令 |
| snoop, possess, summon | 需要目標玩家 |
| passwd | 需要互動式密碼輸入 |
| gmcp/* | 需要 GMCP 協議支持 |

---

## 自動化腳本規範

### 腳本路徑
`lpc-js/test/catworld-cmds.sh`

### 執行流程
```
1. 啟動 boot-catworld.mjs (port 5555)
2. 等待 "CatWorld is running"
3. 依序執行 Phase 1-6, 10-11
4. 每個 Phase 間 sleep 2s 避免頻率限制
5. 收集輸出到 /tmp/catworld-test-result.txt
6. 解析結果：統計通過/失敗數
7. 關閉伺服器
```

### 結果格式
```
[PASS] 1.1 look — 包含「客棧」
[PASS] 1.2 who — 包含「使用者連線中」
[FAIL] 4.5 equip — 缺少預期輸出「裝備」
[ERROR] 8.1 kill — 執行時段錯誤
---
通過: 42/50  失敗: 6  錯誤: 2
```
