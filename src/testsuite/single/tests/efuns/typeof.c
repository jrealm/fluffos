#include <lpctypes.h>

class foo {
    int x;
}

void do_tests() {
    class foo c = new(class foo);

    ASSERT(typeof(1) == INT);
    ASSERT(typeof(0) == INT);
    ASSERT(typeof(1.5) == FLOAT);
    ASSERT(typeof("") == STRING);
    ASSERT(typeof( ({}) ) == ARRAY);
    ASSERT(typeof( ([]) ) == MAPPING);
    ASSERT(typeof(this_object()) == OBJECT);
    ASSERT(typeof( (: do_tests :) ) == FUNCTION);
    ASSERT(typeof(c) == CLASS);
#ifndef __NO_BUFFER_TYPE__
    ASSERT(typeof(allocate_buffer(1)) == BUFFER);
#endif
}
