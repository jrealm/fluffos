# Docker Image Build

Builds the FluffOS driver image on AlmaLinux 10. The image contains only `/opt/fluffos/bin/driver` and the entrypoint script.

The container runtime configuration (docker-compose.yml, scheduling scripts) lives in `/home/jrealm/pegasus-infra/mud`.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: compiles on `almalinux:10` (copies only `src/`; after `build.FluffOS`, `make neat` removes build artifacts carried over from the host), runs on `almalinux:10-minimal` |
| `docker/entrypoint.sh` | Container entrypoint: copies the config file, rewrites `debug log file` and `binary directory`, then runs the driver |

## Build Arguments

| Argument | Default | Description |
|---|---|---|
| `LOCAL_OPTIONS` | `local_options.catworld` | local_options file under `src/` to use |

## Build

```bash
cd /home/jrealm/fluffos
docker build --build-arg LOCAL_OPTIONS=local_options.catworld  -t fluffos:catworld  .
docker build --build-arg LOCAL_OPTIONS=local_options.windcloud -t fluffos:windcloud .
```

| Image | LOCAL_OPTIONS | Services | Main differences |
|---|---|---|---|
| `fluffos:catworld` | `local_options.catworld` | catworld, catworld-dev, doom | PostgreSQL, PCRE, UTF-8 |
| `fluffos:windcloud` | `local_options.windcloud` | windcloud | `USE_BIG5`, no DB, no PCRE |

- The runtime side sets `pull_policy: never`, so only local images are used and nothing is pulled from a registry.
- The container user is not baked into the image. docker-compose.yml sets it from `MUD_UID` / `MUD_GID` in `.env` (must match the host mudlib owner, `jrealm:users`); compose fails if either is unset, and the entrypoint refuses to run as root.
- Running containers are not affected; a new image takes effect at the mud's next scheduled shutdown and restart.
