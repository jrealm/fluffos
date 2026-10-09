void do_tests() {
    rmdir("/mkdir_test/sub");
    rmdir("/mkdir_test");

    ASSERT(mkdir("/mkdir_test"));
    ASSERT(file_size("/mkdir_test") == -2);
    ASSERT(!mkdir("/mkdir_test"));
    ASSERT(mkdir("/mkdir_test/sub"));
    ASSERT(file_size("/mkdir_test/sub") == -2);
    ASSERT(!mkdir("/mkdir_none/sub"));
    ASSERT(file_size("/mkdir_none") == -1);

    rmdir("/mkdir_test/sub");
    rmdir("/mkdir_test");
}
