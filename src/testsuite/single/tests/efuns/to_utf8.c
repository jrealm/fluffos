#if defined(__USE_ICONV__) && !defined(__USE_BIG5__)

/*
 * to_utf8(), utf8_to(), str_to_arr() and arr_to_str() all go through
 * translate().  UTF-8 to UTF-8 has a fast path that returns valid input
 * unchanged, so check both valid input and input that falls back to iconv.
 */
void do_tests() {
    string zh = "貓咪說：你好", s, big5;
    int *a;

    /* valid UTF-8 is returned unchanged */
    ASSERT_EQ("", to_utf8("", "UTF-8"));
    ASSERT_EQ("hello", to_utf8("hello", "UTF-8"));
    ASSERT_EQ(zh, to_utf8(zh, "UTF-8"));
    ASSERT_EQ(zh, utf8_to(zh, "UTF-8"));
    ASSERT_EQ(zh, utf8_to(zh, "utf-8"));
    ASSERT_EQ(zh, utf8_to(zh, "UTF8"));
    ASSERT_EQ("a😀z", to_utf8("a😀z", "UTF-8"));
    ASSERT_EQ("\x1b[1;33m" "貓" "\x1b[0m\n", utf8_to("\x1b[1;33m" "貓" "\x1b[0m\n", "UTF-8"));
    /* a temporary string (refcount 1) must still be readable after the call */
    ASSERT_EQ(zh + "!", to_utf8(sprintf("%s!", zh), "UTF-8"));
    ASSERT_EQ(zh + "!", utf8_to(sprintf("%s!", zh), "UTF-8"));

    /*
     * Invalid UTF-8 still goes through iconv.  With glibc, incoming stops
     * at the bad byte and outgoing uses //IGNORE to drop it; other iconvs
     * differ, so only check this on Linux.
     */
    if (strsrch(__ARCH__, "Linux") == 0) {
        ASSERT_EQ("ab", to_utf8("ab\xff" "cd", "UTF-8"));
        ASSERT_EQ("abcd", utf8_to("ab\xff" "cd", "UTF-8"));
        ASSERT_EQ("ab", utf8_to("ab\xe4\xb8", "UTF-8"));          /* truncated */
        ASSERT_EQ("a", to_utf8("a\xed\xa0\x80" "z", "UTF-8"));    /* surrogate */
        ASSERT_EQ("az", utf8_to("a\xed\xa0\x80" "z", "UTF-8"));
        ASSERT_EQ("a", to_utf8("a\xc0\xaf" "z", "UTF-8"));        /* overlong */
        ASSERT_EQ("az", utf8_to("a\xc0\xaf" "z", "UTF-8"));
        /* rejected by the fast path, but glibc passes it through */
        ASSERT_EQ("a\xf4\x90\x80\x80" "z", to_utf8("a\xf4\x90\x80\x80" "z", "UTF-8"));
    }

    /* other encodings */
    big5 = utf8_to("貓咪", "BIG5");
    ASSERT_EQ(4, strlen(big5));
    ASSERT_EQ("貓咪", to_utf8(big5, "BIG5"));

    a = str_to_arr("貓a");
    ASSERT_EQ(0x8c93, a[0]);
    ASSERT_EQ('a', a[1]);
    ASSERT_EQ("貓a", arr_to_str(a));

    /* long input makes translate() grow its buffer */
    s = "";
    for (int i = 0; i < 2000; i++)
        s += "貓咪說你好abc\n";
    ASSERT_EQ(s, utf8_to(s, "UTF-8"));
    ASSERT_EQ(s, to_utf8(utf8_to(s, "BIG5"), "BIG5"));
    s = s + s + s + s;
    ASSERT_EQ(s, to_utf8(utf8_to(s, "BIG5"), "BIG5"));
    a = str_to_arr(s[0..3000]);
    ASSERT_EQ(s[0..3000], arr_to_str(a));
}

#else

void do_tests() {
}

#endif
