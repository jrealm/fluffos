mixed *got;

void catch_tell(string str) {}

void receive_message(mixed cl, string msg) {
    got += ({ ({ cl, msg }) });
}

void do_tests() {
#ifndef __NO_ADD_ACTION__
    object tp;

    SAVETP;
    enable_commands();
    RESTORETP;
#endif
    got = ({});
    message("say", "hi", this_object());
    ASSERT(same(got, ({ ({ "say", "hi" }) })));

    got = ({});
    message("tell", "yo", ({ this_object(), file_name() }));
    ASSERT(same(got, ({ ({ "tell", "yo" }), ({ "tell", "yo" }) })));

    got = ({});
    message("say", "hi", this_object(), this_object());
    message("say", "hi", ({ this_object() }), ({ this_object() }));
    message("say", "hi", "/does_not_exist");
    ASSERT(!sizeof(got));

#ifndef __NO_ADD_ACTION__
    disable_commands();
    message("say", "hi", this_object());
    ASSERT(!sizeof(got));
#endif
}
