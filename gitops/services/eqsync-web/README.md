# eqsync-web (gitops)

Retired 2026-11-12, not deployed. See `apps/eqsync-web/DEPRECATED.md` (owner's order, temporary).

These manifests are kept so that reviving the site is re-adding its Argo Application. Nothing
here is referenced by `gitops/apps/overlays/dev/apps/kustomization.yaml`.

To redeploy, save this as `gitops/apps/overlays/dev/apps/eqsync-web.yaml` and list it in that
folder's `kustomization.yaml`. The finalizer is added on purpose: the retired Application had
none, so removing it left the `eqsync-web` namespace's objects behind (see the retirement notes).

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: eqsync-web
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: git@github.com:silviuiacobivfuture/psi.git
    targetRevision: dev
    path: gitops/services/eqsync-web/overlays/dev
  destination: { server: https://kubernetes.default.svc, namespace: eqsync-web }
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=true]
```
