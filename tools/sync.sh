#!/usr/bin/env bash
# Copie la bibliothèque partagée vers l'app, le robot et les fonctions Supabase.
set -e
cd "$(dirname "$0")/.."
for d in web worker supabase/functions/_shared; do cp shared/lnb.js shared/report-lib.js shared/league-lib.js "$d/"; done
echo "Bibliothèque synchronisée."
