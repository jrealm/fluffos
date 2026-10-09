void do_tests() {
#ifdef __PACKAGE_CONTRIB__
    object ob = new(__FILE__);

    ASSERT(base_name() + ".c" == __FILE__);
    ASSERT(base_name(this_object()) == file_name());
    ASSERT(file_name(ob) != file_name());
    ASSERT(base_name(ob) == file_name());
    ASSERT(base_name("/foo/bar#123") == "/foo/bar");
    ASSERT(base_name("/foo/bar.c") == "/foo/bar.c");
    destruct(ob);
#endif
}
