int three() {
    return 3;
}

void do_tests() {
    ASSERT(evaluate( (: $1 + $2 :), 1, 2) == 3);
    ASSERT(evaluate( (: $1 :) ) == 0);
    ASSERT(evaluate( (: this_object() :) ) == this_object());
    ASSERT(evaluate( (: three :) ) == 3);
    // anything that is not a function is returned as is
    ASSERT(evaluate(5) == 5);
    ASSERT(evaluate("foo", 1) == "foo");
}
