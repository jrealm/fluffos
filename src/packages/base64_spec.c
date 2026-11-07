#include "spec.h"

#ifndef NO_BUFFER_TYPE
string base64_encode(string|buffer);
#else
string base64_encode(string);
#endif
string base64_decode(string);
