#include "fliconv.h"
#include <errno.h>
#include <strings.h>
#include "std.h"
#include "lpc_incl.h"
#include "comm.h"

#ifdef USE_ICONV

struct translation *head;

/*
 * The UTF-8 translator, shared by every spelling of the name.  Its handles
 * convert UTF-8 to UTF-8: for valid input iconv returns the input
 * unchanged, so translate() skips the conversion and the copy.
 */
static struct translation *utf8_translator;

static int is_identity_handle(iconv_t tr){
    return utf8_translator &&
	(tr == utf8_translator->incoming || tr == utf8_translator->outgoing);
}

static int is_utf8_name(const char *encoding){
    return !strcasecmp(encoding, "UTF-8") || !strcasecmp(encoding, "UTF8");
}

/* Strict RFC 3629 check; anything it rejects goes through iconv. */
static int is_valid_utf8(const unsigned char *s, size_t n){
    const unsigned char *end = s + n;
    while(s < end){
	unsigned char c = *s;
	if(c < 0x80){
	    if(end - s >= 8){
		unsigned long long w;
		memcpy(&w, s, 8);
		if(!(w & 0x8080808080808080ULL)){
		    s += 8;
		    continue;
		}
	    }
	    s++;
	} else if(c < 0xC2){
	    return 0;
	} else if(c < 0xE0){
	    if(end - s < 2 || (s[1] & 0xC0) != 0x80)
		return 0;
	    s += 2;
	} else if(c < 0xF0){
	    if(end - s < 3 || (s[1] & 0xC0) != 0x80 || (s[2] & 0xC0) != 0x80)
		return 0;
	    if(c == 0xE0 && s[1] < 0xA0)	/* overlong */
		return 0;
	    if(c == 0xED && s[1] > 0x9F)	/* surrogate */
		return 0;
	    s += 3;
	} else if(c < 0xF5){
	    if(end - s < 4 || (s[1] & 0xC0) != 0x80 || (s[2] & 0xC0) != 0x80 ||
		    (s[3] & 0xC0) != 0x80)
		return 0;
	    if(c == 0xF0 && s[1] < 0x90)	/* overlong */
		return 0;
	    if(c == 0xF4 && s[1] > 0x8F)	/* > U+10FFFF */
		return 0;
	    s += 4;
	} else {
	    return 0;
	}
    }
    return 1;
}

static struct translation *find_translator(const char *encoding){
    struct translation *cur = head;
    while(cur){
	if(!strcmp(cur->name, encoding))
	    break;
	cur = cur->next;
    }
    return cur;
}


