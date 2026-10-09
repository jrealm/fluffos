void do_tests() {
    ASSERT(arrayp( ({}) ));
    ASSERT(arrayp( ({ 1 }) ));
    ASSERT(arrayp(allocate(3)));
    ASSERT(!arrayp(0));
    ASSERT(!arrayp( ([]) ));
    ASSERT(!arrayp("foo"));
}
