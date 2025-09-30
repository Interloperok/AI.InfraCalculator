#!/bin/bash

curl -sS -X POST "http://localhost:8000/v1/size" \
  -H "Content-Type: application/json" \
  --data @payload.json | jq

curl -sS -X POST "http://localhost:8000/v1/whatif" \
  -H "Content-Type: application/json" \
  --data @whatif.json | jq
