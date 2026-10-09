void do_tests() {
    int t1 = current_time_millis();
    int t2 = current_time_millis();

    ASSERT(intp(t1));
    ASSERT(t2 >= t1);
    ASSERT(t1 / 1000 >= time() - 1);
    ASSERT(t1 / 1000 <= time() + 1);
}
