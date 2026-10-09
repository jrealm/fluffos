void do_tests() {
#ifdef __PACKAGE_PCRE__
    ASSERT(pcre_replace("hello world", "(world)", ({ "there" })) == "hello there");
    ASSERT(pcre_replace("abcdef", "b(c)d(e)", ({ "X", "YY" })) == "abXdYYf");
    ASSERT(pcre_replace("abc", "(x)", ({ "y" })) == "abc");
    ASSERT(pcre_replace("abc", "b", ({})) == "abc");
    ASSERT(pcre_replace("中文字", "(文)", ({ "x" })) == "中x字");
    ASSERT(catch(pcre_replace("abc", "(b)", ({}))));
    ASSERT(catch(pcre_replace("abc", "(", ({}))));
#endif
}
