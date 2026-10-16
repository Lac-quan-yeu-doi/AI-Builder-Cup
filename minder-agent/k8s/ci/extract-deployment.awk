# Kustomize separates documents with a standalone ---. Pass exactly one
# Deployment to kubectl's JSON printer; do not include ConfigMaps or Secrets.
BEGIN { RS = "\n---\n"; ORS = "\n"; found = 0 }
/(^|\n)kind: Deployment(\n|$)/ {
  print
  found++
}
END { if (found != 1) exit 1 }
