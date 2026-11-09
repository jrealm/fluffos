#!/bin/sh
# Build the driver with local_options.test in a Linux container, run the
# regular testsuite, then run nettest.py against a live driver.
#
# usage: testsuite/net/run.sh            build and test
#        testsuite/net/run.sh --clean    remove the container
#
# The container caps net.ipv4.tcp_wmem at 16K so that a client that stops
# reading fills the driver's socket within a few kilobytes.  The source
# tree is mounted read-only and built in /b inside the container.
set -e
cd "$(dirname "$0")/../.."
NAME=${NETTEST_CONTAINER:-fluffos-nettest}

if [ "$1" = "--clean" ]; then
	docker rm -f "$NAME" >/dev/null
	exit 0
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != "true" ]; then
	docker rm -f "$NAME" >/dev/null 2>&1 || true
	echo "creating container $NAME"
	docker run -d --name "$NAME" --sysctl net.ipv4.tcp_wmem="4096 16384 16384" \
		-v "$PWD":/ro:ro almalinux:10 sleep infinity >/dev/null
	docker exec "$NAME" bash -c 'dnf -y -q install dnf-plugins-core &&
		dnf config-manager --set-enabled crb &&
		dnf -y -q install gcc make bison findutils zlib-devel openssl-devel \
			pcre2-devel libpq-devel libxcrypt-devel jansson-devel \
			glibc-gconv-extra glibc-langpack-zh rsync python3 procps-ng' >/dev/null
fi

docker exec -i "$NAME" bash -s <<'EOF'
set -e
mkdir -p /b
rsync -a --exclude local_options --exclude GNUmakefile --exclude Makefile \
	--exclude packages/GNUmakefile --exclude obj --exclude driver \
	--exclude configure.h /ro/ /b/
cd /b
cp local_options.test local_options
if [ ! -f GNUmakefile ]; then
	echo "configuring"
	cp /ro/Makefile Makefile	# configure replaces it; later syncs skip it
	sh ./build.FluffOS debug >/tmp/configure.log 2>&1 || { tail -20 /tmp/configure.log; exit 1; }
fi
echo "building"
make -j"$(nproc)" >/tmp/make.log 2>&1 || { grep -E "error" /tmp/make.log | head -20; exit 1; }

cd testsuite
pkill -x driver 2>/dev/null || true
if timeout 300 ../driver etc/config.test -ftest >/tmp/testsuite.log 2>&1 &&
		grep -q "Checks succeeded" /tmp/testsuite.log; then
	echo "PASS  testsuite"
else
	echo "FAIL  testsuite"; tail -20 /tmp/testsuite.log
	exit 1
fi

# websocket on 4001, logging in through net/wslogin.c (rsync restores
# master.c on the next run)
cp net/wslogin.c clone/wslogin.c
sed -i 's/^connect()$/connect(int port)/' single/master.c
sed -i 's|^\(\s*\)err = catch(login_ob = new(LOGIN_OB));|\1if (port == 4001)\n\1\treturn new("/clone/wslogin");\n&|' single/master.c
cp etc/config.test etc/config.net
echo "external_port_2 : websocket 4001" >>etc/config.net

../driver etc/config.net >/tmp/driver.log 2>&1 &
for i in $(seq 50); do
	(exec 3<>/dev/tcp/127.0.0.1/4001) 2>/dev/null && break
	sleep 0.2
done
rc=0
python3 net/nettest.py log/debug.log || rc=$?
pkill -x driver || true
exit $rc
EOF
