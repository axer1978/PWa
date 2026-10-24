#!/usr/bin/env bash
# Generates placeholder clips for every clip referenced in sessions/*.json:
# distinct sine tones and beep patterns (no speech), mono 48 kHz, encoded as
# Opus 64 kbps (.opus, Ogg) plus an AAC-LC 64 kbps fallback (.m4a).
#
#   scripts/make-placeholder-audio.sh [--force] [--sessions DIR] [--out DIR]
#
# Existing non-empty files are kept unless --force is given.
set -euo pipefail

SESSIONS_DIR=sessions
OUT_DIR=content/audio
FORCE=0
while [ $# -gt 0 ]; do
	case "$1" in
	--force) FORCE=1 ;;
	--sessions) SESSIONS_DIR="$2"; shift ;;
	--out) OUT_DIR="$2"; shift ;;
	-h | --help) sed -n '2,8p' "$0"; exit 0 ;;
	*) echo "unknown argument: $1" >&2; exit 2 ;;
	esac
	shift
done

command -v ffmpeg >/dev/null || { echo "ffmpeg not found on PATH" >&2; exit 1; }
command -v node >/dev/null || { echo "node not found on PATH" >&2; exit 1; }
# No `grep -q`: with pipefail, an early exit could SIGPIPE ffmpeg and fail the check.
ffmpeg -hide_banner -encoders 2>/dev/null | grep libopus >/dev/null ||
	{ echo "this ffmpeg build has no libopus encoder" >&2; exit 1; }

mkdir -p "$OUT_DIR"

# Integer frequencies with integer durations give whole cycles, so clips that the
# player loops (choice beds, timers, loops) have no click at the seam.
NOTES=(220 247 262 294 330 349 392 440 494 523 587 659)

freq_for() {
	local sum
	sum=$(printf '%s' "$1" | cksum | cut -d' ' -f1)
	echo "${NOTES[$((sum % ${#NOTES[@]}))]}"
}

# Prints "duration|expression|audio filter" for a node type at base frequency $2.
# Beeps use half-sine envelopes (between(...)*sin(PI*x/len)) to avoid clicks.
spec_for() {
	local type=$1 F=$2
	local F2=$((F * 2)) F15=$((F * 3 / 2))
	case "$type" in
	choice) # quiet bed + double beep every 3 s; loops
		echo "6|0.12*sin(2*PI*$F*t)+0.3*sin(2*PI*$F2*t)*(between(mod(t,3),0,0.12)*sin(PI*mod(t,3)/0.12)+between(mod(t,3),0.2,0.32)*sin(PI*(mod(t,3)-0.2)/0.12))|anull" ;;
	timer) # tick every second over a faint bed; loops
		echo "4|0.08*sin(2*PI*$F*t)+0.35*sin(2*PI*$F2*t)*between(mod(t,1),0,0.08)*sin(PI*mod(t,1)/0.08)|anull" ;;
	loop) # tone + octave with 1 Hz tremolo; loops
		echo "3|(0.25*sin(2*PI*$F*t)+0.08*sin(2*PI*$F2*t))*(0.75+0.25*sin(2*PI*t))|anull" ;;
	end) # three descending beeps, then silence
		echo "4|0.35*(between(t,0,0.3)*sin(PI*t/0.3)*sin(2*PI*$F2*t)+between(t,0.5,0.8)*sin(PI*(t-0.5)/0.3)*sin(2*PI*$F15*t)+between(t,1,1.6)*sin(PI*(t-1)/0.6)*sin(2*PI*$F*t))|afade=t=out:st=3.9:d=0.1" ;;
	*) # play (and anything unknown): steady tone with a slow swell
		echo "4|0.35*sin(2*PI*$F*t)*(0.6+0.4*sin(2*PI*0.25*t))|afade=t=in:d=0.03,afade=t=out:st=3.92:d=0.08" ;;
	esac
}

encode() {
	local id=$1 type=$2 freq spec dur expr af fmt out
	freq=$(freq_for "$id")
	spec=$(spec_for "$type" "$freq")
	IFS='|' read -r dur expr af <<<"$spec"
	for fmt in opus m4a; do
		out="$OUT_DIR/$id.$fmt"
		if [ -s "$out" ] && [ "$FORCE" -eq 0 ]; then continue; fi
		local codec=()
		case "$fmt" in
		opus) codec=(-c:a libopus -b:a 64k -vbr on -application audio) ;;
		m4a) codec=(-c:a aac -b:a 64k -movflags +faststart) ;;
		esac
		# Write to a temp name and rename, so a failed encode never leaves a partial clip.
		# -nostdin (and </dev/null): ffmpeg otherwise reads stdin and swallows the
		# rest of the clip list this loop is reading, garbling the remaining ids.
		ffmpeg -nostdin -hide_banner -loglevel error -y \
			-f lavfi -i "aevalsrc=exprs='$expr':s=48000:d=$dur" \
			-af "$af" -ac 1 "${codec[@]}" "$out.tmp.$fmt" </dev/null
		mv "$out.tmp.$fmt" "$out"
	done
	echo "  $id ($type, ${freq} Hz)"
}

clips=$(node scripts/list-clips.mjs "$SESSIONS_DIR")
[ -n "$clips" ] || { echo "no clips referenced in $SESSIONS_DIR/" >&2; exit 1; }

count=0
while read -r id type; do
	case "$id" in
	*[!a-z0-9_-]*) echo "skipping unsafe clip id: $id" >&2; continue ;;
	esac
	encode "$id" "$type"
	count=$((count + 1))
done <<<"$clips"

echo "placeholder audio: $count clip(s) in $OUT_DIR/ (opus + m4a)"
