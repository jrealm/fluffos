void do_tests() {
#ifndef __NO_SNOOP__
    // stopping a snoop always succeeds
    ASSERT(snoop(this_object()) == this_object());
    ASSERT(!query_snooping(this_object()));
    ASSERT(catch(snoop(this_object(), this_object())));
#endif
}
