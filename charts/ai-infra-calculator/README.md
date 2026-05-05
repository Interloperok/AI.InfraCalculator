# ai-infra-calculator Helm chart

Deploys the AI Infrastructure Calculator backend (FastAPI) and frontend (React/nginx) as a single
Helm release. Designed for local kind testing first; production deploy is a values-override away.

## Layout

```
charts/ai-infra-calculator/
├── Chart.yaml              # chart metadata
├── values.yaml             # production-sane defaults
├── values-kind.yaml        # kind-specific overrides
├── README.md               # this file
└── templates/
    ├── _helpers.tpl
    ├── NOTES.txt
    ├── backend-configmap.yaml
    ├── backend-deployment.yaml
    ├── backend-service.yaml
    ├── frontend-deployment.yaml
    ├── frontend-service.yaml
    └── ingress.yaml        # disabled by default
```

## Prerequisites

- Docker Desktop with kind extension (or standalone kind ≥ 0.20)
- `kubectl` ≥ 1.28
- `helm` ≥ 3.13
- A kind cluster running:
  ```bash
  kind get clusters
  ```
  If empty: `kind create cluster --name calc-dev`

## Kind cluster workflow — port-forward (simplest)

This is the recommended first run. No ingress controller required.

### 1. Build images

```bash
cd AI.InfraCalculator

# Backend image
docker build -t ai-infra-calculator/backend:dev backend/

# Frontend image. REACT_APP_API_URL is BAKED IN at build time:
# point it at http://localhost:8000 — that's where we'll port-forward the backend.
docker build \
  --build-arg REACT_APP_API_URL=http://localhost:8000 \
  -t ai-infra-calculator/frontend:dev \
  frontend/
```

### 2. Load images into kind

```bash
kind load docker-image ai-infra-calculator/backend:dev  --name calc-dev
kind load docker-image ai-infra-calculator/frontend:dev --name calc-dev
```

### 3. Install the chart

```bash
helm install calc ./charts/ai-infra-calculator \
  -f ./charts/ai-infra-calculator/values-kind.yaml \
  --namespace calc --create-namespace
```

Wait for both pods to be Ready:
```bash
kubectl get pods -n calc -w
```

### 4. Port-forward (two terminals)

```bash
# Terminal 1 — backend
kubectl port-forward -n calc svc/calc-ai-infra-calculator-backend 8000:8000

# Terminal 2 — frontend
kubectl port-forward -n calc svc/calc-ai-infra-calculator-frontend 3000:80
```

### 5. Open and verify

- Frontend UI:    http://localhost:3000
- API docs:       http://localhost:8000/docs
- Health:         http://localhost:8000/healthz
- OpenAPI schema: http://localhost:8000/openapi.json

### 6. Smoke checks (P0 verification)

```bash
# 1. Sizing endpoint returns 200 with sane shape
curl -X POST http://localhost:8000/v1/size \
     -H "Content-Type: application/json" \
     -d @backend/tests/payload.json | jq '.servers_final, .servers_by_memory, .servers_by_compute'

# 2. v3 calibration default surfaced in OpenAPI
curl -s http://localhost:8000/openapi.json \
     | jq '.components.schemas.SizingInput.properties.eta_prefill.default'
# Expected: 0.167

curl -s http://localhost:8000/openapi.json \
     | jq '.components.schemas.SizingInput.properties.eta_decode.default'
# Expected: 0.20

curl -s http://localhost:8000/openapi.json \
     | jq '.components.schemas.SizingInput.properties.saturation_coeff_C.default'
# Expected: 6.0

# 3. New scaffolded fields appear in schema (P1+ will consume)
curl -s http://localhost:8000/openapi.json \
     | jq '.components.schemas.SizingInput.properties | keys[] | select(test("bw_gpu_gbs|eta_mem|o_fixed|t_overhead|eta_cache|k_spec"))'
```

### 7. Tear down

```bash
helm uninstall calc -n calc
kubectl delete namespace calc
```

