#!/usr/bin/env bash
# logs.sh — read the audit app's logs in a hurry.
#
# QUICK START
#   ./logs.sh                        the 500 most recent audits, newest first (spanning days as needed)
#   ./logs.sh 200                    the 200 most recent
#   ./logs.sh 2026-08-19             every audit on that day
#   ./logs.sh failed 2026-08-19      only the audits that could not complete, with the reason
#   ./logs.sh docs                   the remediation loop: documents audited 2+ times, first → last score
#   ./logs.sh doc grant-report       one document's whole history, oldest first (name fragment or hash prefix)
#   ./logs.sh errors                 today's error log (message + stack trace per fault)
#   ./logs.sh tail                   watch today's error log live (Ctrl-C to stop)
#   ./logs.sh help                   this text
#   Tables open in a pager: arrow keys scroll (right too — long lines are not wrapped), q quits.
#
# WHERE TO RUN IT — the same commands work in both places:
#   on the server      ssh forge@audit.icjia.app, then cd ~/audit.icjia.app/file-accessibility-audit
#   from your laptop   any checkout of this repo. With no ./logs/ directory here, the script
#                      runs itself on the server over SSH and streams the result back, so
#                      --copy fills YOUR clipboard and pull downloads to YOUR disk.
#
# WHAT THE LOGS ARE
#   The API writes two kinds of file into logs/ at the checkout root. Nothing on the site
#   serves them; SSH is the only way in. docs/activity-export.md has the full story.
#     activity-YYYY-MM-DD.csv   what users did that day — one row per audit: the event, the
#                               file name or URL, score, grade, request tier and, when the
#                               event ends in "-failed", the reason it could not complete.
#                               Kept 365 days. Opens in Excel. A day's file is written just
#                               after midnight (America/Chicago), so the newest day on file
#                               is yesterday — today's audits are not in any file yet.
#     errors-YYYY-MM-DD.log     everything the API wrote to its error output that day
#                               (message + stack trace per fault). Kept 30 days. Created by
#                               the first error of the day — no file means nothing was logged.
#
# COMMANDS
#   ./logs.sh [recent [N]] [FMT]      the N most recent audits (default 500), newest first,
#                                     across as many days' files as it takes
#   ./logs.sh activity [DATE] [FMT]   every audit on one day (default: yesterday)
#   ./logs.sh failed [DATE] [FMT]     only that day's failed audits, with the reason
#   ./logs.sh docs [N|DATE] [FMT]     the remediation loop, grouped: one row per document audited 2 or
#                                     more times — how many runs, how many distinct versions (content
#                                     hashes), the first and last score, and the change between them,
#                                     newest activity first. N looks among the N most recent audits
#                                     (default 500); a DATE looks at that day only. Failed audits are
#                                     not counted — ./logs.sh failed shows those.
#   ./logs.sh doc PATTERN [FMT]       every audit of one document, oldest first, across every day on
#                                     file (failed attempts included). PATTERN is a file-name fragment
#                                     (case-insensitive) or a content-hash prefix (6+ hex characters).
#     Examples:
#       ./logs.sh docs                        which documents were fixed and re-checked, and did they improve
#       ./logs.sh docs 200                    the loop within the 200 most recent audits
#       ./logs.sh docs yesterday --md         yesterday's re-audited documents, as a Markdown table
#       ./logs.sh doc grant-report            every audit of file names containing "grant-report"
#       ./logs.sh doc 4c5e4b5abd70 --table    one exact upload's audits, by its content-hash prefix
#   ./logs.sh errors [DATE]           the error log for one day (default: today)
#   ./logs.sh grep PATTERN [DATE]     search the error log for one day (default: today)
#   ./logs.sh tail                    follow today's error log live (Ctrl-C to stop)
#   ./logs.sh list [N]                the N newest files in logs/ (default 15): which days exist
#   ./logs.sh pull DATE|FILE          laptop only: download activity-DATE.csv (or any logs/ file) here
#   ./logs.sh help                    this text (also -h, --help)
#   Shortcuts: a bare DATE means "activity DATE"; a bare number means "recent N".
#
# DATE — a calendar day in America/Chicago (the server's local time), written YYYY-MM-DD:
#   four-digit year, two-digit month, two-digit day, joined by dashes.
#     2026-08-19      yes
#     today           yes — the word
#     yesterday       yes — the word (what activity and failed use when DATE is left out)
#     2026-8-19       no  — pad the month and the day with zeros
#     08/19/2026      no  — year first, dashes, no slashes
#     20260819        no  — the dashes are required
#   Examples:
#     ./logs.sh activity 2026-08-19
#     ./logs.sh failed yesterday --md
#     ./logs.sh errors today
#     ./logs.sh grep ERR_ABORTED 2026-08-19
#   ./logs.sh list shows which days have a file.
#
# FMT — how a table of audits is printed (recent / activity / failed / docs / doc)
#   --table   aligned columns for reading in the terminal   (default at a terminal)
#   --csv     the file as-is                                 (default when piped or redirected)
#   --tsv     tab-separated — pastes into Excel / Numbers / Sheets as columns
#   --md      a Markdown table — pastes into GitHub, Slack, docs; best for select-and-copy
#   --copy    put the output on the clipboard instead of the screen (TSV unless a FMT is
#             given). Laptop: pbcopy / wl-copy / xclip / xsel. Server: through the terminal
#             (OSC 52 — iTerm2, Windows Terminal, kitty, WezTerm; not macOS Terminal.app),
#             and the text is printed too, so select-and-copy always works.
#   Examples:
#     ./logs.sh --md                             the 500 most recent audits as a Markdown table
#     ./logs.sh recent 200 --copy                the 200 most recent, as TSV, on the clipboard
#     ./logs.sh activity 2026-08-19 > day.csv    the raw file (piped, so --csv is the default)
#
# REQUIREMENTS
#   bash; python3 for the table formats (present on the server and on macOS); ssh and scp
#   for the laptop case. Terminal output is paged with $PAGER (default: less -S).
#
# ENVIRONMENT OVERRIDES — rarely needed
#   LOGS_DIR          local directory (default: ./logs beside this script)
#   AUDIT_SSH         ssh target             (default: forge@audit.icjia.app)
#   AUDIT_REMOTE_DIR  checkout on the server (default: audit.icjia.app/file-accessibility-audit)
#
# To download a raw file by hand, from your own computer:
#   scp forge@audit.icjia.app:audit.icjia.app/file-accessibility-audit/logs/activity-2026-08-19.csv .
set -euo pipefail

