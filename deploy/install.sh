#!/bin/sh
# Bring this host into line with the repository's server-side components.
#
#   sh install.sh              reconcile the host with the repository
#   sh install.sh --check      report installed / stale / missing, change nothing
#   sh install.sh --root DIR   treat DIR as / (used by the tests)
#
# Every DIRECTORY beside this script is a component. Each one declares what
# installing it means in `component.conf`; this script knows the verbs and never
# the components, so adding a component is adding a directory — no edit here.
# A directory without a readable declaration FAILS the deploy and is named,
# because a component present in the repository and absent from the host is the
# exact defect this script exists to make impossible.
#
# Declaration verbs (one per line; `#` comments and blank lines ignored):
#
#   require   <command> <min-major|any> <command that installs it...>
#   bootstrap <file> <text that must appear in it...>
#   file      <source> <absolute destination> <mode>
#   unit      <name>            -> /etc/systemd/system/<name>, mode 0644
#   enable    <unit>            ensure enabled and running
#   start     <unit>            start, when this component changed
#   restart   <unit>            restart, when this component changed
#   reload    <unit>            reload, when this component changed
#   validate  <command...>      run after placing this component's files; a
#                               failure rolls them back and fails the deploy.
#                               `{root}` expands to the --root prefix.
#
# `#` starts a comment only at the START of a line. `require`, `bootstrap`, and
# `validate` deliberately take the rest of their line as their last argument — a
# command to run, or the text to look for — so nothing may follow it. Every
# other verb takes EXACTLY the fields listed above, and a line carrying any
# others fails the component by name. Silently folding a trailing token into the
# preceding field is how `file x /y 0755 # note` becomes an opaque
# `install -m "0755 # note"` failure about something else entirely.
#
# Errors are handled explicitly rather than by `set -e`: `reconcile` is called
# from an `||` list, which POSIX says disables -e for everything inside it.
set -eu

VERBS='require bootstrap file unit enable start restart reload validate'
# The verbs whose last field deliberately consumes the rest of the line.
VARIADIC='require bootstrap validate'
TAB=$(printf '\t')

SOURCE=$(cd "$(dirname "$0")" && pwd)
ROOT=
CHECK=0
status=0

while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1 ;;
    --root) ROOT=$2; shift ;;
    --root=*) ROOT=${1#--root=} ;;
    --source) SOURCE=$2; shift ;;
    --source=*) SOURCE=${1#--source=} ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "install.sh: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
case "$ROOT" in /) ROOT= ;; */) ROOT=${ROOT%/} ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

# ---------------------------------------------------------------- reporting --

note() { printf '%s\n' "$*"; }
problem() { status=1; printf '%s\n' "$*" >&2; }

# ------------------------------------------------------------- declarations --

# `sh` has no local variables, so every helper below prefixes its own with `_`:
# a helper that reused `name` or `verb` would silently overwrite the caller's.

# Arguments of every `$1` line in declaration `$2`.
directives() {
  while read -r _v _rest; do
    case "$_v" in ''|'#'*) continue ;; esac
    if [ "$_v" = "$1" ]; then printf '%s\n' "$_rest"; fi
  done < "$2"
}

# Names any verb this script does not implement. A typo'd verb would otherwise
# mean a component that quietly installs less than it declares.
unknown_verbs() {
  while read -r _v _rest; do
    case "$_v" in ''|'#'*) continue ;; esac
    case " $VERBS " in
      *" $_v "*) ;;
      *) printf '%s\n' "$_v" ;;
    esac
  done < "$1"
}

# Names any line carrying the wrong number of fields. A typo'd VERB is already a
# named failure (above); a typo'd FIELD has to be one too, or it is absorbed by
# whichever variable `read` filled last and surfaces as an error about something
# else — `install -m "0755 # note"` rather than the declaration that wrote it.
bad_arity() { # <declaration>
  while read -r _v _f1 _f2 _f3 _rest; do
    case "$_v" in ''|'#'*) continue ;; esac
    case " $VARIADIC " in *" $_v "*) continue ;; esac
    case "$_v" in
      file)
        if [ -z "$_f3" ] || [ -n "$_rest" ]; then
          printf "\`file %s\` expects <source> <destination> <mode>.\n" "$_f1"
        fi ;;
      *)
        if [ -z "$_f1" ] || [ -n "$_f2$_f3$_rest" ]; then
          printf "\`%s %s\` expects exactly one argument.\n" "$_v" "$_f1"
        fi ;;
    esac
  done < "$1"
}

# Every file a component places, as `source<TAB>destination<TAB>mode<TAB>unit?`.
# The plain three- and one-field reads below are safe because `bad_arity` has
# already rejected any line with a field they would silently absorb.
component_files() { # <declaration> <component directory>
  directives file "$1" > "$work/f.file"
  while read -r _src _dest _mode; do
    if [ -n "$_src" ]; then printf '%s\t%s\t%s\tno\n' "$2/$_src" "$ROOT$_dest" "$_mode"; fi
  done < "$work/f.file"
  directives unit "$1" > "$work/f.unit"
  while read -r _u; do
    if [ -n "$_u" ]; then
      printf '%s\t%s/etc/systemd/system/%s\t0644\tyes\n' "$2/$_u" "$ROOT" "$_u"
    fi
  done < "$work/f.unit"
}

