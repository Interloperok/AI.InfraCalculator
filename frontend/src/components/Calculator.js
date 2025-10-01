import React, { useState } from 'react';
import CalculatorForm from './CalculatorForm';
import ResultsDisplay from './ResultsDisplay';
import { calculateServerRequirements } from '../services/api';

const Calculator = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCalculate = async (inputData) => {
    setLoading(true);
    setError(null);
    
    const response = await calculateServerRequirements(inputData);
    
    if (response.error) {
      setError(response.error);
      setResults(null);
    } else {
      setResults(response);
      setError(null);
    }
    
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <CalculatorForm onSubmit={handleCalculate} loading={loading} />
      </div>
      
      <div className="bg-white rounded-xl shadow-lg p-6">
        <ResultsDisplay results={results} loading={loading} error={error} />
      </div>
    </div>
  );
};

export default Calculator;