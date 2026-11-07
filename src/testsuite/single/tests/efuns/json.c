#ifdef __PACKAGE_JSON__

int same(mixed a, mixed b) {
    if (typeof(a) != typeof(b))
        return 0;
    if (arrayp(a)) {
        if (sizeof(a) != sizeof(b))
            return 0;
        for (int i = 0; i < sizeof(a); i++)
            if (!same(a[i], b[i]))
                return 0;
        return 1;
    }
    if (mapp(a)) {
        if (sizeof(a) != sizeof(b))
            return 0;
        foreach (mixed k, mixed v in a)
            if (undefinedp(b[k]) || !same(v, b[k]))
                return 0;
        return 1;
    }
    return a == b;
}

string repeat(string s, int n) {
    string out = "";
    while (n > 0) {
        if (n & 1) out += s;
        if (n >>= 1) s += s;
    }
    return out;
}

mixed deep_array(int depth) {
    mixed a = ({});
    while (--depth > 0) a = ({ a });
    return a;
}

string nest(int depth) {
    string s = "";
    for (int i = 0; i < depth; i++) s += "[";
    for (int i = 0; i < depth; i++) s += "]";
    return s;
}

void do_tests() {
    mixed *arr, *shared;
    mapping m;
    mixed v;
    string err;

    /* encode: scalars */
    ASSERT_EQ("0", json_encode(0));
    ASSERT_EQ("-42", json_encode(-42));
    ASSERT_EQ("9223372036854775807", json_encode(9223372036854775807));
    ASSERT_EQ("1.5", json_encode(1.5));
    ASSERT_EQ("1.0", json_encode(1.0));
    ASSERT_EQ("0.10000000000000001", json_encode(0.1));
    ASSERT_EQ(0.1, json_decode(json_encode(0.1)));
    ASSERT_EQ("1e100", json_encode(to_float("1e100")));
    ASSERT_EQ("\"abc\"", json_encode("abc"));
    ASSERT_EQ("\"\"", json_encode(""));
    ASSERT_EQ("\"a\\\"b\\\\c\\n\\t\\r\\b\\f\\u0001/\"", json_encode("a\"b\\c\n\t\r\b\x0c\x01/"));
    ASSERT_EQ("\"中文\"", json_encode("中文"));
    ASSERT_EQ("null", json_encode(this_object()));
    ASSERT_EQ("null", json_encode((: same :)));
    ASSERT_EQ("null", json_encode(([])["missing"]));

    /* encode: containers */
    ASSERT_EQ("[]", json_encode(({})));
    ASSERT_EQ("{}", json_encode(([])));
    ASSERT_EQ("[1,\"a\",[],{}]", json_encode(({ 1, "a", ({}), ([]) })));
    ASSERT_EQ("{\"a\":[1,2]}", json_encode(([ "a" : ({ 1, 2 }) ])));
    ASSERT_EQ("{\"b\":3}", json_encode(([ 1 : 2, "b" : 3 ])));

    /* encode: circular references become null, shared ones do not */
    arr = ({ 1, 0 });
    arr[1] = arr;
    ASSERT_EQ("[1,null]", json_encode(arr));
    m = ([]);
    m["self"] = m;
    ASSERT_EQ("{\"self\":null}", json_encode(m));
    shared = ({ 1 });
    ASSERT_EQ("[[1],[1]]", json_encode(({ shared, shared })));
    arr[1] = 0;
    m["self"] = 0;

    /* encode: UTF-8, limits */
    ASSERT_EQ("null", json_encode(to_float("1e999")));
    ASSERT2(catch(json_encode("\xff")), "encoded invalid UTF-8");
    ASSERT2(catch(json_encode("\xe4\xb8")), "encoded truncated UTF-8");
    ASSERT2(catch(json_encode(({ "ok", ([ "k" : "\xff" ]) }))), "encoded nested invalid UTF-8");
    ASSERT2(catch(json_encode(([ "\xff" : 1 ]))), "encoded invalid UTF-8 key");
    ASSERT_EQ(nest(512), json_encode(deep_array(512)));
    ASSERT2(catch(json_encode(deep_array(513))), "encoded 513 levels");
    ASSERT_EQ(199999, strlen(json_encode(repeat("x", 199997))));
    ASSERT2(catch(json_encode(repeat("x", 199999))), "exceeded max string length");

    /* decode: scalars */
    ASSERT_EQ(123, json_decode("123"));
    ASSERT_EQ(0, json_decode("-0"));
    ASSERT_EQ(-7, json_decode(" \t\r\n-7 \n"));
    ASSERT_EQ(9223372036854775807, json_decode("9223372036854775807"));
    ASSERT(floatp(v = json_decode("1.5")) && v == 1.5);
    ASSERT(floatp(v = json_decode("1E2")) && v == 100.0);
    ASSERT(floatp(v = json_decode("-2.5e-3")) && v == -0.0025);
    ASSERT_EQ(1, json_decode("true"));
    ASSERT_EQ(0, json_decode("false"));
    ASSERT_EQ(0, json_decode("null"));
    ASSERT_EQ("", json_decode("\"\""));
    ASSERT_EQ("a\"b\\c/\n\t\r\b\x0c", json_decode("\"a\\\"b\\\\c\\/\\n\\t\\r\\b\\f\""));
    ASSERT_EQ("中文", json_decode("\"\\u4e2d\\u6587\""));
    ASSERT_EQ("中文", json_decode("\"中文\""));
    ASSERT_EQ("é", json_decode("\"\\u00E9\""));
    ASSERT_EQ("😀", json_decode("\"\\ud83d\\ude00\""));
    ASSERT_EQ(4, strlen(json_decode("\"\\ud83d\\ude00\"")));

    /* decode: containers */
    ASSERT(same(({}), json_decode("[]")));
    ASSERT(same(([]), json_decode("{ }")));
    ASSERT(same(({ 1, "x", ({ 2 }), ([ "k" : 0 ]) }),
                json_decode("[1, \"x\", [2], {\"k\": null}]")));
    ASSERT(same(([ "a" : 2 ]), json_decode("{\"a\":1,\"a\":2}")));
    ASSERT(same(([ "a" : "x" ]), json_decode("{\"a\":[1],\"a\":\"x\"}")));
    ASSERT_EQ(nest(512), json_encode(json_decode(nest(512))));
    ASSERT_EQ(1, sizeof(json_decode(replace_string(nest(512), "[]]", "[1]]"))));
    ASSERT_EQ(15000, sizeof(json_decode("[" + repeat("0,", 14999) + "0]")));
    ASSERT2(catch(json_decode("[" + repeat("0,", 15000) + "0]")), "exceeded max array size");
    v = "{";
    for (int i = 0; i < 15000; i++) v += "\"k" + i + "\":0,";
    ASSERT_EQ(15000, sizeof(json_decode(v + "\"k0\":1}")));
    ASSERT2(catch(json_decode(v + "\"x\":0}")), "exceeded max mapping size");

    /* round trip */
    v = ([ "name" : "貓", "hp" : 100, "ratio" : 0.25, "tags" : ({ "a", "b\n" }),
           "nested" : ([ "list" : ({ ({}), ([]), -1 }) ]) ]);
    ASSERT(same(v, json_decode(json_encode(v))));

    /* decode errors */
    foreach (string bad in ({
        "", " ", "[", "[1,]", "[1 2]", "{\"a\":1,}", "{a:1}", "{\"a\" 1}",
        "{\"a\":}", "01", "1.", "-", ".5", "+1", "1e", "tru", "nul", "[1]x",
        "\"abc", "\"\\x\"", "\"\\u12\"", "\"\\u0000\"", "\"\\ud800\"",
        "\"\\udc00\"", "\"\\ud800\\u0041\"", "\"a\tb\"", "\"\xff\"",
        "\"\xc0\x80\"", "\"\xed\xa0\x80\"", "\"\xe4\xb8\"", "'a'",
        "9223372036854775808", "-9223372036854775809", "1e999", "-1e999",
        "{\"\xff\":1}", "{\"\\u0000\":1}", "{\"a\":\"\\ud800\"}",
        nest(513) })) {
        ASSERT2(catch(json_decode(bad)), "accepted " + bad);
    }

    err = catch(json_decode("[1,\n  ]"));
    ASSERT2(err && strsrch(err, "@ line 2 char 3") != -1, err);
    err = catch(json_decode("\"中x\\q\""));
    ASSERT2(err && strsrch(err, "@ line 1 char 5") != -1, err);
}

#endif
