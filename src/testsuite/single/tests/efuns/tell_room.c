string heard;

void catch_tell(string str) {
    heard = str;
}

string query_heard() {
    return heard;
}

void create(int flag) {
#ifndef __NO_ENVIRONMENT__
    if (flag) {
#ifndef __NO_ADD_ACTION__
	if (flag == 1)
	    enable_commands();
#endif
	move_object(previous_object());
    }
#endif
}

void do_tests() {
#ifndef __NO_ENVIRONMENT__
    object tp, ob1, ob2, ob3;

    SAVETP;
    ob1 = new(__FILE__, 1);
    ob2 = new(__FILE__, 1);
    ob3 = new(__FILE__, 2);
    RESTORETP;

    heard = 0;
    tell_room(this_object(), "foo");
    ASSERT(ob1->query_heard() == "foo");
    ASSERT(ob2->query_heard() == "foo");
    ASSERT(!heard);
#ifndef __NO_ADD_ACTION__
    // only livings hear
    ASSERT(!ob3->query_heard());
#endif

    tell_room(file_name(), "bar", ({ ob1 }));
    ASSERT(ob1->query_heard() == "foo");
    ASSERT(ob2->query_heard() == "bar");

    tell_room(this_object(), 42);
    ASSERT(ob1->query_heard() == "42");

    destruct(ob1);
    destruct(ob2);
    destruct(ob3);
#endif
}
