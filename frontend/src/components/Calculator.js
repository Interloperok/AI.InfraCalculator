import React, { useState } from 'react';
import CalculatorForm from './CalculatorForm';
import ResultsDisplay from './ResultsDisplay';
import { calculateServerRequirements } from '../services/api';

const Calculator = () => {
  const [results, setResults] = useState(null);
  const [inputData, setInputData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCalculate = async (data) => {
    setLoading(true);
    setError(null);

    try {
      const response = await calculateServerRequirements(data);

      if (!response) {
        setError('No response from server. Check that the backend is running.');
        setResults(null);
        setInputData(null);
      } else if (response.error) {
        setError(response.error);
        setResults(null);
        setInputData(null);
      } else {
        // Merge input context into results so frontend always has it
        // (some fields may not be returned by older backend versions)
        const Z = data.tp_multiplier_Z || 1;
        const gpuPerInst = response.gpus_per_instance || 1;
        setResults({
          ...response,
          gpus_per_server: response.gpus_per_server ?? data.gpus_per_server,
          gpus_per_instance: response.gpus_per_instance ?? gpuPerInst,
          gpus_per_instance_tp: Z * gpuPerInst,
          instances_per_server_tp: response.instances_per_server_tp
            ?? Math.floor((data.gpus_per_server || 8) / (Z * gpuPerInst)),
          instance_total_mem_gb: response.instance_total_mem_gb
            ?? (Z * gpuPerInst * (data.gpu_mem_gb || 0)),
          kv_free_per_instance_tp_gb: response.kv_free_per_instance_tp_gb
            ?? Math.max(0, Z * gpuPerInst * (data.gpu_mem_gb || 0) * (data.kavail || 0.9) - (response.model_mem_gb || 0)),
        });
        setInputData(data);
        setError(null);
      }
    } catch (err) {
      setError(err.message || 'Unexpected error');
      setResults(null);
      setInputData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col">
        <CalculatorForm
          onSubmit={handleCalculate}
          loading={loading}
        />
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col">
        <ResultsDisplay results={results} loading={loading} error={error} inputData={inputData} />
      </div>
    </div>
  );
};

export default Calculator;
