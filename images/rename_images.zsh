#!/usr/bin/env zsh
# Premenuje obrázky v tomto priečinku priamo na images-000.ext, images-001.ext, ...
# Presne 3 číslice. Bez dočasných názvov; najprv ošetrí kolízie.

set -e
setopt extendedglob nocaseglob null_glob

# 1) Zozbieraj obrázky
typeset -a files
files=( *.(jpg|jpeg|png|gif|bmp|tif|tiff|webp|heic|heif|svg|jp2|jxl)(.N) )
(( ${#files} )) || { echo "Nenašli sa žiadne obrázky."; exit 0; }

# Stabilné poradie
IFS=$'\n' files=($(printf '%s\n' "${files[@]}" | sort -f)); unset IFS

# Presne 3 číslice
digits=3
count=$#files

# 2) Vypočítaj cieľové názvy a skontroluj kolízie
typeset -a targets
for ((i=1; i<=count; i++)); do
  idx=$((i-1))
  ext="${files[i]##*.}"
  targets+=("$(printf "images-%0*d.%s" $digits $idx "$ext")")
done

for t in "${targets[@]}"; do
  [[ -e "$t" ]] && { echo "Chyba: cieľový súbor '$t' už existuje. Zrušené."; exit 1; }
done

# 3) Priame premenovanie
for ((i=1; i<=count; i++)); do
  mv -- "${files[i]}" "${targets[i]}"
done

printf "Hotovo. Premenovaných: %d (od %s po %s).\n" \
  "$count" "${targets[1]}" "${targets[-1]}"
