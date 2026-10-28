# A stand-in for GitHub, for release.test.ts: run before the mirror workflow's script, these
# functions take the place of the `gh` and `curl` commands it calls. Releases are folders under
# $STORE; `curl` serves $FIXTURE as $UPSTREAM and the files of those releases as their downloads
# from $GH_REPO. Each release change and download is written to $LOG.

gh() {
  case "$1 $2" in
    "release view")
      [ -d "$STORE/$3" ] || return 1
      [ "$4" != "--json" ] || ls "$STORE/$3"
      ;;
    "release create")
      mkdir -p "$STORE/$3"
      cp "${@: -1}" "$STORE/$3/"
      echo "create $3" >> "$LOG"
      ;;
    "release upload")
      cp "$4" "$STORE/$3/"
      echo "upload $3" >> "$LOG"
      ;;
    *) return 2 ;;
  esac
}

curl() {
  local out="" url="" asset
  while [ $# -gt 0 ]; do
    case "$1" in
      --output) out="$2"; shift 2 ;;
      --proto | --proto-redir | --max-redirs) shift 2 ;;
      -*) shift ;;
      *) url="$1"; shift ;;
    esac
  done
  echo "fetch $url" >> "$LOG"
  case "$url" in
    "$UPSTREAM") cp "$FIXTURE" "$out" ;;
    "https://github.com/$GH_REPO/releases/download/"*)
      asset="$STORE/${url#"https://github.com/$GH_REPO/releases/download/"}"
      [ -f "$asset" ] || return 22
      cp "$asset" "$out"
      ;;
    *) return 22 ;;
  esac
}
