void do_tests() {
#ifdef __PACKAGE_CONTRIB__
    mixed *a = ({ 1, ({ 2 }) });
    mixed *b = copy(a);
    mapping m = ([ 1 : ({ 1 }) ]);
    mapping n = copy(m);

    ASSERT(same(a, b));
    ASSERT(a != b);
    b[1][0] = 3;
    ASSERT(a[1][0] == 2);

    ASSERT(same(m, n));
    n[1][0] = 2;
    ASSERT(m[1][0] == 1);

    ASSERT(copy(5) == 5);
    ASSERT(copy("foo") == "foo");
    ASSERT(copy(this_object()) == this_object());
#endif
}
