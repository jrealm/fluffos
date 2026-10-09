int odd(int x) {
    return x & 1;
}

void do_tests() {
    ASSERT(same(filter_array( ({ 1, 0, 2 }), (: $1 :)), ({ 1, 2 })));
    ASSERT(same(filter_array( ({ 1, 2, 3 }), "odd"), ({ 1, 3 })));
    ASSERT(same(filter_array( ({ 1, 2, 3 }), "odd", this_object()), ({ 1, 3 })));
    ASSERT(same(filter_array( ({ 1, 2, 3 }), (: $1 > $2 :), 1), ({ 2, 3 })));
    ASSERT(same(filter_array( ({}), "odd"), ({})));
}
