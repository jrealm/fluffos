int inits;

void init() {
    if (clonep())
	this_player()->count_init();
}

void count_init() {
    inits++;
}

void do_tests() {
#ifndef __NO_ADD_ACTION__
    object tp;
    object ob;

    SAVETP;
    disable_commands();
    enable_commands();
    ASSERT(living(this_object()));
    ASSERT(this_player() == this_object());

    inits = 0;
    ob = new(__FILE__);
    ob->move_to(this_object());
    ASSERT(inits == 1);

    // enable_commands(1) re-runs init() for the inventory without
    // touching the command giver
    RESTORETP;
    enable_commands(1);
    ASSERT(inits == 2);
    ASSERT(this_player() == tp);
    ASSERT(living(this_object()));

    destruct(ob);
    disable_commands();
#endif
}

void move_to(object dest) {
    move_object(dest);
}
