#!/usr/bin/env python3
"""Network tests for the driver's output path (comm.c).

Run by run.sh inside a container whose net.ipv4.tcp_wmem is capped at 16K,
so a client that stops reading fills the driver's socket quickly.  Expects
the testsuite driver on port 4000 (telnet) and 4001 (websocket).

usage: nettest.py DEBUG_LOG
"""
import os, re, socket, struct, sys, time

HOST = "127.0.0.1"
TELNET_PORT, WS_PORT = 4000, 4001
LINE = 'sprintf("L%07d 0123456789abcdefghijklmnopqrstuvwxyz0123456789\\n", i)'
LINE_RE = rb"L(\d{7}) "
WHOLE_LINE_RE = rb"L\d{7} [0-9a-z]{46}\r\n"
OVERFLOW_LINES = 35000          # about 2MB, more than MAX_MESSAGE_BUFFER_SIZE
debug_log = sys.argv[1]


def lines_eval(n):
    return "eval for (int i = 0; i < %d; i++) write(%s)" % (n, LINE)


def missing_lines(data, n):
    nums = [int(m) for m in re.findall(LINE_RE, data)]
    return len(set(range(n)) - set(nums)), nums == sorted(nums)


class Telnet:
    def __init__(self):
        self.s = socket.socket()
        self.s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096)
        self.s.connect((HOST, TELNET_PORT))
        self.closed = False
        self.read_until(b"> ", 5)
        self.read_for(0.5)

    def send(self, cmd):
        self.s.sendall(cmd.encode() + b"\n")

    def read_until(self, token, limit):
        """Read until token arrives, the server closes, or limit passes."""
        data = b""
        end = time.time() + limit
        self.s.settimeout(0.5)
        while time.time() < end:
            try:
                d = self.s.recv(1 << 20)
            except socket.timeout:
                continue
            if not d:
                self.closed = True
                break
            data += d
            if token in data[-(len(d) + len(token)):]:
                break
        return data

    def read_for(self, limit):
        return self.read_until(b"\0never\0", limit)

    def alive(self):
        if self.closed:
            return False
        try:
            self.send("eval return 1+1")
        except OSError:
            return False
        return b"Result = 2" in self.read_until(b"Result = 2", 3)


class WebSocket:
    def __init__(self):
        self.s = socket.socket()
        self.s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096)
        self.s.connect((HOST, WS_PORT))
        self.s.sendall(b"GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\n"
                       b"Connection: Upgrade\r\nSec-WebSocket-Key: "
                       b"dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n")
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(4096)
        assert buf.startswith(b"HTTP/1.1 101"), buf
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.closed = False
        self.frames = []        # (header length, payload)
        self.read_until(b"> ", 5)
        self.frames.clear()

    def send(self, text):
        data = text.encode() + b"\n"
        mask = os.urandom(4)
        if len(data) < 126:
            hdr = bytes([0x81, 0x80 | len(data)])
        else:
            hdr = bytes([0x81, 0x80 | 126]) + struct.pack(">H", len(data))
        self.s.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _parse(self):
        new = []
        while len(self.buf) >= 2:
            n, off = self.buf[1] & 0x7f, 2
            if n == 126:
                if len(self.buf) < 4:
                    break
                n, off = struct.unpack(">H", self.buf[2:4])[0], 4
            elif n == 127:
                if len(self.buf) < 10:
                    break
                n, off = struct.unpack(">Q", self.buf[2:10])[0], 10
            if len(self.buf) < off + n:
                break
            assert self.buf[0] == 0x82, "bad frame header %r" % self.buf[:2]
            new.append((off, self.buf[off:off + n]))
            self.buf = self.buf[off + n:]
        self.frames += new
        return new

    def read_until(self, token, limit):
        end = time.time() + limit
        self.s.settimeout(0.5)
        while time.time() < end:
            if any(token in f for _, f in self._parse()):
                return True
            try:
                d = self.s.recv(1 << 20)
            except socket.timeout:
                continue
            if not d:
                self.closed = True
                return False
            self.buf += d
        return False

    def alive(self):
        if self.closed:
            return False
        try:
            self.send("eval return 1+1")
        except OSError:
            return False
        return self.read_until(b"Result = 2", 3)


def log_mark():
    try:
        return os.path.getsize(debug_log)
    except OSError:
        return 0


def logged_since(mark, text):
    try:
        with open(debug_log, "rb") as f:
            f.seek(mark)
            return text in f.read()
    except OSError:
        return False


# --- tests: each returns (ok, detail) ---

