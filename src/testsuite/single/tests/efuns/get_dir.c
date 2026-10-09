void do_tests() {
    mixed *dir = get_dir("/");

    ASSERT(member_array("single", dir) != -1);
    // names starting with '.' are hidden unless a pattern is given
    ASSERT(file_size("/.edrc") > 0);
    ASSERT(!sizeof(filter(dir, (: $1[0] == '.' :))));
    ASSERT(same(get_dir("/.edrc"), ({ ".edrc" })));
    ASSERT(member_array(".edrc", get_dir("/.*")) != -1);
    ASSERT(same(get_dir("/single/tests/efuns/inh?.c"), ({ "inh0.c", "inh1.c", "inh2.c" })));
    ASSERT(same(get_dir("/single/tests/efuns/no_such_*"), ({})));
    ASSERT(!get_dir("/does_not_exist/"));

    dir = get_dir("/single/tests/efuns/inh1.c", -1);
    ASSERT(sizeof(dir) == 1);
    ASSERT(dir[0][0] == "inh1.c");
    ASSERT(dir[0][1] == file_size("/single/tests/efuns/inh1.c"));
    ASSERT(intp(dir[0][2]));

    dir = get_dir("/single/tests/", -1);
    ASSERT(sizeof(filter(dir, (: $1[0] == "efuns" && $1[1] == -2 :))) == 1);
}
