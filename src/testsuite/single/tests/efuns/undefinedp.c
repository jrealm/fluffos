void do_tests() {
    mapping m = ([ "a" : 0 ]);

    ASSERT(undefinedp(m["b"]));
    ASSERT(!undefinedp(m["a"]));
    ASSERT(!undefinedp(0));
    ASSERT(!undefinedp(""));
    ASSERT(undefinedp(this_object()->no_such_function()));
    ASSERT(!undefinedp(this_object()->do_nothing()));
}

int do_nothing() {
    return 0;
}
