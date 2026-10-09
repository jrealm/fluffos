string up(string str) {
    return upper_case(str);
}

void do_tests() {
#ifdef __PACKAGE_PCRE__
    ASSERT(pcre_replace_callback("abc", "(b)", (: up :)) == "aBc");
    ASSERT(pcre_replace_callback("abc", "(b)", "up", this_object()) == "aBc");
    ASSERT(pcre_replace_callback("abcd", "(b)c(d)", (: $1 + $1 :)) == "abbcdd");
    ASSERT(pcre_replace_callback("abc", "(x)", (: up :)) == "abc");
    ASSERT(pcre_replace_callback("中文字", "(文)", (: $1 + $1 :)) == "中文文字");
    ASSERT(catch(pcre_replace_callback("abc", "(", (: up :))));
#endif
}
