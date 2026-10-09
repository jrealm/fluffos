void do_tests() {
#ifdef __PACKAGE_PCRE__
    ASSERT(pcre_match("abc", "b") == 1);
    ASSERT(pcre_match("abc", "^b") == 0);
    ASSERT(pcre_match("", "^$") == 1);
    // patterns are compiled in UTF-8 mode
    ASSERT(pcre_match("中文", "^..$") == 1);
    ASSERT(pcre_match("中文", "^.{6}$") == 0);

    ASSERT(same(pcre_match( ({ "foo", "bar", "bazz" }), "^ba"), ({ "bar", "bazz" })));
    ASSERT(same(pcre_match( ({ "foo", "bar", "bazz" }), "^ba", 1), ({ "bar", 2, "bazz", 3 })));
    ASSERT(same(pcre_match( ({ "foo", "bar", "bazz" }), "^ba", 2), ({ "foo" })));
    ASSERT(same(pcre_match( ({ "foo", "bar", "bazz" }), "^ba", 3), ({ "foo", 1 })));
    ASSERT(same(pcre_match( ({ "foo", 1, "bar" }), "o"), ({ "foo" })));
    ASSERT(same(pcre_match( ({}), "o"), ({})));

    ASSERT(catch(pcre_match("foo", "(")));
    ASSERT(catch(pcre_match( ({ "foo" }), "(")));
    ASSERT(catch(pcre_match("foo", "o", 1)));
#endif
}
