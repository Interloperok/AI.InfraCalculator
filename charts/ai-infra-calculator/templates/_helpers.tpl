{{/*
Expand the name of the chart.
*/}}
{{- define "ai-infra-calculator.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name. Truncated at 63 chars (DNS naming spec).
*/}}
{{- define "ai-infra-calculator.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Chart name and version (used as label).
*/}}
{{- define "ai-infra-calculator.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "ai-infra-calculator.labels" -}}
helm.sh/chart: {{ include "ai-infra-calculator.chart" . }}
app.kubernetes.io/name: {{ include "ai-infra-calculator.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels for backend.
*/}}
{{- define "ai-infra-calculator.backendSelectorLabels" -}}
app.kubernetes.io/name: {{ include "ai-infra-calculator.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: backend
{{- end -}}

{{/*
Selector labels for frontend.
*/}}
{{- define "ai-infra-calculator.frontendSelectorLabels" -}}
app.kubernetes.io/name: {{ include "ai-infra-calculator.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end -}}

{{/*
Backend full name (release-scoped).
*/}}
{{- define "ai-infra-calculator.backendFullname" -}}
{{- printf "%s-backend" (include "ai-infra-calculator.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Frontend full name (release-scoped).
*/}}
{{- define "ai-infra-calculator.frontendFullname" -}}
{{- printf "%s-frontend" (include "ai-infra-calculator.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

