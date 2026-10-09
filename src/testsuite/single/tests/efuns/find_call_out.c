void do_tests() {
    ASSERT(find_call_out("foo") == -1);
    call_out("foo", 10);
    ASSERT(find_call_out("foo") == 10);
    ASSERT(find_call_out("bar") == -1);
    remove_call_out("foo");
#ifdef __CALLOUT_HANDLES__
    {
	int handle = call_out("foo", 20);

	ASSERT(handle > 0);
	ASSERT(find_call_out(handle) == 20);
	ASSERT(find_call_out(handle + 1) == -1);
	remove_call_out(handle);
	ASSERT(find_call_out(handle) == -1);
    }
#endif
}
