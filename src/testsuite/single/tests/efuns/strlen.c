void do_tests() {
    ASSERT(strlen("") == 0);
    ASSERT(strlen("foo") == 3);
    ASSERT(strlen("foo\nbar") == 7);
    // counts bytes, not characters
    ASSERT(strlen("中文") == 6);
}
