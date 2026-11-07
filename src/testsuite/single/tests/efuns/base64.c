#ifdef __PACKAGE_BASE64__

void do_tests() {
    mixed vectors = ({
        ({ "", "" }), ({ "f", "Zg==" }), ({ "fo", "Zm8=" }), ({ "foo", "Zm9v" }),
        ({ "foob", "Zm9vYg==" }), ({ "fooba", "Zm9vYmE=" }), ({ "foobar", "Zm9vYmFy" }),
        ({ "貓", "6LKT" }), ({ "\xff\xfe\x80", "//6A" }),
    });
    string s, err;

    /* RFC 4648 section 10 */
    foreach (mixed v in vectors) {
        ASSERT_EQ(v[1], base64_encode(v[0]));
        ASSERT_EQ(v[0], base64_decode(v[1]));
    }

#ifndef __NO_BUFFER_TYPE__
    {
        buffer b = allocate_buffer(3);
        b[0] = 0; b[1] = 255; b[2] = 'a';
        ASSERT_EQ("AP9h", base64_encode(b));
        ASSERT_EQ("", base64_encode(allocate_buffer(0)));
        ASSERT_EQ("AP8=", base64_encode(b[0..1]));
        ASSERT_EQ("AA==", base64_encode(b[0..0]));
        /* a NUL cannot be decoded back into a string */
        ASSERT2(catch(base64_decode("AP9h")), "decoded a NUL byte");
    }
#endif

    /* lenient input */
    ASSERT_EQ("foobar", base64_decode("Zm9v\r\nYmFy\n"));
    ASSERT_EQ("f", base64_decode("Zg"));
    ASSERT_EQ("fo", base64_decode("Zm8"));
    ASSERT_EQ("f", base64_decode("Zg = ="));
    ASSERT_EQ("foof", base64_decode("Zm9vZg"));
    ASSERT_EQ("foof", base64_decode("Zm9vZg==\n"));
    ASSERT_EQ("foobar", base64_decode(" Zm 9v\tYm\r\nFy "));

    s = "";
    for (int i = 1; i < 256; i++) s += sprintf("%c", i);
    ASSERT_EQ(s, base64_decode(base64_encode(s)));

    foreach (string bad in ({
        "Z", "Zm9vY", "Zg=", "=", "==", "Zm9v=", "Zg===", "Zg==Zg==", "Zm9v!",
        "Zm-v", "AA==", "AAAA", "Zm9vZ", "Zg==\nZg==",
        /* non-canonical: unused bits in the last group are not zero */
        "Zh==", "Zz==", "Zm9=", "Zh", "Zm9",
    })) {
        ASSERT2(catch(base64_decode(bad)), "accepted " + bad);
    }

    err = catch(base64_decode("Zm9v!"));
    ASSERT2(err && strsrch(err, "invalid character at offset 4") != -1, err);
}

#endif
