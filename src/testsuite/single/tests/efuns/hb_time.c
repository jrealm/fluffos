void do_tests() {
    int t = hb_time();

    // 0 until the first heart beat cycle has run
    ASSERT(intp(t));
    ASSERT(t == 0 || t >= boot_time());
    ASSERT(t <= time());
}
