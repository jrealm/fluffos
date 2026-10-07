/**
 * crypto.c
 * 
 * Utilises the OpenSSL crypto library to provide various message digest hashes
 * via a hash() efun.  It works in almost the same manner as the hash function
 * from php, and provides md5, sha1, sha224, sha256, sha384, sha512 and
 * ripemd160 hashes.  You must link against the ssl link library (add -lssl to
 * system_libs).
 *
 * md2, md4 and mdc2 were dropped when moving to the OpenSSL 3 EVP API: they
 * live in the legacy provider, which is not loaded by default.
 *
 * -- coded by Ajandurah@Demonslair (Mark Lyndoe) 10/03/09
 */

#include <openssl/evp.h>

#ifdef LATTICE
#include "/lpc_incl.h"
#else
#include "../lpc_incl.h"
#include "../efun_protos.h"
#endif

#ifdef F_HASH
INLINE_STATIC char *hexdump(const unsigned char *data, int len)
{
   const char hexchars[] = "0123456789abcdef";
   char *result, *p;
   
   p = result = new_string(len * 2, "f_hash");
   
   while (len--) {
     *p++ = hexchars[(*data) >> 4];
     *p++ = hexchars[(*data++) & 0xf];
   }

   *p = 0;
   
   return result;
}

void f_hash(void)
{
   const char *algo, *data;
   char *result = NULL;
   int data_len;
   
   algo = (sp - 1)->u.string;
   data = sp->u.string;
   data_len = SVALUE_STRLEN(sp);

   static const struct {
      const char *id;
      const EVP_MD *(*md)(void);
   } algos[] = {
      { "sha1",      EVP_sha1 },
      { "md5",       EVP_md5 },
      { "sha256",    EVP_sha256 },
      { "sha224",    EVP_sha224 },
      { "sha512",    EVP_sha512 },
      { "sha384",    EVP_sha384 },
      { "ripemd160", EVP_ripemd160 },
   };
   int i;

   for (i = 0; i < sizeof(algos) / sizeof(algos[0]); i++) {
      if (strcasecmp(algo, algos[i].id) == 0) {
         unsigned char md[EVP_MAX_MD_SIZE];
         unsigned int md_len;

         /* fails if the digest is not available from the loaded providers */
         if (EVP_Digest(data, data_len, md, &md_len, algos[i].md(), NULL))
            result = hexdump(md, md_len);
         break;
      }
   }

   if (!result) {
      error("hash() unknown hash type: %s", algo);
   }
   
   /* Pop the arguments off the stack and push the result */
   pop_n_elems(st_num_arg);
   push_malloced_string(result);
}
#endif
