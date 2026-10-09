void do_tests() {
#ifdef __PACKAGE_PCRE__
    ASSERT(same(pcre_extract("2026-10-09", "(\\d+)-(\\d+)-(\\d+)"), ({ "2026", "10", "09" })));
    ASSERT(same(pcre_extract("foo", "f(x)?o"), ({})));
    ASSERT(same(pcre_extract("foo", "bar"), ({})));
    ASSERT(same(pcre_extract("foo", "o"), ({})));
    ASSERT(same(pcre_extract("中文字", "^.(.)"), ({ "文" })));
    ASSERT(catch(pcre_extract("foo", "(")));
#endif
}
