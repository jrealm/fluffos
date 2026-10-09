void do_tests() {
    ASSERT(!userp(this_object()));
    if (this_player())
	ASSERT(userp(this_player()));
    ASSERT(sizeof(filter(users(), (: userp :))) == sizeof(users()));
}