# ------------------------------------------------------------ prerequisites --

# `missing` (not on PATH), `old` (major below the declared minimum), or `ok`.
prereq_state() { # <command> <min-major|any>
  if ! command -v "$1" >/dev/null 2>&1; then printf 'missing\n'; return 0; fi
  if [ "$2" = any ]; then printf 'ok\n'; return 0; fi
  _major=$("$1" --version 2>/dev/null | head -n 1 | sed 's/[^0-9]*//' | cut -d. -f1)
  case "$_major" in
    ''|*[!0-9]*) printf 'ok\n' ;;   # unparseable version: presence is all we can check
    *) if [ "$_major" -ge "$2" ]; then printf 'ok\n'; else printf 'old\n'; fi ;;
  esac
}

# --------------------------------------------------------------- comparison --

# Permission bits, in octal and without a leading zero. `stat` is not portable:
# `-c` is GNU and `-f` is BSD. The deploy only ever runs on the Linux host, but
# the tests run this script wherever someone runs `npm test` — so try GNU first
# and fall back, rather than making the suite fail on a developer's Mac for a
# reason that has nothing to do with what they changed.
file_mode() { # <file>
  stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1" 2>/dev/null
}

file_state() { # <source> <destination> <mode>
  if [ ! -f "$2" ]; then printf 'missing\n'; return 0; fi
  if ! cmp -s "$1" "$2"; then printf 'stale\n'; return 0; fi
  if [ "$(file_mode "$2")" != "${3#0}" ]; then printf 'stale\n'; return 0; fi
  printf 'current\n'
}

# ---------------------------------------------------------------- placement --

# Every placed file is backed up first, so a failure part-way through a
# component undoes what it already did. Half an installation is worse than none:
# the next run has to be able to finish the job.
place_n=0
place() { # <source> <destination> <mode>
  place_n=$((place_n + 1))
  if [ -f "$2" ]; then
    cp -p "$2" "$work/backup.$place_n" || return 1
    printf '%s\t%s\n' "$2" "$work/backup.$place_n" >> "$work/placed"
  else
    printf '%s\t-\n' "$2" >> "$work/placed"
  fi
  _d=$(dirname "$2")
  if [ ! -d "$_d" ]; then mkdir -p "$_d" || return 1; fi
  install -m "$3" "$1" "$2" || return 1
}

rollback() {
  if [ ! -f "$work/placed" ]; then return 0; fi
  while IFS="$TAB" read -r _dest _backup; do
    if [ "$_backup" = - ]; then rm -f "$_dest"; else mv "$_backup" "$_dest"; fi
  done < "$work/placed"
  rm -f "$work/placed"
}

# Run a host-changing command; roll this component back and report on failure.
run() {
  if ! _err=$("$@" 2>&1); then
    rollback
    problem "[failed] $name: \`$*\` failed: $(printf '%s' "$_err" | tr '\n' ' ')"
    return 1
  fi
}

# ---------------------------------------------------------------- component --

