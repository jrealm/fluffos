FROM almalinux:10 AS build

RUN dnf -y install \
        gcc make bison findutils \
        openssl-devel pcre2-devel libpq-devel libxcrypt-devel \
    && dnf clean all

ARG LOCAL_OPTIONS=local_options.catworld

WORKDIR /build
COPY src/ src/

WORKDIR /build/src
RUN cp "${LOCAL_OPTIONS}" local_options \
    && sh ./build.FluffOS \
    && make neat \
    && make \
    && make install \
    && ls -l /build/bin

FROM almalinux:10-minimal

RUN microdnf -y install \
        openssl-libs pcre2 libpq libxcrypt \
        glibc-gconv-extra glibc-langpack-zh tzdata \
    && microdnf clean all

ENV TZ=Asia/Taipei \
    LANG=C.UTF-8

COPY --from=build /build/bin/driver /opt/fluffos/bin/
COPY docker/entrypoint.sh /opt/fluffos/entrypoint.sh

WORKDIR /opt/fluffos

ENTRYPOINT ["/opt/fluffos/entrypoint.sh"]