AUDIT_SSH="${AUDIT_SSH:-forge@audit.icjia.app}"
AUDIT_REMOTE_DIR="${AUDIT_REMOTE_DIR:-audit.icjia.app/file-accessibility-audit}"
TZ_LOCAL="America/Chicago"
RECENT_DEFAULT=500  # rows shown by a bare ./logs.sh
LIST_DEFAULT=15     # files shown by ./logs.sh list
COMMANDS="recent activity failed docs doc errors grep tail list pull help"
SELF="${BASH_SOURCE[0]:-$0}"

here() { cd "$(dirname "$SELF")" 2>/dev/null && pwd; }
LOGS_DIR="${LOGS_DIR:-$(here)/logs}"

# The help text IS the comment block above (so the two cannot drift apart).
usage() { sed -n '2,/^set -euo/p' "$SELF" | sed '$d' | sed 's/^# \{0,1\}//'; }
die() { echo "logs.sh: $*" >&2; exit 1; }

# --- dates (macOS and GNU date both) --------------------------------------------
today() { TZ="$TZ_LOCAL" date +%F; }
yesterday() {
  if TZ="$TZ_LOCAL" date -d "yesterday" +%F >/dev/null 2>&1; then
    TZ="$TZ_LOCAL" date -d "yesterday" +%F
  else
    TZ="$TZ_LOCAL" date -v-1d +%F
  fi
}
is_date() { [[ "${1:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; }
is_date_word() { [ "${1:-}" = today ] || [ "${1:-}" = yesterday ]; }
is_count() { [[ "${1:-}" =~ ^[1-9][0-9]*$ ]]; }

# DATE as typed → YYYY-MM-DD. The two words are resolved; anything else must already
# have the shape (the message shows a live example so nobody has to guess the format).
resolve_date() {
  case "${1:-}" in
    today) today ;;
    yesterday) yesterday ;;
    *)
      is_date "${1:-}" || die "DATE must be YYYY-MM-DD (for example $(yesterday)), or the word today or yesterday — got '${1:-}'. ./logs.sh help has more."
      echo "$1" ;;
  esac
}