# Reconcile one component. Prints one summary line; returns non-zero when the
# component could not be brought into its declared state.
reconcile() { # <name> <directory> <declaration>
  name=$1 dir=$2 conf=$3
  rm -f "$work/placed"
  unmet=0

  bad=$(unknown_verbs "$conf" | sort -u | tr '\n' ' ')
  if [ -n "$bad" ]; then
    problem "[failed] $name: unknown declaration verb(s): ${bad% }"
    return 1
  fi

  bad=$(bad_arity "$conf" | tr '\n' ' ')
  if [ -n "$bad" ]; then
    problem "[failed] $name: malformed declaration: ${bad% } Only require, bootstrap, and validate take the rest of the line; an inline # is not a comment."
    return 1
  fi

  # Prerequisites first. A component whose runtime is missing places nothing, so
  # it is never half-installed and never reported as installed. The deploy names
  # what is missing and the command that resolves it; it never installs it,
  # because changing a host's software unasked is worse than stopping.
  directives require "$conf" > "$work/req"
  while read -r cmd min install_cmd; do
    if [ -z "$cmd" ]; then continue; fi
    case "$(prereq_state "$cmd" "$min")" in
      missing)
        problem "[failed] $name: requires $cmd, which is not installed. Run: $install_cmd"
        unmet=1 ;;
      old)
        problem "[failed] $name: requires $cmd >= $min, found $("$cmd" --version 2>&1 | head -n 1). Run: $install_cmd"
        unmet=1 ;;
    esac
  done < "$work/req"
  if [ "$unmet" != 0 ]; then return 1; fi

  # A placed file that nothing reads is indistinguishable from success, so the
  # one-time host bootstrap is checked before anything is written.
  directives bootstrap "$conf" > "$work/boot"
  while read -r target text; do
    if [ -z "$target" ]; then continue; fi
    if ! grep -qF -- "$text" "$ROOT$target" 2>/dev/null; then
      problem "[failed] $name: $ROOT$target is not bootstrapped — it does not contain: $text"
      unmet=1
    fi
  done < "$work/boot"
  if [ "$unmet" != 0 ]; then return 1; fi

  component_files "$conf" "$dir" > "$work/files"
  total=0 missing=0 changed=0 units_changed=0
  while IFS="$TAB" read -r src dest mode is_unit; do
    if [ -z "$src" ]; then continue; fi
    if [ ! -f "$src" ]; then
      rollback
      problem "[failed] $name: declares $src, which is not in the repository"
      return 1
    fi
    total=$((total + 1))
    state=$(file_state "$src" "$dest" "$mode")
    if [ "$state" = missing ]; then missing=$((missing + 1)); fi
    if [ "$state" != current ]; then
      changed=$((changed + 1))
      if [ "$is_unit" = yes ]; then units_changed=1; fi
      if [ "$CHECK" = 0 ] && ! place "$src" "$dest" "$mode"; then
        rollback
        problem "[failed] $name: could not place $dest"
        return 1
      fi
    fi
  done < "$work/files"

  if [ "$CHECK" = 1 ]; then
    if [ "$total" -gt 0 ] && [ "$missing" = "$total" ]; then note "[missing] $name"
    elif [ "$changed" -gt 0 ]; then note "[stale] $name ($changed of $total file(s) differ)"
    else note "[current] $name"
    fi
    return 0
  fi

  # Validate the resulting configuration before anything reloads it. Reloading
  # an invalid config takes the site down, which is strictly worse than not
  # deploying — so a failure here puts every file back exactly as it was.
  # Only what this run placed needs validating: an unchanged component is
  # already running the configuration a previous run validated.
  if [ "$changed" -gt 0 ]; then
    directives validate "$conf" > "$work/val"
    while read -r cmd; do
      if [ -z "$cmd" ]; then continue; fi
      cmd=$(printf '%s\n' "$cmd" | sed "s|{root}|$ROOT|g")
      if ! err=$(sh -c "$cmd" 2>&1); then
        rollback
        problem "[failed] $name: configuration is invalid, nothing was changed. \`$cmd\`: $(printf '%s' "$err" | tr '\n' ' ')"
        return 1
      fi
    done < "$work/val"
  fi

  if [ "$units_changed" != 0 ]; then
    run systemctl daemon-reload || return 1
  fi

  enabled=
  directives enable "$conf" > "$work/en"
  while read -r unit; do
    if [ -z "$unit" ]; then continue; fi
    if ! systemctl is-enabled -q "$unit" 2>/dev/null || ! systemctl is-active -q "$unit" 2>/dev/null; then
      run systemctl enable --now "$unit" || return 1
      enabled="$enabled$unit "
    fi
  done < "$work/en"

  # Only a component that actually changed restarts anything. A deploy that
  # churns units on every run trains an operator to stop reading its output.
  acted=
  if [ "$changed" -gt 0 ]; then
    for action in restart reload start; do
      directives "$action" "$conf" > "$work/act"
      while read -r unit; do
        if [ -z "$unit" ]; then continue; fi
        run systemctl "$action" "$unit" || return 1
        acted="$acted$action $unit, "
      done < "$work/act"
    done
  fi

  detail=
  if [ -n "$enabled" ]; then detail="$detail; enabled ${enabled% }"; fi
  if [ -n "$acted" ]; then detail="$detail; ${acted%, }"; fi
  if [ "$total" -gt 0 ] && [ "$missing" = "$total" ]; then
    note "[installed] $name ($total file(s)$detail)"
  elif [ "$changed" -gt 0 ]; then
    note "[updated] $name ($changed of $total file(s) replaced$detail)"
  elif [ -n "$enabled" ]; then
    note "[enabled] $name (files already current$detail)"
  else
    note "[unchanged] $name"
  fi
  return 0
}

# --------------------------------------------------------------------- main --

if [ "$CHECK" = 1 ]; then
  note "Checking $SOURCE against ${ROOT:-/} — nothing will be changed."
fi

found=0
for dir in "$SOURCE"/*/; do
  if [ ! -d "$dir" ]; then continue; fi
  dir=${dir%/}
  name=$(basename "$dir")
  found=$((found + 1))
  conf="$dir/component.conf"
  if [ ! -r "$conf" ]; then
    problem "[failed] $name: no readable component.conf — every directory under deploy/ is a component and must declare its own installation"
    continue
  fi
  reconcile "$name" "$dir" "$conf" || status=1
done

if [ "$found" = 0 ]; then
  problem "[failed] no component directories found under $SOURCE"
fi

if [ "$status" != 0 ]; then
  echo "install.sh: one or more components are not in their declared state (see above)" >&2
  exit 1
fi
exit 0
