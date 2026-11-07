/*
 * JSON package, backed by jansson (https://github.com/akheron/jansson).
 *
 *   string json_encode(mixed value);
 *   mixed  json_decode(string text);
 *
 * Type mapping:
 *   int            <-> integer (integers outside int64 are a decode error)
 *   float          <-> real (NaN/Inf encode to null; overflow is a decode error)
 *   string         <-> string (must be valid UTF-8 in both directions)
 *   array          <-> array
 *   mapping        <-> object (non-string keys are skipped when encoding)
 *   anything else   -> null; a circular reference encodes as null
 *   true/false/null -> 1 / 0 / 0
 *
 * jansson rejects invalid UTF-8, \u0000 and numbers it cannot represent.
 * json_decode() converts to LPC values only after jansson has parsed the
 * whole text and the result has passed the driver's size limits, so an error
 * never leaves half-built arrays or mappings behind.
 */

#include <math.h>
#include <jansson.h>
#ifdef LATTICE
#include "/lpc_incl.h"
#else
#include "../lpc_incl.h"
#include "../efun_protos.h"
#endif

#ifdef USE_BIG5
#error PACKAGE_JSON requires UTF-8 strings and cannot be used with USE_BIG5
#endif

#if JANSSON_VERSION_HEX < 0x020e00
#error PACKAGE_JSON requires jansson 2.14 or newer
#endif

#define JSON_MAX_DEPTH 512

/*
 * json_encode
 */

typedef struct {
    const void *path[JSON_MAX_DEPTH];
    int depth;
    const char *err;
} json_enc_t;

/* returns 0 if the container is already being encoded (circular reference)
 * or the nesting limit is reached (e->err is set) */
static int enc_enter (json_enc_t *e, const void *container)
{
    int i;

    for (i = 0; i < e->depth; i++)
        if (e->path[i] == container)
            return 0;
    if (e->depth == JSON_MAX_DEPTH) {
        e->err = "nesting too deep";
        return 0;
    }
    e->path[e->depth++] = container;
    return 1;
}

/* returns a new reference, or NULL with e->err set */
static json_t *to_json (json_enc_t *e, svalue_t *v)
{
    json_t *j, *item;
    int i;

    switch (v->type) {
    case T_NUMBER:
        if (v->subtype == T_UNDEFINED)
            return json_null();
        return json_integer(v->u.number);

    case T_REAL:
        return isfinite(v->u.real) ? json_real(v->u.real) : json_null();

    case T_STRING:
        if (!(j = json_stringn(v->u.string, SVALUE_STRLEN(v))))
            e->err = "string is not valid UTF-8";
        return j;

    case T_ARRAY: {
        array_t *arr = v->u.arr;

        if (!enc_enter(e, arr))
            return e->err ? NULL : json_null();
        j = json_array();
        for (i = 0; i < arr->size; i++) {
            if (!(item = to_json(e, &arr->item[i]))) {
                json_decref(j);
                return NULL;
            }
            json_array_append_new(j, item);
        }
        e->depth--;
        return j;
    }

    case T_MAPPING: {
        mapping_t *m = v->u.map;
        mapping_node_t *node;
        unsigned int k;

        if (!enc_enter(e, m))
            return e->err ? NULL : json_null();
        j = json_object();
        for (k = 0; k <= m->table_size; k++) {
            for (node = m->table[k]; node; node = node->next) {
                svalue_t *key = &node->values[0];

                if (key->type != T_STRING)
                    continue;
                if (!(item = to_json(e, &node->values[1]))) {
                    json_decref(j);
                    return NULL;
                }
                /* steals item; fails on a key that is not valid UTF-8 */
                if (json_object_setn_new(j, key->u.string, SVALUE_STRLEN(key), item)) {
                    e->err = "mapping key is not valid UTF-8";
                    json_decref(j);
                    return NULL;
                }
            }
        }
        e->depth--;
        return j;
    }

    default:
        return json_null();
    }
}

typedef struct {
    char *buf;
    size_t len, cap;
} json_out_t;

static int dump_to_string (const char *s, size_t n, void *data)
{
    json_out_t *o = (json_out_t *)data;

    if (o->len + n > (size_t)MAX_STRING_LENGTH)
        return -1;
    if (o->len + n > o->cap) {
        o->cap = (o->len + n) * 2;
        if (o->cap > (size_t)MAX_STRING_LENGTH)
            o->cap = MAX_STRING_LENGTH;
        o->buf = o->buf ? extend_string(o->buf, o->cap) : new_string(o->cap, "json_encode");
    }
    memcpy(o->buf + o->len, s, n);
    o->len += n;
    return 0;
}

