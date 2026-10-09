void foo(string c) {}

void do_tests() {
#ifndef __NO_ADD_ACTION__
    object tp;

    // only an interactive command giver can get a char
    SAVETP;
    enable_commands();
    ASSERT(!get_char((: foo :)));
    ASSERT(!get_char("foo", 1));
    RESTORETP;
#endif
}
