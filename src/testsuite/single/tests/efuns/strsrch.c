void do_tests() {
    ASSERT(strsrch("abcabc", "b") == 1);
    ASSERT(strsrch("abcabc", "bc") == 1);
    ASSERT(strsrch("abcabc", "b", 1) == 4);
    ASSERT(strsrch("abcabc", "bc", 1) == 4);
    ASSERT(strsrch("abcabc", 'c') == 2);
    ASSERT(strsrch("abcabc", 'c', 1) == 5);
    ASSERT(strsrch("abcabc", "x") == -1);
    ASSERT(strsrch("abcabc", "") == -1);
    ASSERT(strsrch("ab", "abc") == -1);
    ASSERT(strsrch("中文", "文") == 3);
}
