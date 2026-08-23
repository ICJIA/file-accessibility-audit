#!/usr/bin/env bash
# logs.sh — get the audit app's logs in a hurry.
#
# The service writes two kinds of log into logs/ at the checkout root
# (docs/activity-export.md has the full story):
#   activity-YYYY-MM-DD.csv  what users did that day (one row per audit; a "*-failed"
#                            event with a reason is an audit that could not complete);
#                            365 days; opens in Excel
#   errors-YYYY-MM-DD.log    the API's own error output (message + stack) for
#                            diagnosing faults; 30 days; appears on the first error
#
# STEP BY STEP — the normal way, over SSH (nothing is served by the site):
#
#   1. ssh forge@audit.icjia.app
#   2. cd ~/audit.icjia.app/file-accessibility-audit
#   3. ./logs.sh                          # the newest files in logs/
#   4. ./logs.sh activity 2026-08-19      # that day's audits as an aligned table (press q to leave the pager)
#   5. ./logs.sh failed 2026-08-19        # only the audits that could not complete, with their reason
#   6. ./logs.sh errors                   # today's error log (message + stack trace per fault)
#      ./logs.sh grep ERR_ABORTED 2026-08-19   # search a day's error log
#      ./logs.sh tail                     # watch today's error log live (Ctrl-C to stop)
#   7. To take a table with you:
#        ./logs.sh activity 2026-08-19 --md    # Markdown table: select it in the terminal and copy
#        ./logs.sh activity 2026-08-19 --copy  # asks your terminal to put it on your clipboard
#                                              # (OSC 52: iTerm2, Windows Terminal, kitty, WezTerm —
#                                              # not macOS Terminal.app) AND prints it for select-copy
#   8. To download the raw file, from your own computer (not the server):
#        scp forge@audit.icjia.app:audit.icjia.app/file-accessibility-audit/logs/activity-2026-08-19.csv .
#
#   (Running ./logs.sh from a laptop checkout also works: with no ./logs/ locally it does the
#    ssh for you, streams the result back, and --copy / pull then use the laptop's clipboard / disk.)
#
# Commands:
#   ./logs.sh                         newest 15 files
#   ./logs.sh list [N]                newest N files
#   ./logs.sh activity [DATE] [FMT]   the activity CSV for DATE (default: yesterday — the newest complete day)
#   ./logs.sh failed [DATE] [FMT]     only the failed-audit rows of that day
#   ./logs.sh errors [DATE]           the error log for DATE (default: today)
#   ./logs.sh grep PATTERN [DATE]     grep the error log for DATE (default: today)
#   ./logs.sh tail                    follow today's error log live (Ctrl-C to stop)
#   ./logs.sh pull DATE|FILE          laptop only: copy activity-DATE.csv (or any logs/ file) here
#
# FMT (activity / failed):
#   --table   aligned columns for reading in the terminal   (default when stdout is a terminal)
#   --csv     the file as-is                                 (default when piped or redirected)
#   --tsv     tab-separated — pastes into Excel / Numbers / Sheets as columns
#   --md      a Markdown table — pastes into GitHub, Slack, docs; best for select-and-copy
#   --copy    send the output to the clipboard (TSV unless a FMT is given). On a laptop: pbcopy /
#             wl-copy / xclip / xsel. On the server: via the terminal (OSC 52) — and the text is
#             printed too, so select-and-copy always works.
#
# DATE is YYYY-MM-DD in America/Chicago. Terminal output is paged with $PAGER
# (default `less -S`; q to quit). Needs python3 for the table formats (present on
# the server and on macOS).
#
# Environment overrides:
#   LOGS_DIR          local directory (default: ./logs beside this script)
#   AUDIT_SSH         ssh target             (default: forge@audit.icjia.app)
#   AUDIT_REMOTE_DIR  checkout on the server (default: audit.icjia.app/file-accessibility-audit)
set -euo pipefail

AUDIT_SSH="${AUDIT_SSH:-forge@audit.icjia.app}"
AUDIT_REMOTE_DIR="${AUDIT_REMOTE_DIR:-audit.icjia.app/file-accessibility-audit}"
TZ_LOCAL="America/Chicago"
SELF="${BASH_SOURCE[0]:-$0}"

here() { cd "$(dirname "$SELF")" 2>/dev/null && pwd; }
LOGS_DIR="${LOGS_DIR:-$(here)/logs}"

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
# render FORMAT FILTER FILE    FORMAT: table|csv|tsv|md   FILTER: all|failed
# (the Python program arrives on stdin, so the CSV is opened by path, not piped)
render() {
  command -v python3 >/dev/null 2>&1 || die "python3 is required for --table/--tsv/--md (use --csv)"
  python3 - "$1" "$2" "$3" <<'PY'
import csv, sys
fmt, flt, path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, encoding="utf-8-sig", newline="") as fh:
    rows = list(csv.reader(fh))
if not rows:
    sys.exit(0)
header, body = rows[0], rows[1:]
if flt == "failed" and "event" in header:
    ei = header.index("event")
    body = [r for r in body if len(r) > ei and r[ei].endswith("-failed")]
