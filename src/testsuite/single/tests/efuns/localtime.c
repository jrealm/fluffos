void do_tests() {
    int t = time();
    mixed *lt = localtime(t);

    ASSERT(sizeof(lt) == 11);
    ASSERT(sizeof(filter(lt[0..8], (: intp :))) == 9);
    ASSERT(stringp(lt[9]));
    ASSERT(intp(lt[10]));
    ASSERT(lt[0] >= 0 && lt[0] <= 60);
    ASSERT(lt[1] >= 0 && lt[1] <= 59);
    ASSERT(lt[2] >= 0 && lt[2] <= 23);
    ASSERT(lt[3] >= 1 && lt[3] <= 31);
    ASSERT(lt[4] >= 0 && lt[4] <= 11);
    ASSERT(lt[6] >= 0 && lt[6] <= 6);
    ASSERT(lt[7] >= 0 && lt[7] <= 365);
    ASSERT(ctime(t)[<4..] == "" + lt[5]);
}
