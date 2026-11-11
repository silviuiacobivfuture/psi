# estate/seb-components/

The estate's own kustomize components for the SEB pieces that read one
(`components/estate/<piece>` in SEB): one folder per piece, e.g. `argocd-config/`,
`headscale/`. The bundle build takes this folder as `--estate-components` and renders each piece
with the estate's component in it. Empty means every piece renders with SEB's defaults.