## Ingress workflow (single-host access, optional)

Use this when you want a single URL and don't want two port-forwards.

### Prerequisites — recreate kind cluster with extra port mappings

Port-forward mode does NOT need this. Ingress mode does.

```bash
kind delete cluster --name calc-dev

cat <<EOF | kind create cluster --name calc-dev --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
EOF
```

### Install nginx-ingress

```bash
helm install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.hostPort.enabled=true \
  --set "controller.nodeSelector.ingress-ready=true" \
  --set "controller.tolerations[0].key=node-role.kubernetes.io/control-plane" \
  --set "controller.tolerations[0].operator=Exists" \
  --set "controller.tolerations[0].effect=NoSchedule"

kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

### Build images for ingress mode

When using ingress, frontend should NOT bake in a host — leave it relative:

```bash
docker build -t ai-infra-calculator/backend:dev  backend/
docker build --build-arg REACT_APP_API_URL="" -t ai-infra-calculator/frontend:dev frontend/
kind load docker-image ai-infra-calculator/backend:dev  --name calc-dev
kind load docker-image ai-infra-calculator/frontend:dev --name calc-dev
```

### Install chart with ingress enabled

```bash
helm install calc ./charts/ai-infra-calculator \
  -f ./charts/ai-infra-calculator/values-kind.yaml \
  --set ingress.enabled=true \
  --set ingress.host=calc.localhost \
  --namespace calc --create-namespace
```

### Add /etc/hosts entry

```bash
sudo sh -c 'echo "127.0.0.1 calc.localhost" >> /etc/hosts'
```

Open: http://calc.localhost/

## Rebuild + redeploy loop (during P0+ development)

Single-line redeploy after changing backend code:

```bash
docker build -t ai-infra-calculator/backend:dev backend/ && \
kind load docker-image ai-infra-calculator/backend:dev --name calc-dev && \
kubectl rollout restart deployment/calc-ai-infra-calculator-backend -n calc && \
kubectl rollout status deployment/calc-ai-infra-calculator-backend -n calc
```

(Replace `backend` with `frontend` for UI changes; remember to pass the right `--build-arg`.)

## Customizing for production

`values.yaml` is the production-sane baseline. Override:

- `backend.image.repository` / `tag` — push to your registry; switch `pullPolicy: Always`.
- `backend.replicaCount` — for horizontal scaling.
- `backend.env.AI_SC_ETA_PF` (etc.) — operator-level calibration overrides without code change.
- `backend.resources` — match your nodes.
- `ingress.enabled=true`, `ingress.host` — your real hostname.
- `ingress.tls` — cert-manager or pre-issued secrets.

## Calibration env overrides (operator level)

Each v3 calibration coefficient can be overridden via env without code change:

```yaml
backend:
  env:
    AI_SC_ETA_PF: "0.18"      # override prefill efficiency
    AI_SC_ETA_DEC: "0.22"
    AI_SC_C_SAT: "8.0"        # back to v2 saturation
    AI_SC_T_OVERHEAD: "0.040" # higher latency overhead environment
```

These are read by `backend/settings.py` → `get_settings()`. They are declared but not yet
consumed by `sizing_service` (will be wired in subsequent v3 phases).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Pod stuck in `ImagePullBackOff` | Image not loaded into kind | Re-run `kind load docker-image ...` |
| Frontend renders but API calls fail | Wrong `REACT_APP_API_URL` baked into frontend image | Rebuild frontend with correct URL, reload, restart pod |
| Ingress 404 on `/` | nginx-ingress not running, or host mismatch in `/etc/hosts` | `kubectl get pods -n ingress-nginx`; check `/etc/hosts` |
| `helm install` hangs on Ready | Backend `livenessProbe` failing | `kubectl describe pod ...`; check `/healthz` reachable |

## Validate the chart locally

```bash
helm lint ./charts/ai-infra-calculator
helm template calc ./charts/ai-infra-calculator -f charts/ai-infra-calculator/values-kind.yaml | less
```
