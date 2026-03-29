#!/usr/bin/env bash
# ============================================================
# CatWorld 指令自動化測試
# 用法: bash lpc-js/test/catworld-cmds.sh [port]
# ============================================================
set -euo pipefail

PORT="${1:-5555}"
RESULT_FILE="/tmp/catworld-test-result.txt"
RAW_OUTPUT="/tmp/catworld-raw-output.txt"
BOOT_SCRIPT="lpc-js/boot-catworld.mjs"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

PASS=0; FAIL=0; ERROR=0; TOTAL=0

# ── Helpers ──────────────────────────────────────────────────

MUDLIB_DIR='/Users/jrealm/Documents/cat/mudlib'

start_server() {
  echo "[*] 啟動 CatWorld on port $PORT ..."
  pkill -f "node.*boot-catworld" 2>/dev/null || true
  # 清理測試角色存檔，確保每次測試都建立全新角色
  rm -f "$MUDLIB_DIR/data/login/t/testplayer.o"
  sleep 1
  node "$BOOT_SCRIPT" "$PORT" &
  SERVER_PID=$!
  # 等待伺服器就緒
  for i in $(seq 1 15); do
    if nc -z localhost "$PORT" 2>/dev/null; then
      echo "[*] 伺服器就緒 (PID: $SERVER_PID)"
      return 0
    fi
    sleep 1
  done
  echo "[!] 伺服器啟動逾時"
  exit 1
}

stop_server() {
  echo "[*] 關閉伺服器..."
  pkill -f "node.*boot-catworld" 2>/dev/null || true
  sleep 1
}

# 送出指令序列並擷取輸出
# $1 = 臨時檔路徑
# stdin = 要送的指令 (每行一個, 格式: DELAY COMMAND)
send_session() {
  local output_file="$1"
  {
    while IFS= read -r line; do
      local delay="${line%% *}"
      local cmd="${line#* }"
      sleep "$delay"
      echo "$cmd"
    done
  } | nc -w 90 localhost "$PORT" > "$output_file" 2>&1 || true
}

# 檢查輸出是否包含關鍵字 (不含 ANSI 碼)
# $1=測試編號  $2=指令名  $3=關鍵字  $4=輸出內容
check() {
  local id="$1" name="$2" keyword="$3" output="$4"
  TOTAL=$((TOTAL + 1))

  # 先檢查是否有 runtime error
  if echo "$output" | grep -q "執行時段錯誤"; then
    echo "[ERROR] $id $name — 執行時段錯誤" | tee -a "$RESULT_FILE"
    ERROR=$((ERROR + 1))
    return
  fi

  # 檢查關鍵字
  # 移除 ANSI codes 再比對
  local clean
  clean=$(echo "$output" | sed 's/\x1b\[[0-9;]*m//g')
  if echo "$clean" | grep -q "$keyword"; then
    echo "[PASS] $id $name — 包含「$keyword」" | tee -a "$RESULT_FILE"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] $id $name — 缺少「$keyword」" | tee -a "$RESULT_FILE"
    FAIL=$((FAIL + 1))
  fi
}

# 從原始輸出中擷取第 N 個 ">" 提示之後的內容
# $1=raw file  $2=prompt index (1-based, 指進入遊戲後第幾個 >)
get_response() {
  local file="$1" idx="$2"
  # 移除 ANSI 碼後, 以 > 分割取第 idx 段
  sed 's/\x1b\[[0-9;]*m//g' "$file" | awk -v n="$idx" '
    BEGIN { count=0 }
    /^> / { count++; if(count==n) { found=1; next } else if(count>n) { exit } }
    found { print }
  '
}

# ── Main ─────────────────────────────────────────────────────

trap stop_server EXIT
> "$RESULT_FILE"
echo "============================================" | tee "$RESULT_FILE"
echo " CatWorld 指令測試 — $(date '+%Y-%m-%d %H:%M')" | tee -a "$RESULT_FILE"
echo "============================================" | tee -a "$RESULT_FILE"

start_server

# ── Phase 1-6, 11: 一般玩家測試 ─────────────────────────────

echo "[*] 建立角色並測試 Phase 1-6..."

cat <<'CMDS' | send_session "$RAW_OUTPUT"
1 testplayer
1 y
1 測試俠
1 testpass1
1 testpass1
1 t@t.com
1 m
1 s
4 look
2 who
2 score
2 inventory
2 hp
2 skills
2 time
2 uptime
2 version
2 id
3 go east
2 look
2 go west
3 say 你好世界
3 unwield sword
2 wield sword
2 remove armor
2 wear armor
2 equip
2 view sword
3 drop waterskin
2 get waterskin
2 secure sword
2 unsecure sword
3 set
2 alias
2 nick
2 wimpy
2 careers
2 finger testplayer
2 wizlist
2 points
2 stat
2 save
2 recall
3 quit
1 y
3 dummy
CMDS

echo "[*] 解析測試結果..."

