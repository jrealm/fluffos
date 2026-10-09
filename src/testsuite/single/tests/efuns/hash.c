void do_tests() {
#ifdef __PACKAGE_CRYPTO__
    ASSERT_EQ("d41d8cd98f00b204e9800998ecf8427e", hash("md5", ""));
    ASSERT_EQ("900150983cd24fb0d6963f7d28e17f72", hash("md5", "abc"));
    ASSERT_EQ("900150983cd24fb0d6963f7d28e17f72", hash("MD5", "abc"));
    ASSERT_EQ("a9993e364706816aba3e25717850c26c9cd0d89d", hash("sha1", "abc"));
    ASSERT_EQ("23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7", hash("sha224", "abc"));
    ASSERT_EQ("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", hash("sha256", "abc"));
    ASSERT_EQ("cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7", hash("sha384", "abc"));
    ASSERT_EQ("ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f", hash("sha512", "abc"));
    ASSERT_EQ("8eb208f7e05d987a9b044a8e98c6b087f15a0bfc", hash("ripemd160", "abc"));

    ASSERT(catch(hash("foo", "abc")));
    // md2, md4 and mdc2 were dropped with the OpenSSL 3 EVP API
    ASSERT(catch(hash("md4", "abc")));
#endif
}