# --- output sinks -----------------------------------------------------------------
page() { if [ -t 1 ]; then ${PAGER:-less -S}; else cat; fi; }

clipboard_tool() {
  if command -v pbcopy >/dev/null 2>&1; then echo "pbcopy"
  elif command -v wl-copy >/dev/null 2>&1; then echo "wl-copy"
  elif command -v xclip >/dev/null 2>&1; then echo "xclip -selection clipboard"
  elif command -v xsel >/dev/null 2>&1; then echo "xsel --clipboard --input"
  else return 1; fi
}

# Copy stdin to the clipboard and say how much was copied.
#   - with a clipboard program (a laptop): use it;
#   - without one but on a terminal (the server over SSH): ask the terminal itself to
#     copy it (OSC 52 — iTerm2, Windows Terminal, kitty, WezTerm; Terminal.app ignores
#     it) AND print the text, so select-and-copy always works;
#   - otherwise (piped): just print it.
clip() {
  local tool content lines
  content="$(cat)"
  lines=$(printf '%s\n' "$content" | wc -l | tr -d ' ')
  if tool="$(clipboard_tool)"; then
    printf '%s\n' "$content" | $tool
    echo "copied $lines line(s) to the clipboard ($tool)" >&2
  elif [ -t 1 ]; then
    printf '\033]52;c;%s\a' "$(printf '%s\n' "$content" | base64 | tr -d '\n')"
    printf '%s\n' "$content"
    echo "no clipboard program on this machine — sent $lines line(s) to your terminal's clipboard (OSC 52; some terminals ignore it) and printed it above so you can select and copy (use --md for a cleaner copy)" >&2
  else
    printf '%s\n' "$content"
    echo "no clipboard program on this machine; printed $lines line(s) instead" >&2
  fi
}

# --- CSV rendering (python3: real RFC 4180 parsing — quoted commas, the BOM) ----------
# render FORMAT MODE LIMIT FILE...
#   FORMAT: table|csv|tsv|md
#   MODE:   all            every row
#           failed         only *-failed rows
#           group          one row per filename audited 2+ times (runs, versions, first
#                          and last score, change) — failed rows are not counted
#           match:PATTERN  rows whose filename contains PATTERN (case-insensitive) or
#                          whose content_hash starts with it (6+ hex chars); every file
#                          is read and LIMIT is ignored — oldest first, the whole story
#   LIMIT 0: one day's file, rows in file order (oldest first), "N row(s)" under a table.
#   LIMIT N: the files are whole days; take the last N rows overall, newest first, with a
#            caption saying what was shown (in the table itself; on stderr for the paste
#            formats so the pasted text stays clean).
# (the Python program arrives on stdin, so the CSVs are opened by path, not piped)
render() {
  command -v python3 >/dev/null 2>&1 || die "python3 is required for --table/--tsv/--md (use --csv)"
  LOGS_TZ="$TZ_LOCAL" python3 - "$@" <<'PY'
import csv, os, re, sys
fmt, mode, limit, paths = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:]
pattern = mode[len("match:"):] if mode.startswith("match:") else None

def read(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh))
    return (rows[0], rows[1:]) if rows else ([], [])

def day_of(path):  # activity-YYYY-MM-DD.csv -> YYYY-MM-DD
    m = re.search(r"\d{4}-\d{2}-\d{2}", os.path.basename(path))
    return m.group(0) if m else os.path.basename(path)

