#!/usr/bin/env bash
# Builds and signs RootDeck.apk without Gradle: aapt -> javac -> dx -> zipalign -> apksigner.
set -euo pipefail
cd "$(dirname "$0")"
SDK_JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
KS=rootdeck.jks
OUT=build

rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes"

if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias rootdeck -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass rootdeck -keypass rootdeck -dname "CN=RootDeck" >/dev/null 2>&1
fi

aapt package -f -m -J "$OUT/gen" -M AndroidManifest.xml -S res -A assets -I "$SDK_JAR" -F "$OUT/app.unsigned.apk"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$SDK_JAR" \
  -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=26 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && aapt add -k app.unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"
apksigner sign --ks "$KS" --ks-pass pass:rootdeck --key-pass pass:rootdeck \
  --out "$OUT/RootDeck.apk" "$OUT/app.aligned.apk"
apksigner verify "$OUT/RootDeck.apk"
ls -l "$OUT/RootDeck.apk"