one_line = lambda c: c.replace("\r", " ").replace("\n", " ")
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
        n = len(header)
        widths = [max(len(r[i]) if i < len(r) else 0 for r in disp) for i in range(n)]
        for k, r in enumerate(disp):
            print("  ".join((r[i] if i < len(r) else "").ljust(widths[i]) for i in range(n)).rstrip())
            if k == 0:
                print("  ".join("-" * w for w in widths))
        print(f"\n{len(body)} row(s)")
PY
}

# --- commands (operate on $LOGS_DIR; FORMAT/FILTER come from the dispatcher) --------
cmd_list() {
  local n="${1:-15}"
  [ -d "$LOGS_DIR" ] || die "no directory $LOGS_DIR"
  # shellcheck disable=SC2012
  ls -lt "$LOGS_DIR" | head -n $((n + 1))
}

activity_file() {
  local d="${1:-$(yesterday)}"
  is_date "$d" || die "DATE must be YYYY-MM-DD, got '$d'"
  echo "$LOGS_DIR/activity-$d.csv"
}
errors_file() {
  local d="${1:-$(today)}"
  is_date "$d" || die "DATE must be YYYY-MM-DD, got '$d'"
  echo "$LOGS_DIR/errors-$d.log"
}

cmd_activity() {  # $1 date, $2 format, $3 filter
  local f; f="$(activity_file "${1:-}")"
  [ -f "$f" ] || die "no $(basename "$f") — the export keeps 365 complete days; yesterday is the newest"
  render "$2" "$3" "$f"
}

cmd_errors() {
  local f; f="$(errors_file "${1:-}")"
  if [ ! -f "$f" ]; then
    echo "no $(basename "$f") — nothing was written to the error log that day" >&2
    return 0
  fi
  cat "$f"
}

cmd_grep() {
  local pattern="${1:-}"; [ -n "$pattern" ] || die "usage: grep PATTERN [DATE]"
  local f; f="$(errors_file "${2:-}")"
  [ -f "$f" ] || { echo "no $(basename "$f")" >&2; return 0; }
  grep -n -- "$pattern" "$f" || echo "(no match for '$pattern' in $(basename "$f"))"
}

cmd_tail() {
  local f; f="$(errors_file)"
  echo "following $f (Ctrl-C to stop; the file appears on the first error of the day)" >&2
  tail -n 50 -F "$f"
}

cmd_pull() {  # laptop only
  local what="${1:-}"; [ -n "$what" ] || die "usage: pull DATE|FILE"
  local name="$what"
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
      *) positional+=("$a") ;;
    esac
  done
  cmd="${positional[0]:-list}"
  positional=("${positional[@]:1}")

  case "$cmd" in
    pull) cmd_pull ${positional[@]+"${positional[@]}"}; return 0 ;;
    tail) ;;  # no sink: follows the file
  esac

  # Default format: a table for a person at a terminal, the raw file for a pipe,
  # TSV for the clipboard (it pastes into a spreadsheet as columns).
  if [ -z "$fmt" ]; then
    if [ "$copy" = 1 ]; then fmt="tsv"; elif [ -t 1 ]; then fmt="table"; else fmt="csv"; fi
  fi

  if [ ! -d "$LOGS_DIR" ] && [ -z "${LOGS_SH_REMOTE:-}" ]; then
    # Not on the server: run this same script there (fed over stdin, so it need
    # not exist in the remote checkout) with the format resolved HERE, and sink
    # the stream locally — the clipboard is the laptop's, not the server's.
    local quoted; quoted="$(printf '%q ' "$cmd" "--$fmt" ${positional[@]+"${positional[@]}"})"
    if [ "$cmd" = "tail" ]; then
      ssh "$AUDIT_SSH" "LOGS_SH_REMOTE=1 LOGS_DIR='$AUDIT_REMOTE_DIR/logs' bash -s -- $quoted" < "$SELF"
    elif [ "$copy" = 1 ]; then
      ssh "$AUDIT_SSH" "LOGS_SH_REMOTE=1 LOGS_DIR='$AUDIT_REMOTE_DIR/logs' bash -s -- $quoted" < "$SELF" | clip
    else
      ssh "$AUDIT_SSH" "LOGS_SH_REMOTE=1 LOGS_DIR='$AUDIT_REMOTE_DIR/logs' bash -s -- $quoted" < "$SELF" | page
    fi
    return "${PIPESTATUS[0]}"
  fi

  local sink="page"; [ "$copy" = 1 ] && sink="clip"
  [ -n "${LOGS_SH_REMOTE:-}" ] && sink="cat"   # on the server side of an ssh run: just stream
  case "$cmd" in
    list)     cmd_list ${positional[@]+"${positional[@]}"} | $sink ;;
    activity) cmd_activity "${positional[0]:-}" "$fmt" all | $sink ;;
    failed)   cmd_activity "${positional[0]:-}" "$fmt" failed | $sink ;;
    errors)   cmd_errors ${positional[@]+"${positional[@]}"} | $sink ;;
    grep)     cmd_grep ${positional[@]+"${positional[@]}"} | $sink ;;
    tail)     cmd_tail ;;
    *)        usage >&2; die "unknown command '$cmd'" ;;
  esac
}

main "$@"
