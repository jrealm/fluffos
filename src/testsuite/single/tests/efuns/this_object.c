object me() {
    return this_object();
}

void do_tests() {
    object ob = new(__FILE__);

    ASSERT(file_name(this_object()) + ".c" == __FILE__);
    ASSERT(ob->me() == ob);
    ASSERT(ob != this_object());
    ASSERT(evaluate( (: this_object() :) ) == this_object());
    destruct(ob);
}
