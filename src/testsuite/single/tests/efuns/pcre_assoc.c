void do_tests() {
#ifdef __PACKAGE_PCRE__
    ASSERT(same(pcre_assoc("testhahatest", ({ "haha", "te" }), ({ 2, 3 }), 4),
		({ ({ "", "te", "st", "haha", "", "te", "st" }),
		   ({ 4, 3, 4, 2, 4, 3, 4 }) })));
    ASSERT(same(pcre_assoc("foo", ({ "x" }), ({ 1 })), ({ ({ "foo" }), ({ 0 }) })));
    ASSERT(catch(pcre_assoc("foo", ({ "o" }), ({ 1, 2 }))));
    ASSERT(catch(pcre_assoc("foo", ({ 1 }), ({ 1 }))));
    ASSERT(catch(pcre_assoc("foo", ({ "(" }), ({ 1 }))));
#endif
}
