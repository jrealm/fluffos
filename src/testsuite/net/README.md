# 網路輸出測試

`comm.c` 的輸出路徑（buffer 擴大、`WRITE_BLOCKED`、websocket frame、斷線判斷）需要真的 client 才能測，一般 testsuite（`-ftest`）測不到。這裡的測試會在 Linux container 裡編譯 driver、跑一般 testsuite，再用 python client 連上去測。

## 執行

需要 docker。在 `src/` 底下執行：

```sh
testsuite/net/run.sh          # 編譯並測試，第一次會建立 container
testsuite/net/run.sh --clean  # 移除 container
```

- container 名稱預設是 `fluffos-nettest`，可以用 `NETTEST_CONTAINER` 換掉。
- 原始碼以唯讀方式掛載，在 container 的 `/b` 裡用 `local_options.test` 編譯 debug 版。
- container 會把 `net.ipv4.tcp_wmem` 限制在 16K，讓不讀資料的 client 很快就把 socket 塞滿。這個設定只能在建立 container 時指定，所以測試要在 container 裡跑。

每一項會印出一行 `PASS` 或 `FAIL`，有任何一項失敗時 exit code 不是 0。

## 測試項目

| 測試 | 內容 |
|---|---|
| `testsuite` | 一般 testsuite（`-ftest`） |
| `telnet_slow_reader` | 一個指令輸出約 285KB，client 3 秒後才讀：不能缺行，連線要還在 |
| `telnet_stopped_reader` | 輸出約 2MB，client 10 秒不讀：要斷線，debug.log 要有 `client stopped reading` |
| `ws_slow_reader` | 同 `telnet_slow_reader`，走 websocket：每一行都在同一個 frame 裡，大 frame 要用 10-byte header |
| `ws_fast_reader` | websocket client 一直在讀：不缺行、不跨 frame（對照組） |
| `ws_stopped_reader` | 同 `telnet_stopped_reader`，走 websocket |
| `queued_commands` | 一次送 60 個指令：0.5 秒內全部有結果，不會被 `select()` 拖慢 |
| `big_gmcp` | 48K 的 GMCP，client 2 秒後才讀：開頭、內容、結尾都完整 |
| `driver_error_encoding` | driver 自己印的錯誤訊息（too deep recursion）要經過玩家的編碼轉換 |

## 檔案

- `run.sh`：建立 container、編譯、跑 testsuite、啟動 driver、跑 `nettest.py`。
- `nettest.py`：測試本身。
- `wslogin.c`：websocket 登入物件。`run.sh` 會在 container 裡把它放進 `clone/`，並修改 container 裡的 `single/master.c`，讓 4001 port 的連線用它登入。原始碼本身不會被修改。