caption = None
if pattern is not None:
    # One document's whole story: every day on file, oldest first — a journey
    # must not lose its first chapter to a row window, so LIMIT is ignored.
    header, body = [], []
    for path in sorted(paths, key=day_of):                     # oldest day first
        h, rows = read(path)
        if not h or not rows:
            continue
        if not header:
            header = h
        elif h != header:                                      # an older layout: match columns by name
            at = {name: i for i, name in enumerate(h)}
            rows = [[r[at[c]] if c in at and at[c] < len(r) else "" for c in header] for r in rows]
        body += rows
    if not header:
        print("no audits on file yet — every activity file is empty", file=sys.stderr)
        sys.exit(0)
    fi0 = header.index("filename") if "filename" in header else -1
    hi0 = header.index("content_hash") if "content_hash" in header else -1
    pl = pattern.lower()
    hexish = re.fullmatch(r"[0-9a-fA-F]{6,}", pattern) is not None
    def matches(r):
        name = (r[fi0] if 0 <= fi0 < len(r) else "").lower()
        h = (r[hi0] if 0 <= hi0 < len(r) else "").lower()
        return pl in name or (hexish and h.startswith(pl))
    body = [r for r in body if matches(r)]
    if body:
        ti0 = header.index("timestamp_chicago") if "timestamp_chicago" in header else -1
        d0 = body[0][ti0][:10] if 0 <= ti0 < len(body[0]) else ""
        d1 = body[-1][ti0][:10] if 0 <= ti0 < len(body[-1]) else ""
        span = d0 if d0 == d1 else f"{d0} to {d1}"
        caption = f"all {len(body)} audits matching '{pattern}', oldest first — {span}"
    else:
        caption = f"no audits matching '{pattern}' anywhere on file"
elif limit == 0:
    header, body = read(paths[0])
else:
    header, chrono, days, need = [], [], [], limit
    for path in sorted(paths, key=day_of, reverse=True):      # newest day first
        h, rows = read(path)
        if not h or not rows:                                  # header-only = an empty day
            continue
        if not header:
            header = h
        elif h != header:                                      # an older layout: match columns by name
            at = {name: i for i, name in enumerate(h)}
            rows = [[r[at[c]] if c in at and at[c] < len(r) else "" for c in header] for r in rows]
        take = rows[-need:] if len(rows) > need else rows      # the newest rows of this day
        chrono = take + chrono
        days.append(day_of(path))
        need -= len(take)
        if need <= 0:
            break
    body = list(reversed(chrono))                              # newest first
    if not header:
        print("no audits on file yet — every activity file is empty", file=sys.stderr)
        sys.exit(0)
    span = days[0] if len(days) == 1 else f"{days[-1]} to {days[0]}"
    what = f"the {len(body)} most recent audits" if len(body) == limit else f"all {len(body)} audits on file"
    # two short lines: the pager chops long lines at the terminal's width (less -S)
    caption = (f"{what}, newest first — {span}\n"
               f"(a day's file is written just after midnight {os.environ.get('LOGS_TZ', 'local time')}, "
               f"so today's audits are not on file yet)")
if not header:
    sys.exit(0)
if mode == "group":
    # The remediation loop: collapse the rows selected above into one row per
    # document (filename) audited 2 or more times — the audit → fix → re-audit
    # story. Failed rows carry no score and are not counted here.
    def at(name): return header.index(name) if name in header else -1
    ei_, fi_, si_, gi_, hi_, tu_, tc_ = (at(n) for n in
        ("event", "filename", "score", "grade", "content_hash", "timestamp_utc", "timestamp_chicago"))
    def cell(r, i): return r[i] if 0 <= i < len(r) else ""
    windowed = len(body)
    groups = {}
    for r in body:
        if cell(r, ei_).endswith("-failed") or not cell(r, si_):
            continue
        groups.setdefault(cell(r, fi_), []).append(r)
    singles = sum(1 for rows in groups.values() if len(rows) < 2)
    grouped = []
    for name, rows in groups.items():
        if len(rows) < 2:
            continue
        rows.sort(key=lambda r: cell(r, tu_))
        first, last = rows[0], rows[-1]
        versions = len({cell(r, hi_) for r in rows} - {""})
        try:
            d = int(cell(last, si_)) - int(cell(first, si_))
            change = f"+{d}" if d > 0 else str(d)
        except ValueError:
            change = ""
        grouped.append((cell(last, tu_), [name, str(len(rows)), str(versions),
                        f"{cell(first, si_)} {cell(first, gi_)}".strip(),
                        f"{cell(last, si_)} {cell(last, gi_)}".strip(),
                        change, cell(first, tc_), cell(last, tc_)]))
    grouped.sort(key=lambda p: p[0], reverse=True)              # newest activity first
    header = ["filename", "runs", "versions", "first", "last", "change", "first_at", "last_at"]
    body = [row for _, row in grouped]
    scope = f"among {what} — {span}" if limit else f"on {day_of(paths[0])}"
    note = (f"; a day's file is written just after midnight {os.environ.get('LOGS_TZ', 'local time')}, "
            f"so today's audits are not on file yet" if limit else "")
    caption = (f"{len(body)} document(s) audited 2 or more times {scope}, newest activity first\n"
               f"({singles} audited once not shown; failed audits not counted{note})")
