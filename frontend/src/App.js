import React from 'react';
import Calculator from './components/Calculator';
import './App.css';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">AI Infrastructure Calculator</h1>
          <p className="text-lg text-gray-600">Find out how many servers and GPUs you need for your AI models</p>
        </header>

        <div className="max-w-6xl mx-auto">
          <Calculator />
        </div>
      </div>
    </div>
  );
}

export default App;