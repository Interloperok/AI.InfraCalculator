import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { getGPUs } from '../services/api';

const GpuFilterModal = ({ isOpen, onClose, selectedGpuIds, onApply }) => {
  const [gpuCatalog, setGpuCatalog] = useState([]);
  const [loadingGpus, setLoadingGpus] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set(selectedGpuIds || []));

  // Load GPU catalog when modal opens (paginate through all pages)
  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set(selectedGpuIds || []));
    setSearch('');

    const load = async () => {
      setLoadingGpus(true);
      try {
        let allGpus = [];
        let page = 1;
        let hasNext = true;

        while (hasNext) {
          const data = await getGPUs({ per_page: 100, page });
          if (data && data.gpus) {
            allGpus = allGpus.concat(data.gpus);
            hasNext = data.has_next === true;
            page++;
          } else {
            hasNext = false;
          }
        }

        setGpuCatalog(allGpus);
      } catch (err) {
        console.error('Failed to load GPU catalog:', err);
      } finally {
        setLoadingGpus(false);
      }
    };
    load();
  }, [isOpen, selectedGpuIds]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const filteredGpus = gpuCatalog.filter((gpu) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = (gpu.full_name || `${gpu.vendor} ${gpu.model}`).toLowerCase();
    return name.includes(q);
  });

  const toggleGpu = useCallback((gpuId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gpuId)) {
        next.delete(gpuId);
      } else {
        next.add(gpuId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = () => {
    setSelected(new Set(filteredGpus.map((g) => g.id)));
  };

  const handleClear = () => {
    setSelected(new Set());
  };

  const handleApply = () => {
    onApply(Array.from(selected));
    onClose();
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh] overflow-hidden animate-in fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              GPU Filter
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Select GPUs to include in optimization search</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search + controls */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GPUs..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
            autoFocus
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Select All ({filteredGpus.length})
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>
            <span className="text-xs text-gray-400">
              {selected.size} selected
            </span>
          </div>
        </div>

        {/* GPU List */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {loadingGpus ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          ) : filteredGpus.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              No GPUs match your search
            </div>
          ) : (
            <div className="space-y-1">
              {filteredGpus.map((gpu) => {
                const isChecked = selected.has(gpu.id);
                const name = gpu.full_name || `${gpu.vendor} ${gpu.model}`;
                return (
                  <label
                    key={gpu.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isChecked ? 'bg-purple-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleGpu(gpu.id)}
                      className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{name}</div>
                      <div className="text-xs text-gray-400">
                        {gpu.memory_gb} GB
                        {gpu.tflops ? ` | ${gpu.tflops} TFLOPS` : ''}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
          >
            Apply{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GpuFilterModal;