struct translation *get_translator(const char *encoding){
    struct translation *ret;
#ifndef USE_BIG5
    if(utf8_translator && is_utf8_name(encoding))
	return utf8_translator;
#endif
    ret = find_translator(encoding);
    if(ret)
	return ret;
    ret = (struct translation *)DMALLOC(sizeof(struct translation),
        TAG_PERMANENT, "get_translator");
#ifdef USE_BIG5
    char *name = (char *)DMALLOC(strlen(encoding)+8+1,
#else
    char *name = (char *)DMALLOC(strlen(encoding)+18+1,
#endif
        TAG_PERMANENT, "get_translator");
    strcpy(name, encoding);
#ifdef __linux__
#ifdef USE_BIG5
    strcat(name, "//IGNORE");
#else
    strcat(name, "//TRANSLIT//IGNORE");
#endif
#endif
    ret->name = name;
#ifdef USE_BIG5
    ret->incoming = iconv_open("BIG5//IGNORE", encoding);
    ret->outgoing = iconv_open(name, "BIG5");
#else
    ret->incoming = iconv_open("UTF-8", encoding);
    ret->outgoing = iconv_open(name, "UTF-8");
#endif

    ret->next = 0;
    if(ret->incoming == (iconv_t)-1 || ret->outgoing == (iconv_t)-1){
	FREE(name);
	FREE(ret);
	return 0;
    }
    name[strlen(encoding)] = 0;
#ifndef USE_BIG5
    if(is_utf8_name(encoding))
	utf8_translator = ret;
#endif
    if(!head)
	head = ret;
    else {
	struct translation *cur = head;
	while(cur->next)
	    cur = cur->next;
	cur->next = ret;
    }
    return ret;
}

char *translate(iconv_t tr, const char *mes, int inlen, int *outlen){
    size_t len = inlen;
    size_t len2;
    unsigned char *tmp = (unsigned char *)mes;
    static char *res = 0;
    static size_t reslen = 0;
    char *tmp2;

    if(is_identity_handle(tr) && is_valid_utf8((const unsigned char *)mes, len)){
	*outlen = inlen;
	return (char *)mes;
    }

    /* res holds reslen bytes of output plus the terminator written below */
    if(!res){
      res = (char *)DMALLOC(1 + 1, TAG_PERMANENT, "translate");
	reslen = 1;
    }

    tmp2 = res;
    len2 = reslen;

    while(len){
      iconv(tr, (char **)&tmp, &len, &tmp2, &len2);
#ifdef PACKAGE_DWLIB
		if(len > 1 && tmp[0] == 0xff && tmp[1] == 0xf9){
		len -=2;
		tmp +=2;
#else
		if(0){
#endif
	    } else {

		if(E2BIG == errno){
		  errno = 0;
		  tmp = (unsigned char *)mes;
		  len = inlen;
		  FREE(res);
		  reslen *= 2;
		  res = (char *)DMALLOC(reslen + 1, TAG_PERMANENT, "translate");
		  tmp2 = res;
		  len2 = reslen;
		  continue;
		}
		tmp2[0] = 0;
		*outlen = reslen - len2;
		return res;
	    }

    }
    *outlen = reslen - len2;
    return res;
}

#else
char *translate(iconv_t tr, const char *mes, int inlen, int *outlen){
  *outlen = inlen;
  return (char *)mes;
}
#endif



char *translate_easy(iconv_t tr, char *mes){
  int dummy;
  char *res = translate(tr, mes, strlen(mes)+1, &dummy);
  return res;
}



#ifdef F_SET_ENCODING
void f_set_encoding(){
  if(current_object->interactive){
    struct translation *newt = get_translator((char *)sp->u.string);
    if(newt){
      current_object->interactive->trans = newt;
      return;
    }
  }
  pop_stack();
  push_number(0);
}
#endif

#ifdef F_TO_UTF8
void f_to_utf8(){
  struct translation *newt = get_translator((char *)sp->u.string);
  pop_stack();
  if(!newt)
    error("unknown encoding");
  char *text = (char *)sp->u.string;
  char *translated = translate_easy(newt->incoming, text);
  if(translated == text)
    return;	/* the argument is the result; leave it on the stack */
  pop_stack();
  copy_and_push_string(translated);
}
#endif

#ifdef F_UTF8_TO
void f_utf8_to(){
  struct translation *newt = get_translator((char *)sp->u.string);
  pop_stack();
  if(!newt)
    error("unknown encoding");
  char *text = (char *)sp->u.string;
  char *translated = translate_easy(newt->outgoing, text);
  if(translated == text)
    return;	/* the argument is the result; leave it on the stack */
  pop_stack();
  copy_and_push_string(translated);
}
#endif

#ifdef F_STR_TO_ARR
void f_str_to_arr(){
  static struct translation *newt = 0;
  if(!newt){
    newt = get_translator("UTF-32");
    translate_easy(newt->outgoing, " ");
  }
  int len;
  int *trans = (int *)translate(newt->outgoing, sp->u.string, SVALUE_STRLEN(sp)+1, &len);
  len/=4;
  array_t *arr = allocate_array(len);
  while(len--)
    arr->item[len].u.number = trans[len];
  free_svalue(sp, "str_to_arr");
  put_array(arr);
}

#endif

#ifdef F_ARR_TO_STR
void f_arr_to_str(){
  static struct translation *newt = 0;
  if(!newt){
    newt = get_translator("UTF-32");
  }
  int len = sp->u.arr->size;
  int *in = (int *)DMALLOC(sizeof(int)*(len+1), TAG_TEMPORARY, "f_arr_to_str");
  char *trans;
  in[len] = 0;
  while(len--)
    in[len] = sp->u.arr->item[len].u.number;

  trans = translate(newt->incoming, (char *)in, (sp->u.arr->size+1)*4, &len);
  FREE(in);
  pop_stack();
  copy_and_push_string(trans);
}

#endif

#ifdef F_STRWIDTH
void f_strwidth(){
  int len = SVALUE_STRLEN(sp);
  int width = 0;
  int i;
  for(i=0; i<len; i++)
    width += !(((sp->u.string[i]) & 0xc0) == 0x80);
  pop_stack();
  push_number(width);
}

#endif