if mode == "failed" and "event" in header:
    ei = header.index("event")
    body = [r for r in body if len(r) > ei and r[ei].endswith("-failed")]
one_line = lambda c: c.replace("\r", " ").replace("\n", " ")
if caption and fmt != "table":
    print(caption, file=sys.stderr)
if fmt == "csv":
    w = csv.writer(sys.stdout, lineterminator="\n")
    w.writerow(header); w.writerows(body)
elif fmt == "tsv":
    for r in [header] + body:
        print("\t".join(one_line(c).replace("\t", " ") for c in r))
else:
    hi = header.index("content_hash") if "content_hash" in header else -1
    fi = header.index("filename") if "filename" in header else -1
    def cell(i, c):
        c = one_line(c)
        if i == hi and len(c) > 12: c = c[:12] + "…"
        if fmt == "table" and i == fi and len(c) > 48: c = c[:47] + "…"
        return c
    disp = [[cell(i, c) for i, c in enumerate(r)] for r in [header] + body]
    if fmt == "md":
        esc = lambda c: c.replace("|", "\\|")
        print("| " + " | ".join(esc(c) for c in disp[0]) + " |")
        print("|" + "|".join("---" for _ in disp[0]) + "|")
        for r in disp[1:]:
            print("| " + " | ".join(esc(c) for c in r) + " |")
    else:
        if caption:
            print(caption); print()
        n = len(header)
        widths = [max(len(r[i]) if i < len(r) else 0 for r in disp) for i in range(n)]
        for k, r in enumerate(disp):
            print("  ".join((r[i] if i < len(r) else "").ljust(widths[i]) for i in range(n)).rstrip())
            if k == 0:
                print("  ".join("-" * w for w in widths))
        if not caption:
            print(f"\n{len(body)} row(s)")
PY
}