def telnet_slow_reader():
    """A burst bigger than the socket and buffer, read late: nothing lost."""
    n = 5000
    t = Telnet()
    t.send(lines_eval(n))
    time.sleep(3)
    data = t.read_until(b"Result = ", 20)
    missing, ordered = missing_lines(data, n)
    alive = t.alive()
    return (missing == 0 and ordered and alive,
            "missing %d, in order %s, alive %s" % (missing, ordered, alive))


def telnet_stopped_reader():
    """More than MAX_MESSAGE_BUFFER_SIZE behind: disconnected and logged."""
    mark = log_mark()
    t = Telnet()
    t.send(lines_eval(OVERFLOW_LINES))
    time.sleep(10)
    t.read_until(b"Result = ", 20)
    alive = t.alive()
    logged = logged_since(mark, b"client stopped reading")
    return (not alive and logged, "alive %s, logged %s" % (alive, logged))


def ws_slow_reader():
    """Same burst over websocket: whole lines per frame, 64-bit headers."""
    n = 5000
    w = WebSocket()
    w.send(lines_eval(n))
    time.sleep(3)
    w.read_until(b"Result = ", 20)
    data = b"".join(f for _, f in w.frames)
    missing, ordered = missing_lines(data, n)
    whole = sum(len(re.findall(WHOLE_LINE_RE, f)) for _, f in w.frames)
    headers = sorted({o for o, _ in w.frames})
    alive = w.alive()
    ok = missing == 0 and ordered and whole == n and 10 in headers and alive
    return ok, "missing %d, split %d, header sizes %s, alive %s" % (
        missing, n - whole - missing, headers, alive)


def ws_fast_reader():
    """A client that keeps up gets small frames and no split lines."""
    n = 2000
    w = WebSocket()
    w.send(lines_eval(n))
    w.read_until(b"Result = ", 20)
    data = b"".join(f for _, f in w.frames)
    missing, ordered = missing_lines(data, n)
    whole = sum(len(re.findall(WHOLE_LINE_RE, f)) for _, f in w.frames)
    return (missing == 0 and ordered and whole == n,
            "frames %d, missing %d, split %d" % (len(w.frames), missing, n - whole - missing))


def ws_stopped_reader():
    mark = log_mark()
    w = WebSocket()
    w.send(lines_eval(OVERFLOW_LINES))
    time.sleep(10)
    w.read_until(b"Result = ", 20)
    alive = w.alive()
    logged = logged_since(mark, b"client stopped reading")
    return (not alive and logged, "alive %s, logged %s" % (alive, logged))


def queued_commands():
    """Commands sent together run without waiting for select() timeouts."""
    n = 60
    t = Telnet()
    t.s.sendall(b"".join(b"eval return %d\n" % (1000 + k) for k in range(n)))
    start = time.time()
    data = t.read_until(b"Result = %d" % (1000 + n - 1), 5)
    took = time.time() - start
    got = len(set(re.findall(rb"Result = (\d+)", data)))
    return got == n and took < 0.5, "%d of %d results in %.2fs" % (got, n, took)


def big_gmcp():
    """A 48K GMCP message to a client reading late arrives whole."""
    t = Telnet()
    t.send('eval string *a = allocate(8000); for (int i = 0; i < 8000; i++) '
           'a[i] = sprintf("%05d", i); evaluate(bind((: send_gmcp($1) :), '
           'this_player()), "Big {\\"d\\":\\"" + implode(a, ",") + "\\"}"); return 7')
    time.sleep(2)
    data = t.read_until(b"Result = 7", 10)
    i = data.find(b"\xff\xfa\xc9")
    j = data.find(b"\xff\xf0", i)
    if i < 0 or j < 0:
        return False, "no GMCP subnegotiation found"
    items = data[i + 3:j].split(b'"d":"')[1].split(b'"')[0].split(b",")
    ok = items == [b"%05d" % k for k in range(8000)]
    return ok, "%d items, intact %s" % (len(items), ok)


def driver_error_encoding():
    """Errors the driver prints itself use the user's encoding."""
    t = Telnet()
    t.send('eval evaluate(bind((: set_encoding("UTF-16LE") :), this_player())); '
           'return this_object()->eval()')
    data = t.read_for(2)
    ok = "Too deep recursion".encode("utf-16le") in data
    return ok, "translated %s, raw %s" % (ok, b"Too deep recursion" in data)


TESTS = [telnet_slow_reader, telnet_stopped_reader, ws_slow_reader,
         ws_fast_reader, ws_stopped_reader, queued_commands, big_gmcp,
         driver_error_encoding]

failed = 0
for test in TESTS:
    try:
        ok, detail = test()
    except Exception as e:      # a broken test should fail, not stop the run
        ok, detail = False, "%s: %s" % (type(e).__name__, e)
    failed += not ok
    print("%s  %-22s %s" % ("PASS" if ok else "FAIL", test.__name__, detail), flush=True)
sys.exit(1 if failed else 0)
