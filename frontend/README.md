# AI Server Calculator Frontend

This is a React application that provides a user interface for calculating AI server requirements based on the backend API.

## Features

- Interactive sliders for all configuration parameters
- Real-time calculation of server requirements
- Visual representation of results with charts
- Responsive design using Tailwind CSS

## Prerequisites

- Node.js (v14 or higher)
- Backend server running on http://localhost:8000

## Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will be available at http://localhost:3000

## Backend API

This frontend connects to the backend API at http://localhost:8000. Make sure the backend server is running before using the calculator.

The API endpoints used:
- POST /v1/size - Calculate server requirements
- POST /v1/whatif - Compare different scenarios (not yet implemented in frontend)
- GET /v1/healthz - Health check

## Components

- `CalculatorForm` - Contains all the sliders and input fields for configuration
- `ResultsDisplay` - Shows the calculation results with charts and metrics
- `App` - Main application component

## Technologies Used

- React
- Tailwind CSS
- Recharts for data visualization
- Axios for API communication
