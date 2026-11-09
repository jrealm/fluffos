// Test-only websocket login for nettest.py: answer the upgrade request,
// then become a normal testsuite user.
#include <globals.h>

void logon() { }

void process_input(string str) {
    object user;

    write("HTTP/1.1 101 Switching Protocols\nUpgrade: websocket\n"
          "Connection: Upgrade\nSec-WebSocket-Accept: x\n\n");
    websocket_handshake_done();
    user = new("/clone/user");
    user->set_name("ws" + getoid(user));
    exec(user, this_object());
    user->setup();
    user->move(VOID_OB);
    destruct(this_object());
}
