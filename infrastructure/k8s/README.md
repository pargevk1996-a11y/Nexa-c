# Kubernetes manifests

Base manifests under `base/` provide a starting point for production. Customize image registry, secrets, and HPA before deploying.

```bash
# Staging overlay
kubectl apply -k infrastructure/k8s/overlays/staging

# Production base (after setting secrets)
kubectl create secret generic nexa-secrets -n nexa --from-env-file=.env.prod
kubectl apply -k infrastructure/k8s/base
```

Wire `ExternalSecrets` or your cloud secret manager instead of committing `.env.prod`.