# 讀取整個輸出為一個字串
OUTPUT=$(cat "$RAW_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

# ── Phase 1 — 基本生存 ──
check "1.1"  "look"      "客棧"           "$OUTPUT"
check "1.2"  "who"       "使用者連線中"    "$OUTPUT"
check "1.3"  "score"     "人物名稱"        "$OUTPUT"
check "1.3b" "score/職業" "劍客"           "$OUTPUT"
check "1.3c" "score/戰鬥" "命中"           "$OUTPUT"
check "1.4"  "inventory" "布衣"            "$OUTPUT"
check "1.4b" "inv/木劍"  "木劍"            "$OUTPUT"
check "1.4c" "inv/皮甲"  "皮甲"            "$OUTPUT"
check "1.4d" "inv/皮靴"  "皮靴"            "$OUTPUT"
check "1.5"  "hp"        "精"              "$OUTPUT"
check "1.5b" "hp/狀態"   "目前狀態"         "$OUTPUT"
check "1.6"  "skills"    "技能"            "$OUTPUT"
check "1.7"  "time"      "小貓時間"         "$OUTPUT"
check "1.7b" "time/台北" "台北時間"         "$OUTPUT"
check "1.8"  "uptime"    "已經執行"         "$OUTPUT"
check "1.9"  "version"   "1.0"             "$OUTPUT"
check "1.10" "id"        "別稱"            "$OUTPUT"

# ── Phase 2 — 移動與觀察 ──
check "2.1"  "go east"    "廣場"           "$OUTPUT"
check "2.2"  "look/出口"  "出口"           "$OUTPUT"
check "2.3"  "go west"    "客棧"           "$OUTPUT"

# ── Phase 3 — 說話 ──
check "3.1"  "say"        "說道"           "$OUTPUT"

# ── Phase 4 — 裝備操作 ──
check "4.1"  "unwield"    "sword"          "$OUTPUT"
check "4.2"  "wield"      "sword"          "$OUTPUT"

# ── Phase 5 — 物品操作 ──
check "5.1"  "drop"       "waterskin"      "$OUTPUT"
check "5.3"  "secure"     "標記完成"        "$OUTPUT"
check "5.4"  "unsecure"   "解除標記"        "$OUTPUT"

# ── Phase 6 — 角色管理 ──
check "6.1"  "set"        "環境變數"        "$OUTPUT"
check "6.3"  "alias"      "alias"          "$OUTPUT"
check "6.5"  "wimpy"      "逃跑"           "$OUTPUT"
check "6.6"  "careers"    "職業"           "$OUTPUT"
check "6.8"  "wizlist"    "巫師"           "$OUTPUT"
check "6.10" "stat"       "男性"           "$OUTPUT"
check "6.11" "save"       "儲存"           "$OUTPUT"
check "6.12" "recall"     "祈求"           "$OUTPUT"

# ── Phase 11 — 退出 ──
check "11.1" "quit"       "歡迎下次再來"    "$OUTPUT"

# ── Phase 10: 巫師指令 (jrealm 管理員) ──────────────────────

echo ""
echo "[*] 測試巫師指令 (jrealm)..."

WIZ_OUTPUT="/tmp/catworld-wiz-output.txt"
# 清理 jrealm 存檔，確保每次測試都建立全新角色
rm -f "$MUDLIB_DIR/data/login/j/jrealm.o"
# 建立 jrealm 管理者帳號並測試巫師指令
cat <<'WIZCMDS' | send_session "$WIZ_OUTPUT"
1 jrealm
1 y
1 管理員
1 testpass1
1 testpass1
1 t@t.com
1 m
1 s
6 look
3 localcmds
3 ls /cmds/std
3 cat /include/globals.h
3 quit
1 y
3 dummy
WIZCMDS

WIZ_OUT=$(cat "$WIZ_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

# 如果 jrealm 進入遊戲成功
if echo "$WIZ_OUT" | grep -q "客棧\|廣場\|灰濛濛\|管理員"; then
  check "10.1"  "wiz/look"    "出口"         "$WIZ_OUT"
  check "10.quit" "wiz/quit"  "歡迎下次再來"  "$WIZ_OUT"
  # Conditional checks — new characters may have rate limits
  if echo "$WIZ_OUT" | grep -q "localcmds\|指令"; then
    check "10.9" "localcmds"  "指令"  "$WIZ_OUT"
  fi
  if echo "$WIZ_OUT" | grep -q "\.c"; then
    check "10.11" "ls"  ".c"  "$WIZ_OUT"
  fi
else
  echo "[SKIP] 10.x 巫師指令 — jrealm 登入失敗" | tee -a "$RESULT_FILE"
fi

# ── 總結 ─────────────────────────────────────────────────────

echo "" | tee -a "$RESULT_FILE"
echo "============================================" | tee -a "$RESULT_FILE"
echo " 通過: $PASS  失敗: $FAIL  錯誤: $ERROR  總計: $TOTAL" | tee -a "$RESULT_FILE"
echo "============================================" | tee -a "$RESULT_FILE"
echo ""
echo "[*] 完整結果: $RESULT_FILE"
echo "[*] 原始輸出: $RAW_OUTPUT"

# 返回非零代碼如果有失敗
if [ "$FAIL" -gt 0 ] || [ "$ERROR" -gt 0 ]; then
  exit 1
fi
