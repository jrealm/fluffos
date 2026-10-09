void do_tests() {
    ASSERT(stringp(""));
    ASSERT(stringp("foo"));
    ASSERT(!stringp(0));
    ASSERT(!stringp( ({ "foo" }) ));
    ASSERT(!stringp(this_object()));
}
