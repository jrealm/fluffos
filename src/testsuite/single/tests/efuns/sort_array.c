int cmp(int a, int b) {
    return b - a;
}

void do_tests() {
    mixed *arr = ({ 3, 1, 2 });

    ASSERT(same(sort_array(arr, 1), ({ 1, 2, 3 })));
    ASSERT(same(sort_array(arr, 0), ({ 1, 2, 3 })));
    ASSERT(same(sort_array(arr, -1), ({ 3, 2, 1 })));
    ASSERT(same(arr, ({ 3, 1, 2 })));
    ASSERT(same(sort_array( ({ "b", "c", "a" }), 1), ({ "a", "b", "c" })));
    ASSERT(same(sort_array(arr, (: $1 - $2 :)), ({ 1, 2, 3 })));
    ASSERT(same(sort_array(arr, "cmp"), ({ 3, 2, 1 })));
    ASSERT(same(sort_array(arr, "cmp", this_object()), ({ 3, 2, 1 })));
    ASSERT(same(sort_array( ({}), 1), ({})));
}
