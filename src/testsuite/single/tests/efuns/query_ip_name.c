void do_tests() {
    ASSERT(query_ip_name(this_object()) == 0);
    if (this_player())
	ASSERT(stringp(query_ip_name(this_player())));
}