#ifdef F_JSON_ENCODE
void f_json_encode (void)
{
    json_enc_t e;
    json_out_t o = { NULL, 0, 0 };
    json_t *root;
    int failed;

    e.depth = 0;
    e.err = NULL;
    if (!(root = to_json(&e, sp)))
        error("json_encode: %s\n", e.err ? e.err : "out of memory");

    failed = json_dump_callback(root, dump_to_string, &o, JSON_COMPACT | JSON_ENCODE_ANY);
    json_decref(root);
    if (failed || !o.buf) {
        if (o.buf)
            FREE_MSTR(o.buf);
        error("json_encode: result exceeds maximum string length\n");
    }

    o.buf = extend_string(o.buf, o.len);
    o.buf[o.len] = '\0';
    free_svalue(sp, "f_json_encode");
    put_malloced_string(o.buf);
}
#endif

/*
 * json_decode
 */

/* checks the driver's size and depth limits up front, so from_json() can only
 * error() when the driver runs out of memory */
static const char *check_limits (json_t *j, int depth)
{
    const char *key, *err;
    json_t *item;
    size_t i;

    if (json_is_array(j) || json_is_object(j)) {
        if (depth > JSON_MAX_DEPTH)
            return "nesting too deep";
    }
    switch (json_typeof(j)) {
    case JSON_ARRAY:
        if (json_array_size(j) > (size_t)MAX_ARRAY_SIZE)
            return "array has too many elements";
        json_array_foreach(j, i, item)
            if ((err = check_limits(item, depth + 1)))
                return err;
        break;
    case JSON_OBJECT:
        if (json_object_size(j) > (size_t)MAX_MAPPING_SIZE)
            return "object has too many members";
        json_object_foreach(j, key, item)
            if ((err = check_limits(item, depth + 1)))
                return err;
        break;
    default:
        break;
    }
    return NULL;
}

static void from_json (json_t *j, svalue_t *out)
{
    const char *key;
    json_t *item;
    size_t i, len;

    switch (json_typeof(j)) {
    case JSON_OBJECT: {
        mapping_t *m = allocate_mapping(json_object_size(j));

        json_object_foreach(j, key, item) {
            svalue_t k;

            /* jansson keys are NUL-free without JSON_ALLOW_NUL */
            k.type = T_STRING;
            k.subtype = STRING_SHARED;
            k.u.string = make_shared_string(key);
            from_json(item, find_for_insert(m, &k, 1));
            free_string_svalue(&k);
        }
        out->type = T_MAPPING;
        out->u.map = m;
        return;
    }

    case JSON_ARRAY: {
        array_t *arr = allocate_empty_array(json_array_size(j));

        json_array_foreach(j, i, item)
            from_json(item, &arr->item[i]);
        out->type = T_ARRAY;
        out->u.arr = arr;
        return;
    }

    case JSON_STRING: {
        char *s;

        len = json_string_length(j);
        s = new_string(len, "json_decode");
        memcpy(s, json_string_value(j), len);
        s[len] = '\0';
        out->type = T_STRING;
        out->subtype = STRING_MALLOC;
        out->u.string = s;
        return;
    }

    case JSON_REAL:
        out->type = T_REAL;
        out->subtype = 0;
        out->u.real = json_real_value(j);
        return;

    case JSON_INTEGER:
        out->type = T_NUMBER;
        out->subtype = 0;
        out->u.number = json_integer_value(j);
        return;

    default:                    /* true, false, null */
        out->type = T_NUMBER;
        out->subtype = 0;
        out->u.number = json_is_true(j);
        return;
    }
}

#ifdef F_JSON_DECODE
void f_json_decode (void)
{
    json_error_t jerr;
    json_t *root;
    const char *err;
    svalue_t result;

    root = json_loadb(sp->u.string, SVALUE_STRLEN(sp), JSON_DECODE_ANY, &jerr);
    if (!root)
        error("json_decode: %s @ line %d char %d\n", jerr.text, jerr.line, jerr.column);
    if ((err = check_limits(root, 1))) {
        json_decref(root);
        error("json_decode: %s\n", err);
    }

    from_json(root, &result);
    json_decref(root);
    free_string_svalue(sp);
    *sp = result;
}
#endif