# --- commands (operate on $LOGS_DIR; FORMAT/FILTER come from the dispatcher) --------
# Each command runs inside out="$(cmd_…)" in main, and bash switches errexit OFF inside
# a command substitution — so a die() nested in a further $(…) (resolve_date, errors_file)
# only ends that inner subshell. Every such call carries an explicit `|| exit $?` to
# stop the command there, with one message, instead of carrying on with an empty value.
# Every day's activity CSV, into the global FILES array — dies if there are none.
activity_files() {
  local f; FILES=()
  [ -d "$LOGS_DIR" ] || die "no directory $LOGS_DIR"
  for f in "$LOGS_DIR"/activity-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].csv; do
    [ -f "$f" ] && FILES+=("$f")
  done
  [ ${#FILES[@]} -gt 0 ] || die "no activity-YYYY-MM-DD.csv files in $LOGS_DIR yet — the API writes one per complete day within 5 minutes of starting (./logs.sh list shows what is there)"
}

# One day's activity CSV path, or die with the day-specific explanation.
activity_day_file() {
  local d f; d="$(resolve_date "${1:-yesterday}")" || exit $?
  f="$LOGS_DIR/activity-$d.csv"
  if [ ! -f "$f" ]; then
    if [ "$d" = "$(today)" ]; then
      die "no $(basename "$f") yet — a day's file is written just after midnight ($TZ_LOCAL), so today's audits are not on file until tomorrow; the newest day is yesterday, $(yesterday)"
    fi
    die "no $(basename "$f") — ./logs.sh list shows which days are on file (365 days are kept; the newest is yesterday, $(yesterday))"
  fi
  echo "$f"
}

cmd_recent() {  # $1 count, $2 format
  local n="${1:-$RECENT_DEFAULT}"
  is_count "$n" || die "N must be a whole number, 1 or more (for example: ./logs.sh recent 100) — got '$n'"
  activity_files
  render "$2" all "$n" "${FILES[@]}"
}

cmd_list() {
  local n="${1:-$LIST_DEFAULT}"
  is_count "$n" || die "N must be a whole number, 1 or more (for example: ./logs.sh list 30) — got '$n'"
  [ -d "$LOGS_DIR" ] || die "no directory $LOGS_DIR"
  # sed rather than head: head closes the pipe early and ls dies of SIGPIPE under pipefail
  ls -lt "$LOGS_DIR" | sed -n "1,$((n + 1))p"
}

cmd_activity() {  # $1 date, $2 format, $3 filter
  local f; f="$(activity_day_file "${1:-yesterday}")" || exit $?
  render "$2" "$3" 0 "$f"
}

cmd_docs() {  # $1 row count or DATE (optional), $2 format
  local w="${1:-}"
  if [ -n "$w" ] && { is_date "$w" || is_date_word "$w"; }; then
    local f; f="$(activity_day_file "$w")" || exit $?
    render "$2" group 0 "$f"
  else
    local n="${w:-$RECENT_DEFAULT}"
    is_count "$n" || die "docs takes a row count or a DATE (for example: ./logs.sh docs 200, or ./logs.sh docs $(yesterday)) — got '$w'"
    activity_files
    render "$2" group "$n" "${FILES[@]}"
  fi
}

cmd_doc() {  # $1 pattern, $2 format
  local p="${1:-}"
  [ -n "$p" ] || die "usage: doc PATTERN — a file-name fragment (case-insensitive) or a content-hash prefix of 6+ hex characters (for example: ./logs.sh doc grant-report, or ./logs.sh doc 4c5e4b5abd70)"
  activity_files
  render "$2" "match:$p" 0 "${FILES[@]}"
}

errors_file() {
  local d; d="$(resolve_date "${1:-today}")" || exit $?
  echo "$LOGS_DIR/errors-$d.log"
}

cmd_errors() {
  local f; f="$(errors_file "${1:-}")" || exit $?
  if [ ! -f "$f" ]; then
    echo "no $(basename "$f") — the API wrote nothing to its error output that day" >&2
    return 0
  fi
  cat "$f"
}

cmd_grep() {
  local pattern="${1:-}"; [ -n "$pattern" ] || die "usage: grep PATTERN [DATE] (for example: ./logs.sh grep ERR_ABORTED $(yesterday))"
  local f; f="$(errors_file "${2:-}")" || exit $?
  [ -f "$f" ] || { echo "no $(basename "$f") — the API wrote nothing to its error output that day" >&2; return 0; }
  grep -n -- "$pattern" "$f" || echo "(no match for '$pattern' in $(basename "$f"))"
}

cmd_tail() {
  local f; f="$(errors_file)"
  # Started before the day's first error, the file does not exist yet. Waiting
  # here (rather than handing tail -F the missing path) keeps tail's alarming
  # "cannot open … No such file or directory" off the screen.
  if [ ! -e "$f" ]; then
    echo "no errors so far today — $(basename "$f") is created by the first error of the day; waiting for it (Ctrl-C to stop)" >&2
    until [ -e "$f" ]; do sleep 1; done
    echo "$(basename "$f") has appeared — following it now" >&2
  else
    echo "following $f (Ctrl-C to stop)" >&2
  fi
  tail -n 50 -F "$f"
}

cmd_pull() {  # laptop only
  local what="${1:-}"; [ -n "$what" ] || die "usage: pull DATE|FILE (for example: ./logs.sh pull $(yesterday))"
  local name="$what"
  is_date_word "$what" && what="$(resolve_date "$what")"
  is_date "$what" && name="activity-$what.csv"
  echo "scp $AUDIT_SSH:$AUDIT_REMOTE_DIR/logs/$name ." >&2
  scp "$AUDIT_SSH:$AUDIT_REMOTE_DIR/logs/$name" .
}

# --- dispatch -----------------------------------------------------------------------
main() {
  local cmd="" copy=0 fmt="" positional=()
  for a in "$@"; do
    case "$a" in
      --copy) copy=1 ;;
      --table|--csv|--tsv|--md) fmt="${a#--}" ;;
      -h|--help|help) usage; return 0 ;;
      --*) die "unknown option '$a' — the formats are --table, --csv, --tsv, --md, and --copy (./logs.sh help)" ;;
      *) positional+=("$a") ;;
    esac
  done
  cmd="${positional[0]:-recent}"
  positional=(${positional[@]+"${positional[@]:1}"})
  # Shortcuts: ./logs.sh 2026-08-19 (or today / yesterday) = activity DATE; ./logs.sh 200 = recent 200
  if is_date "$cmd" || is_date_word "$cmd"; then
    positional=("$cmd" ${positional[@]+"${positional[@]}"}); cmd=activity
  elif is_count "$cmd"; then
    positional=("$cmd" ${positional[@]+"${positional[@]}"}); cmd=recent
  fi

  case "$cmd" in
    pull) cmd_pull ${positional[@]+"${positional[@]}"}; return 0 ;;
    tail) ;;  # no sink: follows the file
    recent|activity|failed|docs|doc|errors|grep|list) ;;
    *) die "unknown command '$cmd' — the commands are: $COMMANDS (./logs.sh help explains each)" ;;
  esac

  # Default format: a table for a person at a terminal, the raw file for a pipe,
  # TSV for the clipboard (it pastes into a spreadsheet as columns).
  if [ -z "$fmt" ]; then
    if [ "$copy" = 1 ]; then fmt="tsv"; elif [ -t 1 ]; then fmt="table"; else fmt="csv"; fi
  fi

  local out
  if [ ! -d "$LOGS_DIR" ] && [ -z "${LOGS_SH_REMOTE:-}" ]; then
    # Not on the server: run this same script there (fed over stdin, so it need
    # not exist in the remote checkout) with the format resolved HERE, and sink
    # the stream locally — the clipboard is the laptop's, not the server's.
    echo "logs.sh: no ./logs directory here, so running this on the server ($AUDIT_SSH)…" >&2
    local quoted; quoted="$(printf '%q ' "$cmd" "--$fmt" ${positional[@]+"${positional[@]}"})"
    if [ "$cmd" = "tail" ]; then
      ssh "$AUDIT_SSH" "LOGS_SH_REMOTE=1 LOGS_DIR='$AUDIT_REMOTE_DIR/logs' bash -s -- $quoted" < "$SELF"
      return 0
    fi
    # Collected before it is shown, so a failure on the server leaves an error
    # message on the screen rather than an empty pager waiting for q.
    out="$(ssh "$AUDIT_SSH" "LOGS_SH_REMOTE=1 LOGS_DIR='$AUDIT_REMOTE_DIR/logs' bash -s -- $quoted" < "$SELF")"
  else
    case "$cmd" in
      recent)   out="$(cmd_recent "${positional[0]:-}" "$fmt")" ;;
      activity) out="$(cmd_activity "${positional[0]:-}" "$fmt" all)" ;;
      failed)   out="$(cmd_activity "${positional[0]:-}" "$fmt" failed)" ;;
      docs)     out="$(cmd_docs "${positional[0]:-}" "$fmt")" ;;
      doc)      out="$(cmd_doc "${positional[0]:-}" "$fmt")" ;;
      errors)   out="$(cmd_errors "${positional[0]:-}")" ;;
      grep)     out="$(cmd_grep "${positional[0]:-}" "${positional[1]:-}")" ;;
      list)     out="$(cmd_list "${positional[0]:-}")" ;;
      tail)     cmd_tail; return 0 ;;
    esac
  fi
  [ -n "$out" ] || return 0   # nothing to show (the reason, if any, is already on stderr)

  local sink="page"; [ "$copy" = 1 ] && sink="clip"
  [ -n "${LOGS_SH_REMOTE:-}" ] && sink="cat"   # on the server side of an ssh run: just stream
  printf '%s\n' "$out" | $sink
}

main "$@"
