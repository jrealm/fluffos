void do_tests() {
    string str = "This is A tEst!";

    ASSERT(upper_case(str) == "THIS IS A TEST!");
    ASSERT(str == "This is A tEst!");
    ASSERT(upper_case("") == "");
    ASSERT(upper_case("中文abc") == "中文ABC");
}
