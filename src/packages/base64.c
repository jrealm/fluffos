/*
 * base64 package (RFC 4648, standard alphabet).
 *
 *   string base64_encode(string|buffer data);
 *   string base64_decode(string text);
 *
 * Both work on raw bytes and never check the string encoding (UTF-8 or
 * USE_BIG5): base64_decode() returns whatever bytes were encoded, which under
 * UTF-8 need not be valid UTF-8.
 *
 * base64_decode() skips whitespace (space, tab, CR, LF; so MIME-style line
 * breaks are fine) and accepts missing '=' padding.  It raises an error on any
 * other character outside the alphabet, on misplaced padding, on a dangling
 * single character, on non-zero unused bits in the last group (only the
 * canonical encoding is accepted), and on data that decodes to a NUL byte.
 * LPC strings cannot hold a NUL, so binary data containing one can be encoded
 * from a buffer but not decoded back.
 */

#ifdef LATTICE
#include "/lpc_incl.h"
#else
#include "../lpc_incl.h"
#endif

static const char b64_alphabet[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

#ifdef F_BASE64_ENCODE
void f_base64_encode (void)
{
    const unsigned char *in;
    size_t len, out_len, i;
    char *out, *p;

#ifndef NO_BUFFER_TYPE
    if (sp->type == T_BUFFER) {
        in = sp->u.buf->item;
        len = sp->u.buf->size;
    } else
#endif
    {
        in = (const unsigned char *)sp->u.string;
        len = SVALUE_STRLEN(sp);
    }

    out_len = (len + 2) / 3 * 4;
    if (out_len > (size_t)MAX_STRING_LENGTH)
        error("base64_encode: result exceeds maximum string length\n");

    p = out = new_string(out_len, "f_base64_encode");
    for (i = 0; i + 2 < len; i += 3) {
        unsigned long v = (in[i] << 16) | (in[i + 1] << 8) | in[i + 2];
        *p++ = b64_alphabet[(v >> 18) & 63];
        *p++ = b64_alphabet[(v >> 12) & 63];
        *p++ = b64_alphabet[(v >> 6) & 63];
        *p++ = b64_alphabet[v & 63];
    }
    if (i < len) {
        unsigned long v = in[i] << 16;
        if (i + 1 < len)
            v |= in[i + 1] << 8;
        *p++ = b64_alphabet[(v >> 18) & 63];
        *p++ = b64_alphabet[(v >> 12) & 63];
        *p++ = (i + 1 < len) ? b64_alphabet[(v >> 6) & 63] : '=';
        *p++ = '=';
    }
    *p = '\0';

    free_svalue(sp, "f_base64_encode");
    put_malloced_string(out);
}
#endif

#ifdef F_BASE64_DECODE
static int b64_value (unsigned char c)
{
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
}

void f_base64_decode (void)
{
    const unsigned char *in = (const unsigned char *)sp->u.string;
    size_t len = SVALUE_STRLEN(sp), i, n = 0;
    unsigned long acc = 0;
    int bits = 0, quad = 0, pad = 0;
    char *out;
    const char *err = NULL;

    /* decoded size never exceeds 3/4 of the input */
    out = new_string(len / 4 * 3 + 3, "f_base64_decode");

    for (i = 0; i < len; i++) {
        unsigned char c = in[i];
        int v;

        if (c == ' ' || c == '\t' || c == '\r' || c == '\n')
            continue;
        if (c == '=') {
            /* padding may only finish a group that holds 2 or 3 characters */
            if (quad + pad < 2) {
                err = "misplaced padding";
                break;
            }
            if (++pad + quad > 4) {
                err = "too much padding";
                break;
            }
            continue;
        }
        if (pad) {
            err = "data after padding";
            break;
        }
        if ((v = b64_value(c)) < 0) {
            err = "invalid character";
            break;
        }
        acc = (acc << 6) | v;
        bits += 6;
        quad = (quad + 1) & 3;
        if (bits >= 8) {
            bits -= 8;
            if (!(out[n++] = (char)(acc >> bits))) {
                err = "decoded data contains a NUL byte";
                break;
            }
            acc &= (1UL << bits) - 1;   /* keep only the unused bits */
        }
    }
    if (!err && quad == 1)
        err = "truncated input";
    if (!err && pad && quad + pad != 4)
        err = "incomplete padding";
    if (!err && acc)
        err = "non-zero trailing bits";
    if (err) {
        FREE_MSTR(out);
        error("base64_decode: %s at offset %d\n", err, (int)i);
    }

    out = extend_string(out, n);
    out[n] = '\0';
    free_svalue(sp, "f_base64_decode");
    put_malloced_string(out);
}
#endif
