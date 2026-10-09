void do_tests() {
    int t = boot_time();

    ASSERT(intp(t));
    ASSERT(t > 0);
    ASSERT(t <= time());
    ASSERT(t == boot_time());
    ASSERT(time() - t == uptime());
}
