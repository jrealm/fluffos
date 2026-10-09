void do_tests() {
#ifndef __NO_ADD_ACTION__
    notify_fail("foo");
    if (this_player())
	ASSERT(query_notify_fail() == "foo");
    notify_fail((: write("hi!\n") :));
    if (this_player())
	ASSERT(functionp(query_notify_fail()));
#endif
}
