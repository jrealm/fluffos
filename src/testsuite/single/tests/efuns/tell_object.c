string heard;

void catch_tell(string str) {
    heard = str;
}

string query_heard() {
    return heard;
}

void do_tests() {
    object ob = new(__FILE__);

    heard = 0;
    tell_object(this_object(), "foo");
    ASSERT(heard == "foo");
    tell_object(ob, "bar\n");
    ASSERT(ob->query_heard() == "bar\n");
    ASSERT(heard == "foo");
    destruct(ob);
}
