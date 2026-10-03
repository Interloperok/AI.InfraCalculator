// Quantization options for the calculator forms.
// Source of truth: backend/core/methodology_constants.py (QUANTIZATION_FORMATS),
// exported to quantization.json by backend/scripts/export_methodology_constants.py.
import QUANTIZATION_FORMATS from "./quantization.json";

// One option per bytes/param value; labels sharing a value are joined
// ("FP16 / BF16 (2 B/param)").
export const QUANTIZATION_OPTIONS = Object.values(
  QUANTIZATION_FORMATS.reduce((acc, q) => {
    const key = String(q.bytes_per_param);
    if (!acc[key]) acc[key] = { labels: [], value: q.bytes_per_param };
    acc[key].labels.push(q.label);
    return acc;
  }, {}),
)
  .sort((a, b) => b.value - a.value)
  .map(({ labels, value }) => ({ label: `${labels.join(" / ")} (${value} B/param)`, value }));

export default QUANTIZATION_FORMATS;
