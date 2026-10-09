#define TESTFILE "/write_file_test"

void do_tests() {
    rm(TESTFILE);
    ASSERT(write_file(TESTFILE, "foo"));
    ASSERT(read_file(TESTFILE) == "foo");
    ASSERT(write_file(TESTFILE, "bar"));
    ASSERT(read_file(TESTFILE) == "foobar");
    ASSERT(write_file(TESTFILE, "bazz", 1));
    ASSERT(read_file(TESTFILE) == "bazz");
    ASSERT(catch(write_file("/does_not_exist/foo", "foo")));
    rm(TESTFILE);
}
