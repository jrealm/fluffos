void do_tests() {
#ifndef __NO_ADD_ACTION__
    object tp;

    SAVETP;
    ASSERT(this_player(1) == this_interactive());
    enable_commands();
    ASSERT(this_player() == this_object());
    ASSERT(this_player(1) == this_interactive());
    RESTORETP;
    ASSERT(this_player() == tp);
    disable_commands();
#endif
}
