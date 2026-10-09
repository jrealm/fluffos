void do_tests() {
    int t = time();

    ASSERT(intp(t));
    ASSERT(t > 0);
    ASSERT(time() - t <= 1);
}
