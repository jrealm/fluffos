#define UNLOADED "/single/tests/efuns/unloaded"

void do_tests() {
    object ob = find_object(UNLOADED);

    if (ob)
	destruct(ob);
    ASSERT(!find_object(UNLOADED));
    ob = load_object(UNLOADED);
    ASSERT(ob);
    ASSERT(find_object(UNLOADED) == ob);
    ASSERT(load_object(UNLOADED ".c") == ob);
    ASSERT(!clonep(ob));
    ASSERT(!load_object("/does_not_exist"));
    ASSERT(catch(load_object("/single/tests/compiler/fail/void_global")));
    rm("/log/compile");
    destruct(ob);
}
